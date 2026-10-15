/** 首页 12 列网格的「行填充」校验（纯函数，v1.26）。
 *
 * 背景：首页卡片一直用 grid-cols-12 + 逐卡手挑 span。CSS Grid 默认 grid-auto-flow: row
 * **不回溯**——放不下的卡片直接换行，已占的剩余列变成空洞。因为从没有人核对过
 * 「每行是否恰好 12 列」，线上实测出现 17 列空洞（3+5+2+7）外加一整行全空。
 *
 * 这里复刻该排布规则，供单测断言「除最后一行外每行都填满」，把这类错误挡在 CI 里。
 */
export const HOME_GRID_COLS = 12

/** 按声明顺序模拟 CSS Grid 自动排布，返回每一行已占用的列数 */
export function gridRowFills(spans: number[], cols = HOME_GRID_COLS): number[] {
  const rows: number[] = []
  let used = 0
  for (const raw of spans) {
    const s = Math.min(Math.max(Math.round(raw), 1), cols)
    if (used + s > cols) { rows.push(used); used = 0 }
    used += s
  }
  rows.push(used)
  return rows
}

/** 返回未填满的行（第几行 / 已用列 / 空列）。最后一行允许不满（列表尾部），故不参与判定 */
export function findUnfilledRows(spans: number[], cols = HOME_GRID_COLS): Array<{ row: number; used: number; empty: number }> {
  const fills = gridRowFills(spans, cols)
  return fills.slice(0, -1)
    .map((used, i) => ({ row: i + 1, used, empty: cols - used }))
    .filter(r => r.empty > 0)
}
