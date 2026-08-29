import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { localDateOfISO, type BackupTables } from '../src/lib/db/types'

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
      select: vi.fn(() => {
        const sorts: Array<{ col: string; asc: boolean }> = []
        const sorted = () => {
          const cmp = (a: Record<string, unknown>, b: Record<string, unknown>, col: string) => {
            const av = a[col] ?? '', bv = b[col] ?? ''
            return typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv))
          }
          let out = [...rows]
          for (const { col, asc } of [...sorts].reverse()) out = out.sort((a, b) => (asc ? cmp(a, b, col) : -cmp(a, b, col)))
          return out
        }
        const node = {
          order: vi.fn((col: string, o?: { ascending?: boolean }) => { sorts.push({ col, asc: o?.ascending !== false }); return node }),
          then: (res?: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve({ data: sorted(), error: null }).then(res, rej),
          single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
        }
        return node
      }),
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

  it('upsertReview 载荷包含丰富字段（成就/反思/感恩/收获/评分）', async () => {
    await repo.upsertReview('2026-08-13', { mood: 5, achievements: 'A', reflection: 'R', gratitude: 'G', learnings: 'L', summary: 'S', planTomorrow: 'P', score: 8 })
    const payload = upsertCalls[0].payload as Record<string, unknown>
    expect(payload).toHaveProperty('achievements', 'A')
    expect(payload).toHaveProperty('reflection', 'R')
    expect(payload).toHaveProperty('gratitude', 'G')
    expect(payload).toHaveProperty('learnings', 'L')
    expect(payload).toHaveProperty('score', 8)
  })

  it('reviewFromRow 映射新字段；旧行缺列 ?? 兜底不崩溃', async () => {
    setRows('wb_reviews', [{ id: 'r1', review_date: '2026-08-13', mood: 5, achievements: 'A', reflection: 'R', gratitude: 'G', learnings: 'L', summary: 'S', plan_tomorrow: 'P', score: 9, updated_at: '2026-08-13T12:00:00.000Z' }])
    const [r] = await repo.listReviews()
    expect(r.achievements).toBe('A')
    expect(r.reflection).toBe('R')
    expect(r.gratitude).toBe('G')
    expect(r.learnings).toBe('L')
    expect(r.score).toBe(9)

    // 迁移前老行：无新列值 → '' / null
    setRows('wb_reviews', [{ id: 'r0', review_date: '2026-08-01', mood: 3, summary: '旧', plan_tomorrow: '', updated_at: '2026-08-01T12:00:00.000Z' }])
    const [old] = await repo.listReviews()
    expect(old.achievements).toBe('')
    expect(old.reflection).toBe('')
    expect(old.gratitude).toBe('')
    expect(old.learnings).toBe('')
    expect(old.score).toBeNull()
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
    it('exportAll 拉全 11 张表并映射为领域对象', async () => {
      setRows('wb_tasks', [{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', due_date: null, tags: [], sort: 1, completed_at: null, created_at: '2026-08-01T00:00:00.000Z' }])
      setRows('wb_folders', [{ id: 'f1', name: '机器学习', parent_id: null, sort: 1 }])
      setRows('wb_papers', [{ id: 'p1', title: '论文', authors: 'a', arxiv_id: null, url: null, status: 'want', rating: null, note: null, created_at: '2026-08-01T00:00:00.000Z' }])
      setRows('wb_study_goals', [{ id: 'g1', title: '背单词', target: 50, progress: 20, deadline: null, status: 'active', note: null, created_at: '2026-08-01T00:00:00.000Z' }])
      const tables = await repo.exportAll()
      expect(tables.tasks[0].title).toBe('任务')
      expect(tables.folders[0]).toEqual({ id: 'f1', name: '机器学习', parentId: null, sort: 1 })
      expect(tables.papers[0].type).toBe('paper')
      expect(tables.studyGoals).toHaveLength(1)
      expect(tables.studyGoals[0].title).toBe('背单词')
    })

    it('importAll 每表先 delete().neq(id) 清空再 upsert，载荷 snake_case', async () => {
      await repo.importAll({
        tasks: [{ id: 't1', title: '任务', focus: false, focusDate: null, priority: 'low', status: 'todo', dueDate: null, dueTime: null, tags: [], sort: 1, completedAt: null, createdAt: '2026-08-01T00:00:00.000Z' }],
        habits: [], habitLogs: [], focusSessions: [], exams: [], studyGoals: [], notes: [], papers: [], folders: [], healthLogs: [], reviews: [], growthActions: [],
      })
      // 每张表都先清空（v1.7 起 12 张表，含 wb_growth_actions）
      expect(deleteCalls.length).toBe(12)
      expect(deleteCalls[0]).toEqual({ table: 'wb_tasks', column: 'id', value: '' })
      // tasks 表 upsert 载荷是 snake_case 列名
      const tasksUpsert = upsertCalls.find(u => u.table === 'wb_tasks')
      expect(tasksUpsert?.payload).toEqual([{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', due_date: null, due_time: null, focus_date: null, tags: [], sort: 1, completed_at: null, created_at: '2026-08-01T00:00:00.000Z' }])
      // 只有 tasks 有数据 → 只有 1 次 upsert（其余 10 张空表只清空不写入）
      expect(upsertCalls.length).toBe(1)
    })

    it('importAll 兼容旧备份：缺 studyGoals key 时按空表处理不报错', async () => {
      // 旧备份文件没有 studyGoals key（10 张表）——tables[key] ?? [] 守卫必须兜住
      const legacy = {
        tasks: [], habits: [], habitLogs: [], focusSessions: [], exams: [], notes: [], papers: [], folders: [], healthLogs: [], reviews: [],
      } as unknown as BackupTables
      await repo.importAll(legacy)
      expect(deleteCalls.length).toBe(12)
      expect(upsertCalls.length).toBe(0)
    })

    it('studyGoals 备份映射：createStudyGoal 载荷 + goalFromRow', async () => {
      const g = await repo.createStudyGoal({ title: '刷题 100', target: 100, deadline: '2026-09-01', note: '每天 5 题' })
      const payload = insertCalls[0]
      expect(payload).toHaveProperty('target', 100)
      expect(payload).toHaveProperty('progress', 0)
      expect(payload).toHaveProperty('status', 'active')
      expect(payload).toHaveProperty('deadline', '2026-09-01')
      expect(g.title).toBe('刷题 100')
      expect(g.status).toBe('active')
      expect(g.progress).toBe(0)

      setRows('wb_study_goals', [{ id: 'g1', title: '背单词', target: 50, progress: 20, deadline: '2026-08-20', status: 'done', note: null, created_at: '2026-08-01T00:00:00.000Z' }])
      const [row] = await repo.listStudyGoals()
      expect(row).toEqual({ id: 'g1', title: '背单词', target: 50, progress: 20, deadline: '2026-08-20', status: 'done', note: null, completedAt: null })

      await repo.updateStudyGoal('g1', { progress: 21 })
      expect(updateCalls[0].payload).toHaveProperty('progress', 21)
      expect(updateCalls[0].payload).toHaveProperty('status', undefined)
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

  it('taskFromRow 映射 focus_date（焦点绑定日期）', async () => {
    setRows('wb_tasks', [{ id: 't1', title: '任务', focus: true, priority: 'low', status: 'todo', due_date: '2026-08-08', due_time: null, focus_date: '2026-08-08', tags: [], sort: 1, completed_at: null, created_at: '2026-08-01T00:00:00.000Z' }])
    const tasks = await repo.listTasks()
    expect(tasks[0].focusDate).toBe('2026-08-08')
  })

  it('旧行 focus=true 无 focus_date 时按创建日惰性迁移（本地时区）', async () => {
    setRows('wb_tasks', [{ id: 't1', title: '任务', focus: true, priority: 'low', status: 'todo', due_date: null, due_time: null, tags: [], sort: 1, completed_at: null, created_at: '2026-08-04T02:00:00.000Z' }])
    const tasks = await repo.listTasks()
    expect(tasks[0].focusDate).toBe(localDateOfISO('2026-08-04T02:00:00.000Z'))
  })

  it('非焦点任务 focus_date 缺省映射为 null', async () => {
    setRows('wb_tasks', [{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', due_date: null, due_time: null, tags: [], sort: 1, completed_at: null, created_at: '2026-08-01T00:00:00.000Z' }])
    const tasks = await repo.listTasks()
    expect(tasks[0].focusDate).toBeNull()
  })

  it('updateTask 载荷含 focus_date（snake_case）', async () => {
    await repo.updateTask('t1', { focusDate: '2026-08-08' })
    expect(updateCalls[0].payload).toHaveProperty('focus_date', '2026-08-08')
  })

  it('createTask 载荷含 focus_date（缺省 null）', async () => {
    await repo.createTask({ title: 'x', focus: true, focusDate: '2026-08-08' })
    expect(insertCalls[0]).toHaveProperty('focus_date', '2026-08-08')
    await repo.createTask({ title: 'y' })
    expect(insertCalls[1]).toHaveProperty('focus_date', null)
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
