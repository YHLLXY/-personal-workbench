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
