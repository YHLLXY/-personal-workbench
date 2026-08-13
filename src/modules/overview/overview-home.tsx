import { Link } from 'react-router-dom'
import { CheckCircle2, Star, ArrowRight, Flame } from 'lucide-react'
import { OverviewSummary } from './overview-summary'
import { useTasks, todayTasks } from './api'
import { useExamsSoon, daysUntil } from '../study/api'
import { useHeatCells } from '../health/api'
import { todayStr } from '@/lib/db/types'
import { Skeleton } from '@/components/ui/skeleton'
import { MobileHomeEntries } from '@/components/mobile-entries'
import { WeeklyTrendCard } from './weekly-trend'

export default function OverviewHome() {
  const { data: tasks, isLoading: tl } = useTasks()
  const { data: exams } = useExamsSoon()
  const nextExam = exams?.[0]
  const today = todayStr()
  const list = todayTasks(tasks ?? [], today).slice(0, 5)
  const focusList = (tasks ?? []).filter(t => t.focus && t.focusDate === today && t.status !== 'done').slice(0, 3)

  return (
    <div className="md:hidden mx-auto max-w-md space-y-3">
      {/* KPI 条 — 替换为四格概览条 */}
      <OverviewSummary />
      {/* 今日焦点 */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm font-semibold mb-2"><Star className="size-4 text-primary" strokeWidth={1.7} />今日焦点</div>
        {focusList.length === 0
          ? <p className="text-xs text-muted-foreground">去今日待办标记 ⭐</p>
          : focusList.map(t => (
            <div key={t.id} className="flex items-center gap-2 text-sm py-1"><span className="text-primary">·</span>{t.title}</div>
          ))}
      </div>
      {/* 今日待办 */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2 text-sm font-semibold"><CheckCircle2 className="size-4 text-primary" strokeWidth={1.7} />今日待办</div>
          <Link to="/tasks" className="text-xs text-muted-foreground flex items-center gap-0.5">全部 <ArrowRight className="size-3" /></Link>
        </div>
        {tl ? <Skeleton className="h-20 w-full" /> : list.length === 0
          ? <p className="text-xs text-muted-foreground py-3">今天没有待办 🎉</p>
          : list.map(t => (
            <div key={t.id} className="flex items-center gap-2.5 text-sm py-2 border-b border-border/60 last:border-0">
              <span className={`size-4 rounded border-[1.5px] shrink-0 ${t.status === 'done' ? 'bg-primary border-primary' : 'border-muted-foreground/40'}`} />
              <span className={`truncate flex-1 ${t.status === 'done' ? 'line-through text-muted-foreground' : ''}`}>{t.title}</span>
              {t.focus && <Star className="size-3.5 text-primary" strokeWidth={1.7} fill="currentColor" />}
            </div>
          ))}
      </div>
      {/* 最近考试 → 学习管理 */}
      {nextExam && (
        <Link to="/study" className="block bg-card border border-border rounded-2xl p-4 transition-all active:scale-[0.98]">
          <div className="text-xs text-muted-foreground">最近考试</div>
          <div className="text-2xl font-extrabold font-numeric mt-1">{daysUntil(nextExam.examDate)}<span className="text-sm font-normal text-muted-foreground ml-1">天后 · {nextExam.title}</span></div>
        </Link>
      )}
      {/* 习惯热力 → 运动健康 */}
      <Link to="/health" className="block bg-card border border-border rounded-2xl p-4 transition-all active:scale-[0.98]">
        <div className="flex items-center gap-2 text-sm font-semibold mb-2"><Flame className="size-4 text-primary" strokeWidth={1.7} />习惯打卡</div>
        <MiniHeatmap />
      </Link>
      {/* 快捷入口 */}
      <MobileHomeEntries />
      <WeeklyTrendCard />
    </div>
  )
}

function MiniHeatmap() {
  const { data: cells } = useHeatCells(14)
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
      {cells?.map((c, i) => <span key={i} className={`h-3.5 rounded-[4px] ${c.level === 0 ? 'bg-muted' : c.level === 1 ? 'bg-primary/25' : c.level === 2 ? 'bg-primary/55' : 'bg-primary'}`} />)}
    </div>
  )
}
