export interface ParsedImport {
  title: string
  sourceUrl: string
  platform: string
  summaryJson: string | null   // 序列化 JSON 字符串，直接存 Paper.summary
  keywords: string[]
  content: string
}

/** 尝试按 JSON 解析（提取器标准导出）；失败则当纯文本。永不抛异常。 */
export function parseImportText(text: string): ParsedImport {
  const trimmed = (text ?? '').trim()
  if (trimmed.startsWith('{')) {
    try {
      const j = JSON.parse(trimmed)
      if (j && typeof j === 'object' && typeof j.content === 'string') {
        return {
          title: typeof j.title === 'string' ? j.title : '',
          sourceUrl: typeof j.source_url === 'string' ? j.source_url : '',
          platform: typeof j.platform === 'string' ? j.platform : '',
          summaryJson: j.summary && typeof j.summary === 'object' ? JSON.stringify(j.summary) : null,
          keywords: Array.isArray(j.keywords) ? j.keywords.filter((k: unknown): k is string => typeof k === 'string') : [],
          content: j.content,
        }
      }
    } catch { /* 解析失败 → 降级纯文本 */ }
  }
  return { title: '', sourceUrl: '', platform: '', summaryJson: null, keywords: [], content: trimmed }
}

/** 解析 Markdown 笔记：提取 frontmatter 的 title/source/tags，正文作为 content。 */
export function parseImportMarkdown(text: string): ParsedImport {
  const src = text ?? ''
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/)
  if (!m) return { title: '', sourceUrl: '', platform: '', summaryJson: null, keywords: [], content: src.trim() }
  const [, fm, body] = m
  let title = '', sourceUrl = '', platform = ''
  const keywords: string[] = []
  for (const line of fm.split(/\r?\n/)) {
    const t = line.match(/^title:\s*"?([^"]*?)"?\s*$/)
    if (t) title = t[1]
    const s = line.match(/^source:\s*"?([^"]*?)"?\s*$/)
    if (s) sourceUrl = s[1]
    const p = line.match(/^platform:\s*"?([^"]*?)"?\s*$/)
    if (p) platform = p[1]
    if (line.startsWith('  - ')) keywords.push(line.slice(4).trim())
    // 支持行内数组格式：keywords: [a, b, c]
    const inlineKw = line.match(/^keywords:\s*\[(.+)\]\s*$/)
    if (inlineKw) {
      for (const k of inlineKw[1].split(',')) {
        const trimmed = k.trim().replace(/^["']|["']$/g, '')
        if (trimmed) keywords.push(trimmed)
      }
    }
  }
  return { title, sourceUrl, platform, summaryJson: null, keywords, content: body.trim() }
}
