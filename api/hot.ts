/**
 * 今日热点聚合函数（单文件）
 *
 * ⚠️ 必须保持单文件：Vercel 函数环境（Node 原生 TS 运行）不支持跨文件相对导入
 * （2026-08-05 线上 FUNCTION_INVOCATION_FAILED 排障结论：无后缀与 .ts 后缀均失败，
 *   仅单文件模式可运行）。新增逻辑请写在本文件内。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

// ========== RSS 2.0 解析器 ==========

export interface RawItem { title: string; url: string }

/** 解码 XML 实体（不含 CDATA 剥离）。对越界数字实体输出替换字符 U+FFFD。 */
function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_m, n: string) => {
      const cp = parseInt(n, 16)
      return cp > 0x10FFFF ? '�' : String.fromCodePoint(cp)
    })
    .replace(/&#(\d+);/g, (_m, n: string) => {
      const cp = Number(n)
      return cp > 0x10FFFF || !Number.isFinite(cp) ? '�' : String.fromCodePoint(cp)
    })
}

/** 剥离 CDATA 并解码 XML 实体。CDATA 内容原样保留，仅非 CDATA 部分做实体解码。 */
function decodeXml(s: string): string {
  return s
    .split(/<!\[CDATA\[([\s\S]*?)\]\]>/g)
    .map((part, i) => (i % 2 === 1 ? part : decodeEntities(part)))
    .join('')
}

/** 解析 RSS 2.0 XML → 条目列表（只支持 RSS 2.0 的 <item><title>/<link>，Atom 等格式返回 []） */
export function parseRssXml(xml: string): RawItem[] {
  if (!xml || typeof xml !== 'string') return []
  const out: RawItem[] = []
  const itemRe = /<item[^>]*>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml))) {
    const block = m[1]
    const title = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]
    const link = block.match(/<link[^>]*>([\s\S]*?)<\/link>/)?.[1]
    if (!title || !link) continue
    out.push({ title: decodeXml(title.trim()).trim(), url: decodeXml(link.trim()) })
  }
  return out
}

// ========== 内置源库 ==========

export type HotCategory = 'tech' | 'academic' | 'zh'
export interface HotSourceMeta { id: string; name: string; category: HotCategory; experimental?: boolean }
export interface HotSource extends HotSourceMeta { fetch: (signal?: AbortSignal) => Promise<RawItem[]> }

async function fetchJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal, headers: { 'user-agent': 'personal-workbench/1.0' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
  return r.json() as Promise<T>
}
async function fetchRss(url: string, signal?: AbortSignal, max = 8): Promise<RawItem[]> {
  const r = await fetch(url, { signal, headers: { 'user-agent': 'personal-workbench/1.0' } })
  if (!r.ok) throw new Error(`HTTP ${r.status} ${url}`)
  return parseRssXml(await r.text()).slice(0, max)
}

