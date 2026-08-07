import { homeCards } from '@/registry'
import OverviewHome from '@/modules/overview/overview-home'
import { OverviewSummary } from '@/modules/overview/overview-summary'
import ReminderBanner from '@/modules/reminders/reminder-banner'

const SPAN_CLASS: Record<string, string> = {
  '3': 'md:col-span-3',
  '4': 'md:col-span-4',
  '5': 'md:col-span-5',
  '7': 'md:col-span-7',
  '12': 'md:col-span-12',
}

export default function Home() {
  const cards = homeCards().sort((a, b) => a.desktopOrder - b.desktopOrder)
  return (
    <div className="mx-auto max-w-7xl">
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
        {cards.map(c => (
          <div key={c.id} className={`col-span-12 ${SPAN_CLASS[c.span] ?? 'md:col-span-6'}`}>
            <c.component />
          </div>
        ))}
        {cards.length === 0 && (
          <p className="col-span-12 text-sm text-muted-foreground py-10 text-center">
            首页卡片将在各模块完成注册后自动出现（Task 9-17）
          </p>
        )}
      </div>
    </div>
  )
}
