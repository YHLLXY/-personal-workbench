import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// vi.mock 工厂在模块导入期即执行（早于测试文件主体），故共享状态必须用 vi.hoisted 定义
const { insertCalls, upsertCalls, deleteCalls, updateCalls, mockTable, setRows } = vi.hoisted(() => {
  const insertCalls: Array<Record<string, unknown>> = []
  const upsertCalls: Array<{ table: string; payload: unknown }> = []
  const deleteCalls: Array<{ table: string; column: string; value: unknown }> = []
  const updateCalls: Array<{ table: string; payload: Record<string, unknown>; where: { column: string; value: unknown } }> = []
  // select 链返回的行数据，按表名区分
  let rowsByName: Record<string, Array<Record<string, unknown>>> = {}
  function mockTable(name: string) {
    const rows = rowsByName[name] ?? []
    return {
      // select('*') 直接 await 或 .order(...) / .maybeSingle() 均返回 { data, error }（list 查询 / getChannelConfigs / listPushSubscriptions）
      select: vi.fn(() => ({
        data: rows,
        error: null,
        order: vi.fn(() => ({ data: rows, error: null })),
        single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
        maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
      })),
      // 链式调用：insert(payload).select().single() —— single() 解析为 { data, error }
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertCalls.push(payload)
        return { select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { ...payload }, error: null }) })) }
      }),
      // update(payload).eq(col, val).select().single()：记录 where 条件供断言
      update: vi.fn((payload: Record<string, unknown>) => {
        const rec: { table: string; payload: Record<string, unknown>; where: { column: string; value: unknown } } = { table: name, payload, where: { column: '', value: null } }
        updateCalls.push(rec)
        return {
          eq: (col: string, val: unknown) => {
            rec.where = { column: col, value: val }
            return { select: () => ({ single: vi.fn().mockResolvedValue({ data: { ...payload }, error: null }) }) }
          },
        }
      }),
      upsert: vi.fn((payload: unknown) => {
        upsertCalls.push({ table: name, payload })
        // 链式对象：upsert().select().single()（upsertReview）与直接 await 解构 { error }（saveSubscriptions）都兼容
        // 注意：Promise 上的 .select 是 undefined 会被误判为「不带链」——这里必须返回对象而非 Promise
        return { select: () => ({ single: vi.fn().mockResolvedValue({ data: payload, error: null }) }) }
      }),
      delete: vi.fn(() => {
        const rec: { table: string; column: string; value: unknown } = { table: name, column: '', value: null }
        deleteCalls.push(rec)
        // 同时支持 importAll 的 delete().neq('id','') 与现有 deleteTask 的 delete().eq('id', x)
        return {
          neq: (col: string, val: unknown) => { rec.column = col; rec.value = val; return Promise.resolve({ error: null }) },
          eq: (col: string, val: unknown) => { rec.column = col; rec.value = val; return Promise.resolve({ error: null }) },
        }
      }),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
    }
  }
  return {
    insertCalls, upsertCalls, deleteCalls, updateCalls,
    mockTable,
    setRows: (name: string, r: Array<Record<string, unknown>>) => { rowsByName[name] = r },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn((name: string) => mockTable(name)), auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'u1' } }, error: null }) } }) as unknown as SupabaseClient),
}))

import { SupabaseRepository } from '../src/lib/db/supabase-repository'

