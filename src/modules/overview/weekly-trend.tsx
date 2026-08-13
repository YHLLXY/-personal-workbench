import { lazy, Suspense } from 'react'
import { BarChart3 } from 'lucide-react'
import { useTasks } from './api'
import { useFocusSessions } from '../study/api'
import { buildWeeklyTrend } from '@/lib/stats'
import { todayStr } from '@/lib/db/types'
import { EmptyState } from '@/components/empty-state'
import { Skeleton } from '@/components/ui/skeleton'

const WeeklyTrendChart = lazy(() => import('./weekly-trend-chart').then(m => ({ default: m.WeeklyTrendChart })))

/** 本周趋势卡：近 7 天专注分钟柱状图 + 完成任务量折线（recharts，独立 chunk） */
export function WeeklyTrendCard() {
  const { data: tasks, isLoading: tl } = useTasks()
  const { data: sessions, isLoading: sl } = useFocusSessions()
  const days = buildWeeklyTrend(tasks ?? [], sessions ?? [], todayStr())
  const hasAny = days.some(d => d.tasks > 0 || d.minutes > 0)

  if (tl || sl) {
    return (
      <div className="rounded-2xl border border-border bg-card p-4">
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="size-4 text-primary" strokeWidth={1.7} />本周趋势
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="h-1.5 w-3 rounded-full bg-accent" />任务</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" />专注</span>
        </div>
      </div>
      {!hasAny ? (
        <EmptyState icon={<BarChart3 />} title="本周还没有记录" desc="完成任务或专注后，这里会出现趋势" className="py-6" />
      ) : (
        <Suspense fallback={
          <div className="flex h-[140px] items-end justify-between gap-2 px-1" aria-hidden>
            {[32, 55, 24, 70, 45, 86, 60].map((h, i) => (
              <div key={i} className="w-full rounded-t bg-muted" style={{ height: `${h}%` }} />
            ))}
          </div>
        }>
          <WeeklyTrendChart days={days} />
        </Suspense>
      )}
    </div>
  )
}
