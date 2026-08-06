import type { HotSource } from './sources'

export interface FetchAllOptions { timeoutMs?: number; perSource?: number; maxTotal?: number }
export interface FetchedItem { title: string; source: string; url: string; category: string }

/** 并发抓取全部源：单源超时、每源限量、总量限量、失败源静默跳过 */
export async function fetchAll(sources: HotSource[], opts: FetchAllOptions = {}): Promise<FetchedItem[]> {
  const { timeoutMs = 8000, perSource = 8, maxTotal = 60 } = opts
  const settled = await Promise.allSettled(sources.map(async s => {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), timeoutMs)
    try {
      const rows = await s.fetch(ctrl.signal)
      return rows.slice(0, perSource).map(r => ({ title: r.title, source: s.id, url: r.url, category: s.category }))
    } finally { clearTimeout(timer) }
  }))
  const out: FetchedItem[] = []
  for (const r of settled) if (r.status === 'fulfilled') out.push(...r.value)
  return out.slice(0, maxTotal)
}
