import { useEffect, useState } from 'react'
import { CheckCircle2, Flame, Medal, Target, Trash2 } from 'lucide-react'
import { useGrowthMutations } from './api'
import { useHabits, useHabitLogs, useSetHabitLog } from '../health/api'
import { todayStr } from '../../lib/db/types'
import { streakFromLogDates } from '../../lib/heatmap'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'
import type { GrowthAction } from '../../lib/db/types'

const LEVEL_CLASS = ['bg-muted', 'bg-primary/25', 'bg-primary/55', 'bg-primary']

function stepsKey(id: string) { return `growth-steps-${id}` }
function readSteps(id: string): boolean[] {
  try { const v = JSON.parse(localStorage.getItem(stepsKey(id)) ?? '[]'); return Array.isArray(v) ? v.map(Boolean) : [] } catch { return [] }
}

export function ActionDetail({ action, onClose }: { action: GrowthAction | null; onClose: () => void }) {
  const { update, remove } = useGrowthMutations()
  const { data: habits } = useHabits()
  const { data: logs } = useHabitLogs()
  const setLog = useSetHabitLog()
  const today = todayStr()
  const [checks, setChecks] = useState<boolean[]>([])

  useEffect(() => {
    if (action) setChecks(readSteps(action.id))
    // 依赖整个 action：切到另一条行动时重置勾选状态（id 相同但内容变化也需刷新）
  }, [action])

  if (!action) return null
  const habit = habits?.find(h => h.id === action.habitId && h.active)
  const dates = habit ? new Set(logs?.filter(l => l.habitId === habit.id).map(l => l.logDate) ?? []) : new Set<string>()
  const streak = streakFromLogDates([...dates])
  const doneToday = habit ? dates.has(today) : false

  const cells: number[] = []
  if (habit) {
    const now = new Date()
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now); d.setDate(d.getDate() - i)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      cells.push(dates.has(key) ? 1 : 0)
    }
  }

  const toggleCheck = (i: number) => {
    const next = checks.map((c, j) => j === i ? !c : c)
    setChecks(next)
    localStorage.setItem(stepsKey(action.id), JSON.stringify(next))
  }

  const setStatus = (s: GrowthAction['status']) => {
    update.mutate({ id: action.id, patch: { status: s } }, { onSuccess: () => toast.success(s === 'done' ? '已标记完成，恭喜！' : s === 'paused' ? '已暂停' : '已恢复进行中') })
  }

  return (
    <Sheet open onOpenChange={open => !open && onClose()}>
      <SheetContent className="w-full max-w-md overflow-y-auto p-0 sm:max-w-md">
        <div className="p-5 border-b border-border/70">
          <SheetHeader className="text-left">
            <SheetTitle className="flex items-center gap-2 text-base">
              <span className="text-xl">{action.emoji}</span>{action.title}
            </SheetTitle>
            <SheetDescription className="text-[11px]">行动 {action.no} · {action.category}
              {habit && <span className="ml-2">打卡：{streak > 0 ? `🔥 连续 ${streak} 天` : '今天还没打卡'}</span>}
            </SheetDescription>
          </SheetHeader>
          <div className="flex items-center gap-1.5 mt-3">
            <Badge className={cn('cursor-pointer', action.status === 'active' && 'bg-primary')} onClick={() => setStatus('active')}>进行中</Badge>
            <Badge variant="secondary" className="cursor-pointer" onClick={() => setStatus('paused')}>暂停</Badge>
            <Badge variant="secondary" className="cursor-pointer" onClick={() => setStatus('done')}>完成</Badge>
            <span className="text-[10px] text-muted-foreground ml-auto">点击切换状态</span>
          </div>
        </div>

        <div className="p-5 space-y-5">
          {habit && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-medium text-muted-foreground">打卡热力图（近 14 天）</p>
                <button onClick={() => { setLog.mutate({ habitId: habit.id, date: today, count: doneToday ? 0 : 1 }, { onSuccess: () => toast.success(doneToday ? '已取消今日打卡' : '今日打卡成功') }) }}
                  className={cn('text-xs px-3 py-1.5 rounded-full border', doneToday ? 'bg-primary/10 border-primary text-primary' : 'border-border text-muted-foreground hover:border-primary')}>
                  {doneToday ? '今日已打卡 ✓' : '今日打卡'}
                </button>
              </div>
              <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
                {cells.map((c, i) => <span key={i} className={cn('h-4 rounded-[4px]', LEVEL_CLASS[c as 0 | 1] ?? 'bg-muted')} />)}
              </div>
              <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1"><Flame className="size-3 text-orange-400" />连续 {streak} 天</span>
                {[7, 21, 30].map(n => (
                  <span key={n} className={cn('flex items-center gap-1', streak >= n && 'text-primary font-medium')}>
                    <Medal className="size-3" />{streak >= n ? `达成 ${n} 天` : `${n} 天`}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">为什么做</p>
            <p className="text-sm leading-relaxed text-foreground/90">{action.why}</p>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5">怎么做（{checks.filter(Boolean).length}/{action.steps.length}）</p>
            <div className="space-y-1.5">
              {action.steps.map((s, i) => (
                <button key={i} onClick={() => toggleCheck(i)} className="w-full text-left flex items-start gap-2.5 bg-muted/40 border border-border/70 rounded-xl px-3 py-2.5">
                  <span className={cn('size-4 rounded border mt-0.5 shrink-0 flex items-center justify-center transition-colors', checks[i] ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40')}>
                    {checks[i] && <CheckCircle2 className="size-3" />}
                  </span>
                  <span className={cn('text-[13px] leading-snug', checks[i] && 'text-muted-foreground line-through')}>{s}</span>
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1.5 flex items-center gap-1"><Target className="size-3" />量化目标</p>
            <ul className="text-[13px] space-y-1 list-disc pl-4 text-foreground/90">
              {action.targets.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground mb-1">验证方式</p>
            <p className="text-[13px] text-foreground/80">{action.verify}</p>
          </div>

          <button onClick={() => {
            if (confirm(`确定删除「${action.title}」？打卡记录会一并保留（习惯不删除），但行动内容将丢失。`)) {
              remove.mutate(action.id, { onSuccess: () => { toast.success('行动已删除'); onClose() } })
            }
          }} className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-destructive">
            <Trash2 className="size-3" />删除该行动
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}