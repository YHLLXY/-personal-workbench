/** 首页 12 列 Bento 的跨度规则（v1.33）。
 *
 *  为什么是「12 列 + 跨度」而不是 masonry：12 列网格按行排，同一行的卡由 items-stretch 拉成等高，
 *  矮卡多出来的高度落进卡片内部（CardContent 是 flex:1），不会在卡外留洞——这是用户 2026-10-20 选定的方案 B。
 *
 *  md（768–1279）一律两列：4 / 6 / 8 全降为 col-span-6。
 *  热点若在 md 上占 12，就会出现「天气 6 + 热点 12」这种填不满一行的组合，而 grid-auto-flow: row
 *  不会回退，天气右边会留一个 6 列的空洞——这正是 v1.32 修完「行高」又冒出来的同类问题。
 *
 *  Tailwind 只认静态字面量，所以写成映射表，不要拼接字符串。 */
export type BentoSpan = 4 | 6 | 8 | 12

export const SPAN_CLASS: Record<BentoSpan, string> = {
  4: 'md:col-span-6 xl:col-span-4',
  6: 'md:col-span-6 xl:col-span-6',
  8: 'md:col-span-6 xl:col-span-8',
  12: 'md:col-span-12 xl:col-span-12',
}

/** 桌面首页卡片（含天气）的跨度序列：天气固定 4 列、排第一，其余按 desktopOrder 后来。 */
export function bentoSpans(cards: { span: BentoSpan }[], weatherSpan: BentoSpan = 4): BentoSpan[] {
  return [weatherSpan, ...cards.map(c => c.span)]
}

/** 按 CSS Grid 的自动行流（grid-auto-flow: row，不回退）把跨度切成行。
 *  除最后一行外，每行的和必须等于 cols，否则那一行右侧就是空洞。 */
export function bentoRows(spans: number[], cols = 12): { spans: number[]; sum: number }[] {
  const rows: { spans: number[]; sum: number }[] = []
  let cur: number[] = []
  let sum = 0
  for (const s of spans) {
    if (sum + s > cols) {
      rows.push({ spans: cur, sum })
      cur = []
      sum = 0
    }
    cur.push(s)
    sum += s
  }
  if (cur.length > 0) rows.push({ spans: cur, sum })
  return rows
}
