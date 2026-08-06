import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LocalRepository } from '../src/lib/db/local-repository'
import { SupabaseRepository } from '../src/lib/db/supabase-repository'
import type { Subscriptions } from '../src/lib/db/types'

describe('LocalRepository subscriptions', () => {
  let repo: LocalRepository
  beforeEach(() => { localStorage.clear(); repo = new LocalRepository() })

  it('无数据时返回默认值（空源 = 全部源）', async () => {
    expect(await repo.getSubscriptions()).toEqual({ sourceIds: [], topics: [] })
  })
  it('保存后能读回', async () => {
    const s: Subscriptions = { sourceIds: ['github', 'arxiv-ai'], topics: ['考研', 'LLM'] }
    await repo.saveSubscriptions(s)
    expect(await repo.getSubscriptions()).toEqual(s)
  })
  it('损坏的 localStorage 数据返回默认值不崩溃', async () => {
    localStorage.setItem('wb:subscriptions', 'not-json{{{')
    expect(await repo.getSubscriptions()).toEqual({ sourceIds: [], topics: [] })
  })
})

describe('SupabaseRepository subscriptions', () => {
  let repo: SupabaseRepository
  const store = new Map<string, Record<string, unknown>>()
  const fakeClient = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'u1' } }, error: null })) },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({ maybeSingle: vi.fn(async () => ({ data: store.get(table) ?? null, error: null })) })),
      upsert: vi.fn(async (row: Record<string, unknown>) => { store.set(table, { ...store.get(table), ...row }); return { data: null, error: null } }),
    })),
  }

  beforeEach(async () => {
    store.clear()
    vi.resetModules()
    vi.doMock('../src/lib/db/supabase-client', () => ({ getSupabaseClient: () => fakeClient }))
    const { SupabaseRepository: Repo } = await import('../src/lib/db/supabase-repository')
    repo = new Repo()
  })

  it('无记录时返回默认值', async () => {
    expect(await repo.getSubscriptions()).toEqual({ sourceIds: [], topics: [] })
  })
  it('保存后能读回（upsert 到 wb_subscriptions）', async () => {
    const s: Subscriptions = { sourceIds: ['github'], topics: ['LLM'] }
    await repo.saveSubscriptions(s)
    expect(store.get('wb_subscriptions')).toMatchObject({ source_ids: ['github'], topics: ['LLM'], user_id: 'u1' })
    expect(await repo.getSubscriptions()).toEqual(s)
  })
})
