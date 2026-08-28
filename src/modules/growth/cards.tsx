import { Link } from 'react-router-dom'
import { Check, Flame, TrendingUp } from 'lucide-react'
import { useGrowthActions } from './api'
import { celebrate } from '@/lib/celebrate'
import { useHabits, useHabitLogs, useSetHabitLog } from '../health/api'
import { todayStr } from '../../lib/db/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

export function GrowthCard() {
  const { data: actions } = useGrowthActions()
  const { data: habits } = useHabits()
  const { data: logs } = useHabitLogs()
  const setLog = useSetHabitLog()
  const today = todayStr()

  const active = (actions ?? []).filter(a => a.status === 'active').sort((a, b) => a.no - b.no)
  if (active.length === 0) return null

  const habitOf = (habitId: string | null) => habits?.find(h => h.id === habitId && h.active)
  const doneSet = new Set<string>()
  let weekDone = 0
  const now = new Date()
  for (let i = 0; i < 7; i++) {
    const d = new Date(now); d.setDate(d.getDate() - i)
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    for (const a of active) {
      const h = habitOf(a.habitId)
      if (h && logs?.some(l => l.habitId === h.id && l.logDate === key)) weekDone++
    }
  }
  const undone = active.filter(a => {
    const h = habitOf(a.habitId)
    if (!h) return false
    const done = logs?.some(l => l.habitId === h.id && l.logDate === today) ?? false
    if (done) doneSet.add(a.id)
    return !done
  })
  const todayDone = active.filter(a => doneSet.has(a.id)).length

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><TrendingUp className="size-4 text-primary" strokeWidth={1.7} />自我提升</CardTitle>
        <span className="text-[10px] text-muted-foreground">今日 {todayDone}/{active.length} · 本周 {weekDone}/{active.length * 7}</span>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {undone.slice(0, 3).map(a => {
          const h = habitOf(a.habitId)
          if (!h) return null
          return (
            <div key={a.id} className="flex items-center gap-2.5 text-[13px]">
              <span>{a.emoji}</span>
              <span className="flex-1 truncate">{a.title}</span>
              <button onClick={e => { void celebrate(e.currentTarget, undone.length === 1 ? 'grand' : 'single'); setLog.mutate({ habitId: h.id, date: today, count: 1 }, { onSuccess: () => toast.success(`「${a.title}」打卡成功`) }) }}
                aria-label={`打卡 ${a.title}`}
                className={cn('size-5 rounded-full border-[1.5px] flex items-center justify-center transition-colors active:scale-90 border-muted-foreground/40 text-muted-foreground hover:border-primary')}>
                <Check className="size-3" />
              </button>
            </div>
          )
        })}
        {undone.length === 0 && <p className="text-xs text-muted-foreground py-1">今日全部完成 🎉</p>}
        <div className="flex items-center justify-between pt-1.5">
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Flame className="size-3 text-orange-400" />
            全部完成即连续 +1
          </span>
          <Link to="/growth" className="text-[11px] text-primary">查看全部 →</Link>
        </div>
      </CardContent>
    </Card>
  )
}