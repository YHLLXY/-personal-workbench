import type { DailyReport } from '@/lib/db/types'

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

/**
 * 把日报导出成 Markdown —— 「复制」按钮用。
 *
 * 纯函数，不碰剪贴板（那部分留在组件里）：这样格式能单测，而且以后想加「导出文件」也能直接复用。
 * 体例上刻意贴近 Obsidian / 飞书文档的粘贴习惯：标题分节、要点用列表、来源保留成可点的链接。
 */
export function reportToMarkdown(r: DailyReport): string {
  const out: string[] = ['# ' + (r.title || '今日简报'), '']
  const meta = [formatReportDate(r.reportDate)]
  if (r.itemCount > 0) meta.push(r.itemCount + ' 条事件')
  if (r.sourceCount > 0) meta.push(r.sourceCount + ' 个来源')
  out.push('> ' + meta.join(' · '), '')
  if (r.overview) out.push(r.overview, '')

  for (const sec of r.sections) {
    if (sec.items.length === 0) continue
    out.push('## ' + sec.category, '')
    for (const it of sec.items) {
      out.push('- **' + it.title + '**')
      if (it.point) out.push('  ' + it.point)
      if (it.sources.length > 0) {
        out.push('  来源：' + it.sources.map(s => '[' + s.name + '](' + s.url + ')').join(' · '))
      }
    }
    out.push('')
  }
  out.push('---', r.model ? '由 ' + r.model + ' 生成' : 'AI 生成')
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n'
}
