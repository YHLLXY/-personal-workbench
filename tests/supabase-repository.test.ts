import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

// vi.mock 工厂在模块导入期即执行（早于测试文件主体），故共享状态必须用 vi.hoisted 定义
const { insertCalls, mockTable } = vi.hoisted(() => {
  const insertCalls: Array<Record<string, unknown>> = []
  function mockTable(_name: string) {
    return {
      select: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
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
  return { insertCalls, mockTable }
})

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({ from: vi.fn((name: string) => mockTable(name)) }) as unknown as SupabaseClient),
}))

import { SupabaseRepository } from '../src/lib/db/supabase-repository'

describe('SupabaseRepository', () => {
  let repo: SupabaseRepository
  beforeEach(() => { insertCalls.length = 0; repo = new SupabaseRepository('https://x.supabase.co', 'anon-key') })

  it('createPaper 载荷使用 snake_case 列名', async () => {
    await repo.createPaper({ title: 't', authors: 'a', arxivId: '2401.1', url: 'https://arxiv.org/abs/2401.1', status: 'want', rating: null, note: null })
    const payload = insertCalls[0]
    expect(payload).toHaveProperty('arxiv_id', '2401.1')
    expect(payload).not.toHaveProperty('arxivId')
    expect(payload).toHaveProperty('id')
  })
})
