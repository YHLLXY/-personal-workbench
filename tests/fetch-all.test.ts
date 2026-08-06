import { describe, it, expect, vi, afterEach } from 'vitest'
import { fetchAll } from '../api/hot'
import type { HotSource } from '../api/hot'

const src = (id: string, rows: { title: string; url: string }[] = []): HotSource =>
  ({ id, name: id, category: 'tech', fetch: vi.fn(async () => rows) })

afterEach(() => { vi.restoreAllMocks() })

describe('fetchAll', () => {
  it('并发抓取并合并结果，附带源 id 与分类', async () => {
    const a = src('a', [{ title: 'A1', url: 'https://a/1' }])
    const b = src('b', [{ title: 'B1', url: 'https://b/1' }])
    const out = await fetchAll([a, b])
    expect(out).toEqual([
      { title: 'A1', source: 'a', url: 'https://a/1', category: 'tech' },
      { title: 'B1', source: 'b', url: 'https://b/1', category: 'tech' },
    ])
  })
  it('单源失败静默跳过，不影响其他源', async () => {
    const bad: HotSource = { id: 'bad', name: 'bad', category: 'tech', fetch: vi.fn(async () => { throw new Error('boom') }) }
    const good = src('good', [{ title: 'G', url: 'https://g' }])
    const out = await fetchAll([bad, good])
    expect(out).toEqual([{ title: 'G', source: 'good', url: 'https://g', category: 'tech' }])
  })
  it('每源最多 perSource 条', async () => {
    const many = src('m', Array.from({ length: 20 }, (_, i) => ({ title: `M${i}`, url: `https://m/${i}` })))
    const out = await fetchAll([many], { perSource: 3 })
    expect(out.length).toBe(3)
  })
  it('总量不超过 maxTotal', async () => {
    const out = await fetchAll([src('x', [{ title: 'X1', url: 'u' }]), src('y', [{ title: 'Y1', url: 'u' }])], { maxTotal: 1 })
    expect(out.length).toBe(1)
  })
  it('超时中止：fetch 一直挂起时在 timeoutMs 后返回空', async () => {
    const hanging: HotSource = { id: 'h', name: 'h', category: 'tech', fetch: vi.fn((signal?: AbortSignal) => new Promise<never>((_res, rej) => {
      signal?.addEventListener('abort', () => rej(new Error('aborted')))
    })) }
    const out = await fetchAll([hanging], { timeoutMs: 100 })
    expect(out).toEqual([])
  })
})
