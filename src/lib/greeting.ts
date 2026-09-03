/** 时段问候语（顶栏 + 今日概览共用）。原在 daily-summary，v1.24 抽出以斩断 layout→changelog 的入口 chunk 静态链 */
export function greeting(date: Date): string {
  const h = date.getHours()
  if (h < 6) return '夜深了'
  if (h < 12) return '早上好'
  if (h < 18) return '下午好'
  return '晚上好'
}
