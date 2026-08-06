import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { loadHot, isCacheFresh, filterByTopics, filterBySources, formatFetchedAt, HOT_TTL_MS, type HotCache } from '../src/lib/hot'

const proxyOk = (items = [{ title: 'P1', source: 'github', url: 'https://p/1', category: 'tech' }]) => ({
  ok: true, status: 200,
  json: async () => ({ items, sources: [{ id: 'github', name: 'GitHub 热门新库', category: 'tech' }], fetchedAt: '2026-08-05T06:00:00.000Z' }),
})

describe('isCacheFresh', () => {
  it('新鲜缓存返回 true', () => {
    const c: HotCache = { fetchedAt: new Date(Date.now() - 1000).toISOString(), items: [], sources: [] }
    expect(isCacheFresh(c)).toBe(true)
  })
  it('超过 TTL 返回 false', () => {
    const c: HotCache = { fetchedAt: new Date(Date.now() - HOT_TTL_MS - 1000).toISOString(), items: [], sources: [] }
    expect(isCacheFresh(c)).toBe(false)
  })
  it('null / 非法时间返回 false', () => {
    expect(isCacheFresh(null)).toBe(false)
    expect(isCacheFresh({ fetchedAt: 'not-a-date', items: [], sources: [] })).toBe(false)
  })
})

describe('filterByTopics', () => {
  const items = [
    { title: 'LLM 新论文发布', source: 'arxiv-ai', url: 'u', category: 'academic' as const },
    { title: 'V2EX: 考研日记', source: 'v2ex', url: 'u', category: 'tech' as const },
    { title: 'GitHub 热门新库：xxx', source: 'github', url: 'u', category: 'tech' as const },
  ]
  it('空主题不过滤', () => { expect(filterByTopics(items, [])).toHaveLength(3) })
  it('标题匹配（中文 + 大小写不敏感英文）', () => {
    expect(filterByTopics(items, ['llm']).map(i => i.title)).toEqual(['LLM 新论文发布'])
  })
  it('多关键词任一命中即可', () => {
    expect(filterByTopics(items, ['考研', 'xxx'])).toHaveLength(2)
  })
  it('无命中返回空数组', () => { expect(filterByTopics(items, ['不存在的词'])).toEqual([]) })
})

describe('filterBySources', () => {
  const items = [{ title: 'a', source: 'github', url: 'u' }, { title: 'b', source: 'v2ex', url: 'u' }]
  it('空列表不过滤', () => { expect(filterBySources(items, [])).toHaveLength(2) })
  it('按源 id 过滤', () => { expect(filterBySources(items, ['github']).map(i => i.title)).toEqual(['a']) })
})

describe('formatFetchedAt', () => {
  it('ISO → HH:mm', () => {
    const iso = new Date(2026, 7, 5, 14, 32).toISOString() // 本地 14:32
    expect(formatFetchedAt(iso)).toBe('14:32')
  })
  it('null/非法返回空串', () => {
    expect(formatFetchedAt(null)).toBe('')
    expect(formatFetchedAt('oops')).toBe('')
  })
})

describe('loadHot', () => {
  beforeEach(() => { localStorage.clear(); vi.restoreAllMocks() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('无缓存且网络失败时返回空且不崩溃（保持旧行为）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const res = await loadHot(false)
    expect(res.items).toEqual([])
    expect(res.fromCache).toBe(false)
    expect(res.stale).toBe(false)
  })

  it('无缓存时抓取代理并写缓存', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(proxyOk()))
    const res = await loadHot(false)
    expect(res.items).toHaveLength(1)
    expect(res.fromCache).toBe(false)
    expect(localStorage.getItem('wb:hot-cache-v2')).toBeTruthy()
  })

  it('有新鲜缓存时直接返回缓存不请求网络', async () => {
    localStorage.setItem('wb:hot-cache-v2', JSON.stringify({ fetchedAt: new Date().toISOString(), items: [{ title: 'C', source: 's', url: 'u' }], sources: [] }))
    const fetchSpy = vi.fn().mockResolvedValue(proxyOk())
    vi.stubGlobal('fetch', fetchSpy)
    const res = await loadHot(false)
    expect(res.items[0].title).toBe('C')
    expect(res.fromCache).toBe(true)
    expect(res.stale).toBe(false)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('缓存过期：loadHot(false) 返回旧数据并标 stale，不请求网络', async () => {
    localStorage.setItem('wb:hot-cache-v2', JSON.stringify({ fetchedAt: new Date(Date.now() - HOT_TTL_MS - 1000).toISOString(), items: [{ title: 'Old', source: 's', url: 'u' }], sources: [] }))
    const fetchSpy = vi.fn().mockResolvedValue(proxyOk())
    vi.stubGlobal('fetch', fetchSpy)
    const res = await loadHot(false)
    expect(res.items[0].title).toBe('Old')
    expect(res.stale).toBe(true)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refresh=true 强制抓取并更新缓存', async () => {
    localStorage.setItem('wb:hot-cache-v2', JSON.stringify({ fetchedAt: new Date().toISOString(), items: [{ title: 'Old', source: 's', url: 'u' }], sources: [] }))
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(proxyOk([{ title: 'New', source: 'github', url: 'https://p/2', category: 'tech' }])))
    const res = await loadHot(true)
    expect(res.items[0].title).toBe('New')
    expect(res.fromCache).toBe(false)
    expect((JSON.parse(localStorage.getItem('wb:hot-cache-v2')!) as HotCache).items[0].title).toBe('New')
  })

  it('代理失败时降级直连（GitHub/HN/V2EX），source 用 id', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockRejectedValueOnce(new Error('proxy down'))                       // /api/hot
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ items: [{ full_name: 'a/b', stargazers_count: 5, html_url: 'https://gh' }] }) })) // GitHub API
    const res = await loadHot(true)
    expect(res.items[0]).toEqual({ title: 'GitHub 热门新库：a/b（5★）', source: 'github', url: 'https://gh' })
  })

  it('订阅源过滤：代理请求带 sources 参数，直连降级按订阅过滤', async () => {
    const fetchSpy = vi.fn().mockResolvedValue(proxyOk())
    vi.stubGlobal('fetch', fetchSpy)
    await loadHot(true, ['github', 'v2ex'])
    expect(fetchSpy.mock.calls[0][0]).toContain('sources=github%2Cv2ex')
  })
})
