/** AI 日报的纯展示函数（放在 *-view.ts 而不是组件文件里，避免 fast-refresh 警告） */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 2026-10-15 → 10月15日 周三；格式不对时原样返回，不抛错 */
export function formatReportDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  const w = WEEKDAYS[new Date(y, m - 1, day).getDay()] ?? ''
  return `${m}月${day}日 周${w}`
}
