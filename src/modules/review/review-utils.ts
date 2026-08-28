import type { Review } from '../../lib/db/types'

// 复盘视图的纯函数（独立文件避免触发 fast-refresh 规则）

/** 明日计划文本 → 待办条目：按换行/中文分号/英文分号/中文逗号拆分，trim 后过滤空串与长度≤1 的行 */
export function parsePlan(text: string): string[] {
  return text.split(/[\n；;，]/).map(s => s.trim()).filter(s => s.length > 1)
}

/** 明天 = 本地日期 + 1 天（写法参考 todayStr） */
export function tomorrowStr(): string {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 趋势迷你图数据：最近 14 条复盘按 reviewDate 升序，mood(1-5)/score(1-10) 各自归一到 0-1；不足 2 条返回空 */
export function buildTrend(entries: Review[]): { moodY: number[]; scoreY: number[]; dates: string[] } {
  const list = [...entries].sort((a, b) => a.reviewDate.localeCompare(b.reviewDate)).slice(-14)
  if (list.length < 2) return { moodY: [], scoreY: [], dates: [] }
  return {
    moodY: list.map(r => (r.mood - 1) / 4),
    scoreY: list.map(r => ((r.score ?? 5) - 1) / 9), // score 留空按中位 5 处理，避免折线断点
    dates: list.map(r => r.reviewDate),
  }
}
