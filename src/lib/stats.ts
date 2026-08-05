import { localDateOfISO } from './db/types'
import type { Task, FocusSession, Note } from './db/types'

export function taskCompletionRate(tasks: Task[]): { done: number; total: number; rate: number } {
  const total = tasks.length
  const done = tasks.filter(t => t.status === 'done').length
  return { done, total, rate: total === 0 ? 0 : Math.round((done / total) * 100) }
}

export function totalFocusMinutes(sessions: FocusSession[]): number {
  return sessions.reduce((sum, s) => sum + s.minutes, 0)
}

export function formatMinutes(totalMinutes: number): string {
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const h = Math.floor(totalMinutes / 60)
  const m = totalMinutes % 60
  return m === 0 ? `${h} 小时` : `${h} 小时 ${m} 分钟`
}

export function activeNoteCount(notes: Note[]): number {
  return notes.filter(n => !n.archived).length
}

export interface WeeklyDay { date: string; label: string; tasks: number; minutes: number }

/** 近 7 天（含今天）任务完成数（按 completedAt 本地日期）与专注分钟（按 startAt 本地日期）。today 注入便于测试 */
export function buildWeeklyTrend(tasks: Task[], sessions: FocusSession[], today: string): WeeklyDay[] {
  const taskCounts: Record<string, number> = {}
  for (const t of tasks) if (t.completedAt) { const k = localDateOfISO(t.completedAt); taskCounts[k] = (taskCounts[k] ?? 0) + 1 }
  const minuteCounts: Record<string, number> = {}
  for (const s of sessions) { const k = localDateOfISO(s.startAt); minuteCounts[k] = (minuteCounts[k] ?? 0) + s.minutes }
  const [y, m, d] = today.split('-').map(Number)
  const ref = new Date(y, m - 1, d)
  const labels = ['日', '一', '二', '三', '四', '五', '六']
  const out: WeeklyDay[] = []
  for (let i = 6; i >= 0; i--) {
    const date = new Date(ref); date.setDate(date.getDate() - i)
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    out.push({ date: key, label: i === 0 ? '今' : labels[date.getDay()], tasks: taskCounts[key] ?? 0, minutes: minuteCounts[key] ?? 0 })
  }
  return out
}
