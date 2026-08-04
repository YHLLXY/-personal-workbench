export interface HeatCell { level: 0 | 1 | 2 | 3 }

/** 将最近 days 天（含今天）的打卡记录转为热力格：level = 当天打卡次数封顶 3 */
export function buildHeatCells(logDates: string[], days: number): HeatCell[] {
  const counts: Record<string, number> = {}
  for (const d of logDates) counts[d] = (counts[d] ?? 0) + 1
  const out: HeatCell[] = []
  const now = new Date()
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    out.push({ level: Math.min(3, counts[key] ?? 0) as 0 | 1 | 2 | 3 })
  }
  return out
}

/** 连续打卡天数（截至今天，含今天） */
export function streakFromLogDates(logDates: string[]): number {
  const set = new Set(logDates)
  const now = new Date()
  let streak = 0
  for (let i = 0; i < 3650; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    if (set.has(key)) streak++
    else break
  }
  return streak
}
