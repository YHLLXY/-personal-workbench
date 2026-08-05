import { Link } from 'react-router-dom'
import { CheckCircle2, Flame, RotateCcw, Timer, type LucideIcon } from 'lucide-react'
import { useTasks, todayTasks } from './api'
import { useFocusToday } from '../study/api'
import { useHabits, useHabitStats } from '../health/api'
import { useTodayReview } from '../review/api'
import { todayStr } from '@/lib/db/types'
import type { Task } from '@/lib/db/types'

/** 今日概览条：待办 / 专注 / 打卡 / 复盘 四格，桌面与移动端共用（点击跳转对应模块） */
export function OverviewSummary() {
  const { data: tasks } = useTasks()
  const { data: focus } = useFocusToday()
  const { data: stats } = useHabitStats()
  const { data: habits } = useHabits()
  const { data: review } = useTodayReview()

  const today = todayStr()
  const list = todayTasks(tasks ?? [], today)
  const inScope = (t: Task) => t.dueDate === today || t.focus
  const done = (tasks ?? []).filter(t => t.status === 'done' && inScope(t)).length
  const total = done + list.length
  const activeHabits = (habits ?? []).filter(h => h.active).length
  const ready = !!habits && !!stats
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)

  return (
    <div className="grid grid-cols-2 gap-2 md:grid-cols-4 md:gap-3">
      <SummaryCard to="/tasks" icon={CheckCircle2} title="今日待办" main={`${done} / ${total}`} sub={pct > 0 ? `完成率 ${pct}%` : '项任务'} />
      <SummaryCard to="/pomodoro" icon={Timer} title="今日专注" main={`${focus?.minutes ?? 0}`} sub="分钟" />
      <SummaryCard to="/health" icon={Flame} title="今日打卡" main={ready ? `${stats?.todayCount ?? 0} / ${activeHabits}` : '…'} sub={stats ? `连续 ${stats.streak} 天` : ''} />
      <SummaryCard to="/review" icon={RotateCcw} title="今日复盘" main={review ? '✓ 已写' : '○ 待写'} sub={review ? '今日已复盘' : '去写一篇'} />
    </div>
  )
}

function SummaryCard({ to, icon: Icon, title, main, sub }: { to: string; icon: LucideIcon; title: string; main: string; sub: string }) {
  return (
    <Link to={to} className="rounded-2xl border border-border bg-card p-3 transition-colors hover:border-primary/40 md:p-4">
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Icon className="size-3.5" strokeWidth={1.7} />{title}
      </div>
      <div className="mt-1 text-lg font-bold font-numeric md:text-xl">{main}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </Link>
  )
}
