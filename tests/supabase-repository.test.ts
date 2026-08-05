import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// vi.mock 工厂在模块导入期即执行（早于测试文件主体），故共享状态必须用 vi.hoisted 定义
const { insertCalls, upsertCalls, deleteCalls, mockTable, setRows } = vi.hoisted(() => {
  const insertCalls: Array<Record<string, unknown>> = []
  const upsertCalls: Array<{ table: string; payload: unknown }> = []
  const deleteCalls: Array<{ table: string; column: string; value: unknown }> = []
  // select 链返回的行数据，按表名区分
  let rowsByName: Record<string, Array<Record<string, unknown>>> = {}
  function mockTable(name: string) {
    const rows = rowsByName[name] ?? []
    return {
      // select('*').order(...) -> { data, error }（list 查询）；update().eq().select().single() 也走这里
      select: vi.fn(() => ({
        order: vi.fn(() => ({ data: rows, error: null })),
        single: vi.fn().mockResolvedValue({ data: rows[0] ?? null, error: null }),
      })),
      // 链式调用：insert(payload).select().single() —— single() 解析为 { data, error }
      insert: vi.fn((payload: Record<string, unknown>) => {
        insertCalls.push(payload)
        return { select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { ...payload }, error: null }) })) }
      }),
      update: vi.fn().mockReturnThis(),
      upsert: vi.fn((payload: unknown) => { upsertCalls.push({ table: name, payload }); return Promise.resolve({ error: null }) }),
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
    insertCalls, upsertCalls, deleteCalls,
    mockTable,
    setRows: (name: string, r: Array<Record<string, unknown>>) => { rowsByName[name] = r },
  }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn((name: string) => mockTable(name)) }) as unknown as SupabaseClient),
}))

import { SupabaseRepository } from '../src/lib/db/supabase-repository'

describe('SupabaseRepository', () => {
  let repo: SupabaseRepository
  beforeEach(() => { insertCalls.length = 0; upsertCalls.length = 0; deleteCalls.length = 0; repo = new SupabaseRepository() })

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
        tasks: [{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', dueDate: null, tags: [], sort: 1, completedAt: null, createdAt: '2026-08-01T00:00:00.000Z' }],
        habits: [], habitLogs: [], focusSessions: [], exams: [], notes: [], papers: [], folders: [], healthLogs: [], reviews: [],
      })
      // 每张表都先清空
      expect(deleteCalls.length).toBe(10)
      expect(deleteCalls[0]).toEqual({ table: 'wb_tasks', column: 'id', value: '' })
      // tasks 表 upsert 载荷是 snake_case 列名
      const tasksUpsert = upsertCalls.find(u => u.table === 'wb_tasks')
      expect(tasksUpsert?.payload).toEqual([{ id: 't1', title: '任务', focus: false, priority: 'low', status: 'todo', due_date: null, tags: [], sort: 1, completed_at: null, created_at: '2026-08-01T00:00:00.000Z' }])
      // 只有 tasks 有数据 → 只有 1 次 upsert（其余 9 张空表只清空不写入）
      expect(upsertCalls.length).toBe(1)
    })
  })
})