describe('SupabaseRepository', () => {
  let repo: SupabaseRepository
  beforeEach(() => { insertCalls.length = 0; upsertCalls.length = 0; deleteCalls.length = 0; updateCalls.length = 0; repo = new SupabaseRepository() })

  it('upsertReview 载荷使用 snake_case 列名（plan_tomorrow，2026-08-08 线上保存失败回归）', async () => {
    await repo.upsertReview('2026-08-08', { mood: 4, summary: '今天不错', planTomorrow: '继续加油' })
    const payload = upsertCalls[0].payload as Record<string, unknown>
    expect(payload).toHaveProperty('plan_tomorrow', '继续加油')
    expect(payload).toHaveProperty('review_date', '2026-08-08')
    expect(payload).toHaveProperty('mood', 4)
    expect(payload).toHaveProperty('summary', '今天不错')
    expect(payload).not.toHaveProperty('planTomorrow')
    expect(payload).toHaveProperty('id')
  })

  it('createPaper 载荷使用 snake_case 列名', async () => {
    await repo.createPaper({ title: 't', authors: 'a', arxivId: '2401.1', url: 'https://arxiv.org/abs/2401.1', status: 'want', rating: null, note: null })
    const payload = insertCalls[0]
    expect(payload).toHaveProperty('arxiv_id', '2401.1')
    expect(payload).not.toHaveProperty('arxivId')
    expect(payload).toHaveProperty('id')
  })

  describe('folders', () => {
    it('listFolders 映射行到 Folder（snake_case）', async () => {
      setRows('wb_folders', [{ id: 'f1', name: '机器学习', parent_id: null, sort: 1, created_at: '2026-08-01T00:00:00.000Z' }])
      const folders = await repo.listFolders()
      expect(folders[0]).toEqual({ id: 'f1', name: '机器学习', parentId: null, sort: 1 })
    })

    it('createFolder 提交载荷含 name/parent_id', async () => {
      const f = await repo.createFolder({ name: 'A' })
      const payload = insertCalls[0]
      expect(payload).toHaveProperty('name', 'A')
      expect(payload).toHaveProperty('parent_id', null)
      expect(payload).toHaveProperty('id')
      expect(f.id).toBeTruthy()
      expect(f.name).toBe('A')
      expect(f.parentId).toBeNull()
    })
  })

  describe('papers 新字段', () => {
    it('paperFromRow 映射 type/folder_id/tags/content/summary/keywords/source', async () => {
      setRows('wb_papers', [{ id: 'p1', title: 't', authors: 'a', arxiv_id: null, url: 'https://example.com/v', status: 'want', rating: null, note: null, created_at: '2026-08-01T00:00:00.000Z', type: 'note', folder_id: 'f1', tags: ['口播'], content: '大家好，今天聊聊。', summary: '{"title":"AI"}', keywords: ['AI'], source: 'douyin' }])
      const papers = await repo.listPapers()
      expect(papers[0].type).toBe('note')
      expect(papers[0].folderId).toBe('f1')
      expect(papers[0].tags).toEqual(['口播'])
      expect(papers[0].content).toBe('大家好，今天聊聊。')
      expect(papers[0].summary).toBe('{"title":"AI"}')
      expect(papers[0].keywords).toEqual(['AI'])
      expect(papers[0].source).toBe('douyin')
    })
  })

  describe('exportAll / importAll', () => {
    it('exportAll 拉全 10 张表并映射为领域对象', async () => {
      setRows('wb_tasks', [{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', due_date: null, tags: [], sort: 1, completed_at: null, created_at: '2026-08-01T00:00:00.000Z' }])
      setRows('wb_folders', [{ id: 'f1', name: '机器学习', parent_id: null, sort: 1 }])
      setRows('wb_papers', [{ id: 'p1', title: '论文', authors: 'a', arxiv_id: null, url: null, status: 'want', rating: null, note: null, created_at: '2026-08-01T00:00:00.000Z' }])
      const tables = await repo.exportAll()
      expect(tables.tasks[0].title).toBe('任务')
      expect(tables.folders[0]).toEqual({ id: 'f1', name: '机器学习', parentId: null, sort: 1 })
      expect(tables.papers[0].type).toBe('paper')
    })

    it('importAll 每表先 delete().neq(id) 清空再 upsert，载荷 snake_case', async () => {
      await repo.importAll({
        tasks: [{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', dueDate: null, dueTime: null, tags: [], sort: 1, completedAt: null, createdAt: '2026-08-01T00:00:00.000Z' }],
        habits: [], habitLogs: [], focusSessions: [], exams: [], notes: [], papers: [], folders: [], healthLogs: [], reviews: [],
      })
      // 每张表都先清空
      expect(deleteCalls.length).toBe(10)
      expect(deleteCalls[0]).toEqual({ table: 'wb_tasks', column: 'id', value: '' })
      // tasks 表 upsert 载荷是 snake_case 列名
      const tasksUpsert = upsertCalls.find(u => u.table === 'wb_tasks')
      expect(tasksUpsert?.payload).toEqual([{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', due_date: null, due_time: null, tags: [], sort: 1, completed_at: null, created_at: '2026-08-01T00:00:00.000Z' }])
      // 只有 tasks 有数据 → 只有 1 次 upsert（其余 9 张空表只清空不写入）
      expect(upsertCalls.length).toBe(1)
    })
  })
})

describe('定时提醒（2026-08-08）', () => {
  let repo: SupabaseRepository
  beforeEach(() => { insertCalls.length = 0; upsertCalls.length = 0; deleteCalls.length = 0; updateCalls.length = 0; repo = new SupabaseRepository() })

  it('taskFromRow 映射 dueTime', async () => {
    setRows('wb_tasks', [{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', due_date: '2026-08-08', due_time: '09:30', tags: [], sort: 1, completed_at: null, created_at: '2026-08-01T00:00:00.000Z' }])
    const tasks = await repo.listTasks()
    expect(tasks[0].dueTime).toBe('09:30')
  })

  it('examFromRow 映射 examTime', async () => {
    setRows('wb_exams', [{ id: 'e1', title: '四级', exam_date: '2026-08-10', exam_time: '09:00', subject: null, note: null, created_at: '2026-08-01T00:00:00.000Z' }])
    const exams = await repo.listExams()
    expect(exams[0].examTime).toBe('09:00')
  })

  it('listReminders 映射行（snake_case → camelCase）', async () => {
    setRows('wb_reminders', [{ id: 'r1', user_id: 'u1', ref_type: 'task', ref_id: 't1', kind: 'due', scheduled_at: '2026-08-08T01:30:00.000Z', sent_at: null, dismissed_at: null, created_at: '2026-08-08T00:00:00.000Z' }])
    const reminders = await repo.listReminders()
    expect(reminders[0]).toEqual({ id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: '2026-08-08T01:30:00.000Z', sentAt: null, dismissedAt: null, createdAt: '2026-08-08T00:00:00.000Z' })
  })

  it('dismissReminder 调 update 置 dismissed_at（非 null）', async () => {
    await repo.dismissReminder('r1')
    expect(updateCalls.length).toBe(1)
    const call = updateCalls[0]
    expect(call.table).toBe('wb_reminders')
    expect(call.payload).toHaveProperty('dismissed_at')
    expect(call.payload.dismissed_at).not.toBeNull()
    expect(call.where).toEqual({ column: 'id', value: 'r1' })
  })

  it('restoreReminder 调 update 置 dismissed_at: null', async () => {
    await repo.restoreReminder('r1')
    expect(updateCalls.length).toBe(1)
    const call = updateCalls[0]
    expect(call.table).toBe('wb_reminders')
    expect(call.payload).toEqual({ dismissed_at: null })
    expect(call.where).toEqual({ column: 'id', value: 'r1' })
  })

  it('savePushSubscription 载荷 snake_case 且带 id（endpoint 幂等）', async () => {
    await repo.savePushSubscription({ endpoint: 'https://push.example/1', keysP256dh: 'p256', keysAuth: 'auth', userAgent: 'test' })
    const payload = upsertCalls[0].payload as Record<string, unknown>
    expect(payload).toHaveProperty('endpoint', 'https://push.example/1')
    expect(payload).toHaveProperty('keys_p256dh', 'p256')
    expect(payload).toHaveProperty('keys_auth', 'auth')
    expect(payload).toHaveProperty('user_agent', 'test')
    expect(payload).not.toHaveProperty('keysP256dh')
    expect(payload).toHaveProperty('id')
    expect(upsertCalls[0].table).toBe('wb_push_subscriptions')
  })

  it('removePushSubscription 按 endpoint 删除', async () => {
    await repo.removePushSubscription('https://push.example/1')
    expect(deleteCalls[0]).toEqual({ table: 'wb_push_subscriptions', column: 'endpoint', value: 'https://push.example/1' })
  })

  it('listPushSubscriptions 映射行（keys_p256dh/keys_auth/user_agent → camelCase）', async () => {
    setRows('wb_push_subscriptions', [{ id: 's1', endpoint: 'https://push.example/1', keys_p256dh: 'p256', keys_auth: 'auth', user_agent: 'test-ua', created_at: '2026-08-08T00:00:00.000Z' }])
    const subs = await repo.listPushSubscriptions()
    expect(subs).toHaveLength(1)
    expect(subs[0]).toEqual({ id: 's1', endpoint: 'https://push.example/1', keysP256dh: 'p256', keysAuth: 'auth', userAgent: 'test-ua', createdAt: '2026-08-08T00:00:00.000Z' })
  })

  it('getChannelConfigs 无行时返回空配置', async () => {
    const c = await repo.getChannelConfigs()
    expect(c).toEqual({ serverchanKey: null })
  })

  it('getChannelConfigs 有行时返回 serverchanKey', async () => {
    setRows('wb_channel_configs', [{ user_id: 'u1', serverchan_key: 'SCU123' }])
    const c = await repo.getChannelConfigs()
    expect(c).toEqual({ serverchanKey: 'SCU123' })
  })

  it('saveChannelConfigs 载荷 snake_case 带 user_id', async () => {
    await repo.saveChannelConfigs({ serverchanKey: 'SCUxxx' })
    const payload = upsertCalls[0].payload as Record<string, unknown>
    expect(payload).toHaveProperty('serverchan_key', 'SCUxxx')
    expect(payload).toHaveProperty('user_id')
    expect(payload).not.toHaveProperty('serverchanKey')
  })
})
