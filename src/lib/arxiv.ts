export interface ArxivResult { title: string; authors: string[]; arxivId: string; url: string; abstract: string; published: string }

/** 解析 arXiv Atom XML */
export function parseArxivXml(xml: string): ArxivResult[] {
  const out: ArxivResult[] = []
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? []
  for (const e of entries) {
    const get = (tag: string) => e.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`))?.[1]?.trim() ?? ''
    const idMatch = e.match(/<id>https?:\/\/arxiv\.org\/abs\/([^<]+)<\/id>/)
    const arxivId = idMatch?.[1] ?? ''
    if (!arxivId) continue
    const authors = [...e.matchAll(/<name>([\s\S]*?)<\/name>/g)].map(m => m[1])
    out.push({ title: clean(get('title')), authors, arxivId, url: `https://arxiv.org/abs/${arxivId}`, abstract: clean(get('summary')), published: get('published').slice(0, 10) })
  }
  return out
}
function clean(s: string) { return s.replace(/\s+/g, ' ').trim() }

export async function searchArxiv(query: string, max = 8): Promise<ArxivResult[]> {
  const r = await fetch(`https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&start=0&max_results=${max}&sortBy=submittedDate&sortOrder=descending`)
  if (!r.ok) throw new Error(`arXiv ${r.status}`)
  return parseArxivXml(await r.text())
}
