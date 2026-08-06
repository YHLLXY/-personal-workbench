export interface RawItem { title: string; url: string }

/** 剥离 CDATA 并解码 XML 实体（含数字实体） */
function decodeXml(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_m, n: string) => String.fromCodePoint(Number(n)))
}

/** 解析 RSS 2.0 XML → 条目列表（只支持 RSS 2.0 的 <item><title>/<link>，Atom 等格式返回 []） */
export function parseRssXml(xml: string): RawItem[] {
  if (!xml || typeof xml !== 'string') return []
  const out: RawItem[] = []
  const itemRe = /<item>([\s\S]*?)<\/item>/g
  let m: RegExpExecArray | null
  while ((m = itemRe.exec(xml))) {
    const block = m[1]
    const title = block.match(/<title>([\s\S]*?)<\/title>/)?.[1]
    const link = block.match(/<link>([\s\S]*?)<\/link>/)?.[1]
    if (!title || !link) continue
    out.push({ title: decodeXml(title.trim()).trim(), url: decodeXml(link.trim()) })
  }
  return out
}