export const SOURCES: HotSource[] = [
  // ===== 技术 tech =====
  { id: 'github', name: 'GitHub 热门新库', category: 'tech', fetch: async (s) => {
    const j = await fetchJson<{ items: { full_name: string; stargazers_count: number; html_url: string }[] }>('https://api.github.com/search/repositories?q=created:%3E7d&sort=stars&per_page=8', s)
    return (j.items ?? []).map(it => ({ title: `GitHub 热门新库：${it.full_name}（${it.stargazers_count}★）`, url: it.html_url }))
  } },
  { id: 'hackernews', name: 'Hacker News', category: 'tech', fetch: async (s) => {
    const ids = (await fetchJson<number[]>('https://hacker-news.firebaseio.com/v0/topstories.json', s)).slice(0, 5)
    const out: RawItem[] = []
    for (const id of ids) {
      try {
        const j = await fetchJson<{ title: string }>(`https://hacker-news.firebaseio.com/v0/item/${id}.json`, s)
        out.push({ title: `HN: ${j.title}`, url: `https://news.ycombinator.com/item?id=${id}` })
      } catch { /* 单条失败跳过 */ }
    }
    return out
  } },
  { id: 'v2ex', name: 'V2EX 热门', category: 'tech', fetch: async (s) => {
    const j = await fetchJson<{ title: string; id: number }[]>('https://www.v2ex.com/api/topics/hot.json', s)
    return (j ?? []).slice(0, 8).map(it => ({ title: `V2EX: ${it.title}`, url: `https://www.v2ex.com/t/${it.id}` }))
  } },
  { id: 'lobsters', name: 'Lobsters', category: 'tech', fetch: s => fetchRss('https://lobste.rs/rss', s) },
  { id: 'kr36', name: '36氪', category: 'tech', fetch: s => fetchRss('https://36kr.com/feed', s) },
  { id: 'sspai', name: '少数派', category: 'tech', fetch: s => fetchRss('https://sspai.com/feed', s) },
  { id: 'ifanr', name: '爱范儿', category: 'tech', fetch: s => fetchRss('https://www.ifanr.com/feed', s) },
  { id: 'solidot', name: 'Solidot', category: 'tech', fetch: s => fetchRss('https://www.solidot.org/index.rss', s) },
  { id: 'cnbeta', name: 'cnBeta', category: 'tech', fetch: s => fetchRss('https://www.cnbeta.com.tw/backend.php', s) },
  { id: 'ithome', name: 'IT之家', category: 'tech', fetch: s => fetchRss('https://www.ithome.com/rss/', s) },
  { id: 'oschina', name: '开源中国', category: 'tech', fetch: s => fetchRss('https://www.oschina.net/news/rss', s) },

  // ===== 学术 academic =====
  { id: 'arxiv-ai', name: 'arXiv cs.AI', category: 'academic', fetch: s => fetchRss('https://export.arxiv.org/rss/cs.AI', s) },
  { id: 'arxiv-cl', name: 'arXiv cs.CL', category: 'academic', fetch: s => fetchRss('https://export.arxiv.org/rss/cs.CL', s) },
  { id: 'arxiv-cv', name: 'arXiv cs.CV', category: 'academic', fetch: s => fetchRss('https://export.arxiv.org/rss/cs.CV', s) },
  { id: 'arxiv-lg', name: 'arXiv cs.LG', category: 'academic', fetch: s => fetchRss('https://export.arxiv.org/rss/cs.LG', s) },
  { id: 'arxiv-se', name: 'arXiv cs.SE', category: 'academic', fetch: s => fetchRss('https://export.arxiv.org/rss/cs.SE', s) },
  { id: 'arxiv-math', name: 'arXiv math.IT', category: 'academic', fetch: s => fetchRss('https://export.arxiv.org/rss/math.IT', s) },
  { id: 'arxiv-cr', name: 'arXiv cs.CR', category: 'academic', fetch: s => fetchRss('https://export.arxiv.org/rss/cs.CR', s) },
  { id: 'jiqizhixin', name: '机器之心', category: 'academic', fetch: s => fetchRss('https://www.jiqizhixin.com/rss', s) },

  // ===== 中文社区 zh =====
  { id: 'bbc-zh', name: 'BBC 中文', category: 'zh', experimental: true, fetch: s => fetchRss('https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', s) },
  { id: 'huxiu', name: '虎嗅', category: 'zh', experimental: true, fetch: s => fetchRss('https://www.huxiu.com/rss/0.xml', s) },
  { id: 'douban-movie', name: '豆瓣新片', category: 'zh', experimental: true, fetch: s => fetchRss('https://www.douban.com/feed/review/movie', s) },
  { id: 'douban-book', name: '豆瓣书评', category: 'zh', experimental: true, fetch: s => fetchRss('https://www.douban.com/feed/review/book', s) },
  { id: 'zaobao-zh', name: '联合早报', category: 'zh', fetch: s => fetchRss('https://www.zaobao.com.sg/rss.xml', s) },
  { id: 'ruanyf-weekly', name: '阮一峰周刊', category: 'tech', experimental: true, fetch: async (s) => {
    const j = await fetchJson<{ title: string; html_url: string }[]>('https://api.github.com/repos/ruanyf/weekly/issues?state=open&per_page=1', s)
    return (j ?? []).slice(0, 1).map(it => ({ title: `阮一峰周刊: ${it.title ?? ''}`, url: it.html_url }))
  } },
]

/** 非实验源（保证稳定数量门槛） */
export const STABLE_SOURCES = SOURCES.filter(s => !s.experimental)

// ========== 并发聚合器 ==========

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

// ========== 函数入口 ==========

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const ids = typeof req.query.sources === 'string' ? req.query.sources.split(',').filter(Boolean) : []
    const selected = ids.length > 0 ? SOURCES.filter(s => ids.includes(s.id)) : SOURCES
    const items = await fetchAll(selected)
    const sources = SOURCES.map(({ id, name, category, experimental }) => ({ id, name, category, experimental }))
    res.setHeader('Cache-Control', 's-maxage=600')
    res.json({ items, sources, fetchedAt: new Date().toISOString() })
  } catch {
    res.status(500).json({ items: [], sources: [], fetchedAt: null })
  }
}
