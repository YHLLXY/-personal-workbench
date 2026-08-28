import type { Note } from '../../lib/db/types'

// 速记/热点视图的纯函数（独立文件避免触发 fast-refresh 规则）

const READ_KEY = 'wb:hot-read'
const READ_LIMIT = 500

/** 读取已读热点 id 列表（JSON 字符串数组，保持插入序）；损坏/非数组一律回退空数组 */
export function loadReadIds(): string[] {
  try {
    const raw = localStorage.getItem(READ_KEY)
    const arr: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter((x): x is string => typeof x === 'string') : []
  } catch { return [] }
}

/** 追加一条已读 id：去重、保持插入序、超 500 条丢最旧，随后持久化 */
export function saveReadId(id: string): string[] {
  const next = [...loadReadIds().filter(x => x !== id), id].slice(-READ_LIMIT)
  try { localStorage.setItem(READ_KEY, JSON.stringify(next)) } catch { /* 隐私模式等写入失败时静默 */ }
  return next
}

/** 存速记的正文拼接：标题 + 换行 + 链接 */
export function hotNoteText(title: string, url: string): string { return `${title}\n${url}` }

/** 速记过滤：按关键词（content 不区分大小写）与标签，tag 为 null 表示「全部」 */
export function filterNotes(notes: Note[], query: string, tag: string | null): Note[] {
  const q = query.trim().toLowerCase()
  return notes.filter(n => (!q || n.content.toLowerCase().includes(q)) && (!tag || n.tag === tag))
}

/** 极简 Markdown → 安全 HTML（零依赖）。
 *  安全模型：先整体 HTML 转义再施加转换，任何 <script>/onerror 等只会以文本呈现；
 *  链接仅接受 http(s) 协议。支持的语法：#/##/### 标题、**粗体**、*斜体*、`行内代码`、``` 代码块、- 列表、[文本](链接)、裸 https 链接、空行分段。 */
export function renderMarkdown(src: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  const inline = (s: string) => esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, (_m, t, u) => `<a href="${u}" target="_blank" rel="noreferrer">${t}</a>`)
    .replace(/(^|[\s（(])((?:https?:\/\/)[^\s<）)]+)/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em>$1</em>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')

  const lines = src.split(/\r?\n/)
  const out: string[] = []
  let inCode = false
  let listOpen = false
  let para: string[] = []
  const closeList = () => { if (listOpen) { out.push('</ul>'); listOpen = false } }
  const flushPara = () => { if (para.length) { out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = [] } }
  for (const raw of lines) {
    if (raw.trim().startsWith('```')) {
      flushPara(); closeList()
      if (!inCode) { out.push('<pre><code>'); inCode = true } else { out.push('</code></pre>'); inCode = false }
      continue
    }
    if (inCode) { out.push(esc(raw)); continue }
    const h = raw.match(/^(#{1,3})\s+(.*)$/)
    if (h) { flushPara(); closeList(); const n = h[1].length; out.push(`<h${n}>${inline(h[2])}</h${n}>`); continue }
    const li = raw.match(/^\s*[-*]\s+(.*)$/)
    if (li) { flushPara(); if (!listOpen) { out.push('<ul>'); listOpen = true } out.push(`<li>${inline(li[1])}</li>`); continue }
    if (raw.trim() === '') { flushPara(); closeList(); continue }
    para.push(raw)
  }
  flushPara(); closeList()
  if (inCode) out.push('</code></pre>')
  return out.join('\n')
}
