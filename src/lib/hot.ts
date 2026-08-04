export interface HotItem { title: string; source: string; url: string }
export interface HotResult { items: HotItem[]; fromCache: boolean }

const CACHE_KEY = 'wb:hot-cache'

/** 前端直连数据源（允许 CORS 的），按序尝试；失败静默跳过 */
async function fetchDirect(): Promise<HotItem[]> {
  const sources: Array<() => Promise<HotItem[]>> = [
    async () => { const r = await fetch('https://api.github.com/search/repositories?q=created:%3E7d&sort=stars&per_page=8'); if (!r.ok) return []; const j = await r.json(); return (j.items ?? []).map((it: any) => ({ title: `GitHub 热门新库：${it.full_name}（${it.stargazers_count}★）`, source: 'GitHub', url: it.html_url })) },
    async () => { const r = await fetch('https://hacker-news.firebaseio.com/v0/topstories.json'); if (!r.ok) return []; const ids = (await r.json() as number[]).slice(0, 8); const items = await Promise.all(ids.slice(0, 4).map(async id => { const j = await (await fetch(`https://hacker-news.firebaseio.com/v0/item/${id}.json`)).json(); return { title: `HN: ${j.title}`, source: 'Hacker News', url: `https://news.ycombinator.com/item?id=${id}` } })); return items },
    async () => { const r = await fetch('https://www.v2ex.com/api/topics/hot.json'); if (!r.ok) return []; const j = await r.json() as any[]; return j.slice(0, 8).map(it => ({ title: `V2EX: ${it.title}`, source: 'V2EX', url: `https://www.v2ex.com/t/${it.id}` })) },
  ]
  for (const fn of sources) {
    try { const items = await fn(); if (items.length > 0) return items } catch { /* 降级：尝试下一个源 */ }
  }
  return []
}

/** 生产环境经 Vercel 代理抓取（服务端无 CORS 限制） */
async function fetchViaProxy(): Promise<HotItem[]> {
  try {
    const r = await fetch('/api/hot', { headers: { accept: 'application/json' } })
    if (!r.ok) return []
    return (await r.json()).items as HotItem[]
  } catch { return [] }
}

export async function loadHot(refresh: boolean): Promise<HotResult> {
  if (!refresh) {
    const cached = localStorage.getItem(CACHE_KEY)
    if (cached) return { items: JSON.parse(cached) as HotItem[], fromCache: true }
  }
  let items = await fetchDirect()
  if (items.length === 0) items = await fetchViaProxy()
  if (items.length === 0) {
    const cached = localStorage.getItem(CACHE_KEY)
    return cached ? { items: JSON.parse(cached) as HotItem[], fromCache: true } : { items: [], fromCache: false }
  }
  localStorage.setItem(CACHE_KEY, JSON.stringify(items))
  return { items, fromCache: false }
}
