import { localDateOfISO, type TaskRepeat } from './db/types'

// 重复任务纯函数引擎（v1.24）。规则模型见 types.TaskRepeat：简单枚举而非 RRULE（rrule.js 被体积红线否决，
// 调研结论：freq+interval+weekdays+anchor 已覆盖 Todoist every/every! 全部主路径）。
// 规则细则（PLAN_V124 B 节）：anchor='complete' 时 base = max(完成日本地日期, 计划日)（提前完成不早于计划日）；
// weekly 多选取 base 之后最近的选中星期（interval>1 限单选、整周步进）；monthly 月末钳制（1/31 → 2/28）；
// 「跳过不补」（Apple Reminders 式）：anchor='due' 推进结果 < today 时继续推进到首个 ≥ today 的槽位。

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六']

function pad(n: number): string { return String(n).padStart(2, '0') }
function fmtDate(d: Date): string { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
function toDate(dateStr: string): Date { return new Date(`${dateStr}T00:00:00`) }
function weekdayOf(dateStr: string): number { return toDate(dateStr).getDay() }
function laterOf(a: string, b: string): string { return a > b ? a : b }
function normInterval(repeat: TaskRepeat): number { return Math.max(1, Math.floor(repeat.interval) || 1) }
function weekdaysOf(repeat: TaskRepeat, fallback: number[]): number[] { return repeat.weekdays?.length ? repeat.weekdays : fallback }

/** 日期加减 N 天（跨月/跨年安全）。F 项改期菜单复用（明天/后天） */
export function addDays(dateStr: string, n: number): string {
  const d = toDate(dateStr)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

/** 下一个周一（严格晚于 dateStr；今天周一则返回下周一）。F 项「下周一」复用 */
export function nextMonday(dateStr: string): string {
  let d = addDays(dateStr, 1)
  while (weekdayOf(d) !== 1) d = addDays(d, 1)
  return d
}

/** 加 N 个月，day 超出目标月天数时钳制到月末（1/31 → 2/28） */
function addMonthsClamped(dateStr: string, n: number): string {
  const y = Number(dateStr.slice(0, 4)), m = Number(dateStr.slice(5, 7)), day = Number(dateStr.slice(8, 10))
  const total = y * 12 + (m - 1) + n
  const ny = Math.floor(total / 12), nm = (((total % 12) + 12) % 12) + 1
  const nd = Math.min(day, new Date(ny, nm, 0).getDate())
  return `${ny}-${pad(nm)}-${pad(nd)}`
}

/** weekly 多选：d 之后（严格晚于）最近的选中星期；7 天内必命中（选中集非空） */
function nextWeekdayAfter(d0: string, weekdays: number[]): string {
  let d = addDays(d0, 1)
  for (let i = 0; i < 7; i++) {
    if (weekdays.includes(weekdayOf(d))) return d
    d = addDays(d, 1)
  }
  return d
}

/** 从 base 推进一步到下一个槽位 */
function firstSlotAfter(base: string, repeat: TaskRepeat): string {
  const interval = normInterval(repeat)
  if (repeat.freq === 'daily') return addDays(base, interval)
  if (repeat.freq === 'weekly') {
    if (interval > 1) return addDays(base, 7 * interval) // 整周步进（单选，UI 约束）
    return nextWeekdayAfter(base, weekdaysOf(repeat, [weekdayOf(base)]))
  }
  return addMonthsClamped(base, interval)
}

/** 完成后的下一次到期日。
 *  anchor='complete' 用完成日推进（提前完成不早于计划日）；结果按「跳过不补」推进到首个 ≥ today 的槽位 */
export function nextOccurrence(dueDate: string, repeat: TaskRepeat, completedAtISO: string | null, today: string): string {
  const base = repeat.anchor === 'complete' && completedAtISO ? laterOf(localDateOfISO(completedAtISO), dueDate) : dueDate
  let next = firstSlotAfter(base, repeat)
  while (next < today) next = firstSlotAfter(next, repeat)
  return next
}

/** 回退一格（撤销重复完成用；不含跳过逻辑）。
 *  注：anchor='complete' 晚完成 + 多选星期场景为近似值（恢复到上一槽位而非最初计划日），PLAN_V124 B3 注记 */
export function prevOccurrence(dueDate: string, repeat: TaskRepeat): string {
  const interval = normInterval(repeat)
  if (repeat.freq === 'daily') return addDays(dueDate, -interval)
  if (repeat.freq === 'weekly') {
    if (interval > 1) return addDays(dueDate, -7 * interval)
    let d = addDays(dueDate, -1)
    for (let i = 0; i < 7; i++) {
      if (weekdaysOf(repeat, [weekdayOf(dueDate)]).includes(weekdayOf(d))) return d
      d = addDays(d, -1)
    }
    return d
  }
  return addMonthsClamped(dueDate, -interval)
}

/** 徽章文案：每天 / 每 3 天 / 每个工作日 / 每周·一/三 / 每 2 周·周三 / 每月 15 日。
 *  monthly 的「日」需要任务的 dueDate（缺省时省略） */
export function repeatLabel(repeat: TaskRepeat, dueDate?: string | null): string {
  const interval = normInterval(repeat)
  if (repeat.freq === 'daily') return interval === 1 ? '每天' : `每 ${interval} 天`
  if (repeat.freq === 'weekly') {
    const weekdays = weekdaysOf(repeat, [])
    if (weekdays.length === 5 && [1, 2, 3, 4, 5].every(d => weekdays.includes(d))) return '每个工作日'
    const selected = weekdays.length ? [...weekdays].sort((a, b) => a - b) : [dueDate ? weekdayOf(dueDate) : 1]
    const shorts = selected.map(d => WEEKDAY_CN[d] ?? '').filter(Boolean)
    // interval=1 短式（每周·一/三）；interval>1 带周前缀（每 2 周·周三）
    const days = interval === 1 ? shorts.join('/') : shorts.map(s => `周${s}`).join('/')
    return interval === 1 ? `每周·${days}` : `每 ${interval} 周·${days}`
  }
  const day = dueDate ? Number(dueDate.slice(8, 10)) : null
  return interval === 1 ? (day ? `每月 ${day} 日` : '每月') : day ? `每 ${interval} 月 ${day} 日` : `每 ${interval} 月`
}
