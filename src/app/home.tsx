import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { homeCards } from '@/registry'
import OverviewHome from '@/modules/overview/overview-home'
import { OverviewSummary } from '@/modules/overview/overview-summary'
import ReminderBanner from '@/modules/reminders/reminder-banner'
import DailySummary from './daily-summary'

const SPAN_CLASS: Record<string, string> = {
  '3': 'md:col-span-3',
  '4': 'md:col-span-4',
  '5': 'md:col-span-5',
  '7': 'md:col-span-7',
  '12': 'md:col-span-12',
}

/** 卡片 → 目标路由（HotCard 无映射，保持不可整卡跳转） */
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
      {/* 桌面端卡片网格 */}
      <div className="hidden md:grid grid-cols-12 gap-3 md:gap-4 auto-rows-min">
        {cards.map((c, i) => {
          const to = CARD_LINK[c.id]
          return (
            <div key={c.id} className={`col-span-12 ${SPAN_CLASS[c.span] ?? 'md:col-span-6'}`}>
              {to
                ? <CardLinkShell to={to} delay={i * 40}><c.component /></CardLinkShell>
                : <div className="card-enter" style={{ animationDelay: `${i * 40}ms` }}><c.component /></div>}
            </div>
          )
        })}
        {cards.length === 0 && (
          <p className="col-span-12 text-sm text-muted-foreground py-10 text-center">
            首页卡片将在各模块完成注册后自动出现（Task 9-17）
          </p>
        )}
      </div>
    </div>
  )
}
