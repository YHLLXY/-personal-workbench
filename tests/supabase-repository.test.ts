import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// vi.mock 工厂在模块导入期即执行（早于测试文件主体），故共享状态必须用 vi.hoisted 定义
const { insertCalls, mockTable, setRows } = vi.hoisted(() => {
  const insertCalls: Array<Record<string, unknown>> = []
  // select 链（listFolders / listPapers 等 list 查询）返回的可配置行数据
  let rows: Array<Record<string, unknown>> = []
  function mockTable(_name: string) {
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
      upsert: vi.fn().mockResolvedValue({ error: null }),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
    }
  }
  return { insertCalls, mockTable, setRows: (r: Array<Record<string, unknown>>) => { rows = r } }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn((name: string) => mockTable(name)) }) as unknown as SupabaseClient),
}))

import { SupabaseRepository } from '../src/lib/db/supabase-repository'

describe('SupabaseRepository', () => {
  let repo: SupabaseRepository
  beforeEach(() => { insertCalls.length = 0; repo = new SupabaseRepository() })

  it('createPaper 载荷使用 snake_case 列名', async () => {
    await repo.createPaper({ title: 't', authors: 'a', arxivId: '2401.1', url: 'https://arxiv.org/abs/2401.1', status: 'want', rating: null, note: null })
    const payload = insertCalls[0]
    expect(payload).toHaveProperty('arxiv_id', '2401.1')
    expect(payload).not.toHaveProperty('arxivId')
    expect(payload).toHaveProperty('id')
  })

  describe('folders', () => {
    it('listFolders 映射行到 Folder（snake_case）', async () => {
      setRows([{ id: 'f1', name: '机器学习', parent_id: null, sort: 1, created_at: '2026-08-01T00:00:00.000Z' }])
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
      setRows([{ id: 'p1', title: 't', authors: 'a', arxiv_id: null, url: 'https://example.com/v', status: 'want', rating: null, note: null, created_at: '2026-08-01T00:00:00.000Z', type: 'note', folder_id: 'f1', tags: ['口播'], content: '大家好，今天聊聊。', summary: '{"title":"AI"}', keywords: ['AI'], source: 'douyin' }])
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
})
