/** AI 日报的纯展示函数（放在 *-view.ts 而不是组件文件里，避免 fast-refresh 警告） */

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

/** 2026-10-15 → 10月15日 周三；格式不对时原样返回，不抛错 */
export function formatReportDate(d: string): string {
  const [y, m, day] = d.split('-').map(Number)
  if (!y || !m || !day) return d
  const w = WEEKDAYS[new Date(y, m - 1, day).getDay()] ?? ''
  return `${m}月${day}日 周${w}`
}

/**
 * 日报查询失败，是不是「功能还没启用」（迁移 015 没执行、表不存在）？
 *
 * PostgREST 找不到表给 PGRST205，Postgres 原生是 42P01，两个都认；
 * 兜底再匹配一次错误文案，且必须同时提到表名——网络抖动不该被误判成「去跑迁移」。
 */
export function isDigestNotEnabled(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null | undefined
  if (!e) return false
  if (e.code === 'PGRST205' || e.code === '42P01') return true
  const msg = typeof e.message === 'string' ? e.message : ''
  return /could not find the table|does not exist/i.test(msg) && /wb_daily_reports/i.test(msg)
}
