import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { homeCards } from '@/registry'
import { SPAN_CLASS } from '@/lib/bento'
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

/** 整卡 Link 统一外壳：border 基础透明 + hover 高亮边框 + 按压缩放。
 *  高度由父级 .home-cell 撑满（见 index.css 的 Bento 三行），这里只管视觉。 */
function CardLinkShell({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="block h-full rounded-xl border border-transparent transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.98]"
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
      {/* 桌面端卡片墙：12 列 Bento（v1.33）
          —— v1.32 用的 CSS 多列堆叠只解决「列内没有洞」，三列各自收尾，左列下方仍空 153px。
          现在按行排 12 列：同一行的卡被 items-stretch 拉成等高，矮卡多出的高度落进卡片内部
          （index.css 里 .home-cell 三行把 Card 撑满、CardContent 变 flex:1），卡与卡之间只剩设计间距。
          每行跨度之和必须 = 12（如 4+8 / 4+4+4），否则行尾留洞——tests/home-bento.test.ts 守着。 */}
      <div className="hidden grid-cols-12 items-stretch gap-3 md:grid xl:gap-4">
        <div className="home-cell card-enter min-w-0 md:col-span-6 xl:col-span-4">
          <WeatherCard />
        </div>
        {cards.map((c, i) => (
          <div
            key={c.id}
            className={cn('home-cell card-enter min-w-0', SPAN_CLASS[c.span])}
            style={{ animationDelay: `${(i + 1) * 40}ms` }}
          >
            {CARD_LINK[c.id]
              ? <CardLinkShell to={CARD_LINK[c.id]}><c.component /></CardLinkShell>
              : <c.component />}
          </div>
        ))}
      </div>
    </div>
  )
}
