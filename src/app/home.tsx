import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { homeCards } from '@/registry'
import OverviewHome from '@/modules/overview/overview-home'
import { OverviewSummary } from '@/modules/overview/overview-summary'
import { WeatherCard } from '@/modules/overview/weather-card'
import ReminderBanner from '@/modules/reminders/reminder-banner'
import DailySummary from './daily-summary'

/** 卡片 → 目标路由。
 *  ⚠️ 只有【内部不含链接】的卡片才能进这张表：CardLinkShell 会把整卡包成一个 <a>，
 *  而 <a> 不能嵌套 <a>（React 报 hydration error，浏览器也会把内层链接拆开）。
 *  - HotCard：内部有条目外链
 *  - ProjectsCard：内部有「→」和每条项目名的 <Link>
 *  - GrowthCard：内部有「查看全部 →」的 <Link>
 *  以上三张一律不整卡跳转，靠卡片内的显式入口（v1.26 修复：home-projects / home-growth 曾在此表中，
 *  控制台实测报 "In HTML, <a> cannot be a descendant of <a>"）。 */
const CARD_LINK: Record<string, string> = {
  'home-tasks': '/tasks',
  'home-trend': '/tasks',
  'home-exams': '/study',
  'home-focus': '/pomodoro',
  'home-heatmap': '/health',
  'home-review': '/review',
  'home-notes': '/notes',
}

/** 整卡 Link 统一外壳：border 基础透明 + hover 高亮边框 + 按压缩放 */
function CardLinkShell({ to, children, delay }: { to: string; children: ReactNode; delay: number }) {
  return (
    <Link
      to={to}
      className="card-enter block rounded-xl border border-transparent transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.98]"
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </Link>
  )
}

export default function Home() {
  const cards = homeCards().sort((a, b) => a.desktopOrder - b.desktopOrder)
  return (
    <div className="mx-auto max-w-7xl">
      {/* 今日概览弹窗：打开应用弹一次（待办进度 + 考试倒计时 + 更新日志） */}
      <DailySummary />
      {/* 提醒横幅：移动端与桌面端都可见（无未读时自隐藏） */}
      <ReminderBanner />
      {/* 移动端专属视图（组件根自带 md:hidden） */}
      <OverviewHome />
      {/* 桌面端今日概览条 */}
      <div className="mb-4 hidden md:block">
        <OverviewSummary />
      </div>
      {/* 桌面端卡片墙：CSS 多列瀑布流（v1.32）
          —— 以前是 grid-cols-12 按行排：一行的高度由最高的那张卡决定，矮卡下面必然留下一大片空洞
          （2026-10-19 实测：最近考试下方 250px、今日专注下方 200px、今日待办下方 80px）。
          多列布局里每列独立堆叠，列内不会再出现空洞；只有当某一列比别的短时，列尾才会自然收短。 */}
      <div className="hidden gap-x-3 md:block md:columns-2 md:gap-x-4 xl:columns-3">
        {/* 天气卡：公共数据（/api/weather），无路由跳转，故不走 registry homeCard（那要求挂在子模块下） */}
        <div className="mb-3 break-inside-avoid card-enter md:mb-4">
          <WeatherCard />
        </div>
        {cards.map((c, i) => {
          const to = CARD_LINK[c.id]
          return (
            <div key={c.id} className="mb-3 break-inside-avoid md:mb-4">
              {to
                ? <CardLinkShell to={to} delay={i * 40}><c.component /></CardLinkShell>
                : <div className="card-enter" style={{ animationDelay: `${i * 40}ms` }}><c.component /></div>}
            </div>
          )
        })}
        {cards.length === 0 && (
          <p className="text-sm text-muted-foreground py-10 text-center">
            首页卡片将在各模块完成注册后自动出现
          </p>
        )}
      </div>
    </div>
  )
}
