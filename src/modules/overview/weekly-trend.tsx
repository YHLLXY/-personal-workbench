import { BarChart3 } from 'lucide-react'
import { useTasks } from './api'
import { useFocusSessions } from '../study/api'
import { buildWeeklyTrend } from '@/lib/stats'
import { todayStr } from '@/lib/db/types'
import { EmptyState } from '@/components/empty-state'

/** 本周趋势卡：近 7 天任务完成数 + 专注分钟，纯 CSS 双柱状图 */
export function WeeklyTrendCard() {
  const { data: tasks } = useTasks()
  const { data: sessions } = useFocusSessions()
  const days = buildWeeklyTrend(tasks ?? [], sessions ?? [], todayStr())
  const max = Math.max(1, ...days.map(d => Math.max(d.tasks, d.minutes)))
  const hasAny = days.some(d => d.tasks > 0 || d.minutes > 0)

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          <BarChart3 className="size-4 text-primary" strokeWidth={1.7} />本周趋势
        </div>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-primary" />任务</span>
          <span className="flex items-center gap-1"><span className="size-2 rounded-sm bg-muted-foreground/40" />专注</span>
        </div>
      </div>
      {!hasAny ? (
        <EmptyState icon={<BarChart3 />} title="本周还没有记录" desc="完成任务或专注后，这里会出现趋势" className="py-6" />
      ) : (
        <div className="flex h-28 items-end justify-between gap-2">
          {days.map(d => (
            <div key={d.date} className="flex w-full flex-col items-center gap-1">
              <div className="flex h-20 w-full items-end justify-center gap-1">
                <div className="w-2.5 rounded-t bg-primary/80" style={{ height: `${(d.tasks / max) * 100}%`, minHeight: d.tasks > 0 ? 4 : 0 }} title={`${d.label} 完成 ${d.tasks} 个任务`} />
                <div className="w-2.5 rounded-t bg-muted-foreground/40" style={{ height: `${(d.minutes / max) * 100}%`, minHeight: d.minutes > 0 ? 4 : 0 }} title={`${d.label} 专注 ${d.minutes} 分钟`} />
              </div>
              <span className="text-[10px] text-muted-foreground">{d.label}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
