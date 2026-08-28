/** 项目列表页 / 详情页 / 首页卡片共用的展示工具 */

/** phase 徽章配色 */
export const PHASE_STYLE: Record<string, string> = {
  '进行中': 'bg-primary/12 text-primary',
  '已完成': 'bg-muted text-muted-foreground',
  '已归档': 'bg-muted/60 text-muted-foreground/60',
  '暂停': 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
}

export function fmtDate(d: string | null): string {
  if (!d) return '未知'
  const [y, m, day] = d.split('-')
  return `${Number(m)}-${Number(day)}` + (y === new Date().getFullYear().toString() ? '' : ` (${y})`)
}

const KB_REPO = 'YHLLXY/Konwledge-home'

/** 仓库路径 → URL path（逐段编码，保留 / 分隔） */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/')
}

export function kbTreeUrl(dir: string): string {
  return `https://github.com/${KB_REPO}/tree/main/${encodePath(`30-项目/${dir}`)}`
}

/** 门户口编辑入口（github.dev 网页版 VS Code；gatewayPath 为仓库内完整路径） */
export function kbEditUrl(gatewayPath: string | null, dir: string): string {
  const p = gatewayPath ?? `30-项目/${dir}/${dir} - 门户口.md`
  return `https://github.dev/${KB_REPO}/blob/main/${encodePath(p)}`
}

/** 目录内任意文档的 GitHub 查看链接 */
export function kbBlobUrl(path: string): string {
  return `https://github.com/${KB_REPO}/blob/main/${encodePath(path)}`
}
