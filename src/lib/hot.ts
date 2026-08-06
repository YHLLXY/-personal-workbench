export type HotCategory = 'tech' | 'academic' | 'zh'
export interface HotItem { title: string; source: string; url: string; category?: HotCategory }
export interface HotSourceMeta { id: string; name: string; category: HotCategory; experimental?: boolean }
export interface HotCache { fetchedAt: string; items: HotItem[]; sources: HotSourceMeta[] }
export interface HotResult {
  items: HotItem[]
  sources: HotSourceMeta[]
  fromCache: boolean
  fetchedAt: string | null
  stale: boolean   // true = 返回的是过期缓存，页面应静默触发后台刷新
}

export const HOT_TTL_MS = 30 * 60 * 1000
const CACHE_KEY = 'wb:hot-cache-v2'

export function isCacheFresh(cache: HotCache | null, ttlMs = HOT_TTL_MS): boolean {
  if (!cache) return false
  const age = Date.now() - new Date(cache.fetchedAt).getTime()
  return !Number.isNaN(age) && age >= 0 && age < ttlMs
}

export function filterByTopics(items: HotItem[], topics: string[]): HotItem[] {
  if (topics.length === 0) return items
  const lower = topics.map(t => t.toLowerCase())
  return items.filter(it => {
    const hay = [it.title, it.source, it.category ?? ''].join(' ').toLowerCase()
    return lower.some(t => hay.includes(t))
  })
}

export function filterBySources(items: HotItem[], sourceIds: string[]): HotItem[] {
  if (sourceIds.length === 0) return items
  return items.filter(it => sourceIds.includes(it.source))
}

export function formatFetchedAt(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

function readCache(): HotCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const p: unknown = JSON.parse(raw)
    if (!p || typeof p !== 'object') return null
    const c = p as HotCache
    return Array.isArray(c.items) && typeof c.fetchedAt === 'string' ? c : null
  } catch { return null }
}
function writeCache(c: HotCache) { try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)) } catch { /* 隐私模式等忽略 */ } }

async function fetchViaProxy(sources: string[]): Promise<HotResult> {
  const qs = sources.length > 0 ? `?sources=${encodeURIComponent(sources.join(','))}` : ''
  const r = await fetch('/api/hot' + qs, { headers: { accept: 'application/json' } })
  if (!r.ok) throw new Error(`HTTP ${r.status}`)
  const j = await r.json() as { items: HotItem[]; sources: HotSourceMeta[]; fetchedAt: string | null }
  return { items: j.items ?? [], sources: j.sources ?? [], fromCache: false, fetchedAt: j.fetchedAt, stale: false }
}

/** 前端直连降级（保留 GitHub/HN/V2EX 三源，source 统一用源 id） */
async function fetchDirect(): Promise<HotItem[]> {
  const sources: Array<() => Promise<HotItem[]>> = [
    async () => { const r = await fetch('https://api.github.com/search/repositories?q=created:%3E7d&sort=stars&per_page=8'); if (!r.ok) return []; const j = await r.json() as { items?: { full_name: string; stargazers_count: number; html_url: string }[] }; return (j.items ?? []).map(it => ({ title: `GitHub 热门新库：${it.full_name}（${it.stargazers_count}★）`, source: 'github', url: it.html_url })) },
    async () => { const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json'); if (!r.ok) return []; const ids = (await r.json() as number[]).slice(0, 4); const out: HotItem[] = []; for (const id of ids) { try { const j = await (await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json() as { title: string }; out.push({ title: `HN: ${j.title}`, source: 'hackernews', url: `https://news.ycombinator.com/item?id=${id}` }) } catch { /* 单条失败跳过 */ } } return out },
    async () => { const r = await fetch('https://www.v2ex.com/api/topics/hot.json'); if (!r.ok) return []; const j = await r.json() as { title: string; id: number }[]; return j.slice(0, 8).map(it => ({ title: `V2EX: ${it.title}`, source: 'v2ex', url: `https://www.v2ex.com/t/${it.id}` })) },
  ]
  for (const fn of sources) {
    try { const items = await fn(); if (items.length > 0) return items } catch { /* 降级到下一个源 */ }
  }
  return []
}

const DIRECT_META: HotSourceMeta[] = [
  { id: 'github', name: 'GitHub 热门新库', category: 'tech' },
  { id: 'hackernews', name: 'Hacker News', category: 'tech' },
  { id: 'v2ex', name: 'V2EX', category: 'tech' },
]

export async function loadHot(refresh: boolean, sources: string[] = []): Promise<HotResult> {
  const cached = readCache()
  if (!refresh) {
    if (cached && isCacheFresh(cached)) return { ...cached, fromCache: true, stale: false }
    if (cached) return { ...cached, fromCache: true, stale: true }
  }
  try {
    const res = await fetchViaProxy(sources)
    writeCache({ fetchedAt: res.fetchedAt ?? new Date().toISOString(), items: res.items, sources: res.sources })
    return res
  } catch {
    try {
      const items = await fetchDirect()
      const filtered = filterBySources(items, sources)
      if (filtered.length > 0 || sources.length === 0) {
        const fetchedAt = new Date().toISOString()
        writeCache({ fetchedAt, items: filtered, sources: DIRECT_META })
        return { items: filtered, sources: DIRECT_META, fromCache: false, fetchedAt, stale: false }
      }
    } catch { /* 直连也失败，落到缓存/空 */ }
    if (cached) return { ...cached, fromCache: true, stale: !isCacheFresh(cached) }
    return { items: [], sources: [], fromCache: false, fetchedAt: null, stale: false }
  }
}
