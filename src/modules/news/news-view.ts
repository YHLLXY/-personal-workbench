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
