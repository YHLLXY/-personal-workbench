import { Link } from 'react-router-dom'
import { CheckCircle2, Star, ArrowRight } from 'lucide-react'
import { useTasks, todayTasks } from './api'
import { todayStr } from '@/lib/db/types'
import { Skeleton } from '@/components/ui/skeleton'
import { MobileHomeEntries } from '@/components/mobile-entries'

export default function OverviewHome() {
  const { data: tasks, isLoading: tl } = useTasks()
  const list = todayTasks(tasks ?? [], todayStr()).slice(0, 5)
  const focusList = (tasks ?? []).filter(t => t.focus && t.status !== 'done').slice(0, 3)

  return (
    <div className="md:hidden mx-auto max-w-md space-y-3">
      {/* KPI 条 */}
      <div className="grid grid-cols-3 gap-2">
        <Kpi label="今日待办" value={`${list.filter(t => t.status !== 'done').length}`} unit="项" />
        {/* TODO M3: 接入 useFocusToday（专注时长） */}
        <Kpi label="专注时长" value="0" unit="h" />
        {/* TODO M5: 接入 useHabitStats（连续打卡） */}
        <Kpi label="连续打卡" value="0" unit="天" />
      </div>
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
      {/* TODO M3: 最近考试卡片（useExamsSoon + daysUntil） */}
      {/* TODO M5: 习惯热力图（useHeatCells） */}
      {/* 快捷入口 */}
      <MobileHomeEntries />
    </div>
  )
}

function Kpi({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <div className="bg-card border border-border rounded-xl px-3 py-2.5">
      <div className="text-base font-extrabold font-numeric">{value}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span></div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}
