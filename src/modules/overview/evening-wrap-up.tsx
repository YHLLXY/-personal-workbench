import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { addDays } from '@/lib/repeat'
import { todayStr, type Task } from '@/lib/db/types'
import { useTaskMutations } from './api'
import { usePlanWrites } from './day-plan-api'
import { dayLabel } from '@/lib/day-plan'
import { cn } from '@/lib/utils'

/** 一条未完成任务的去向。默认「保持」——收尾是"确认"，不是"批量清空"（委托书 2.1） */
export type Disposition = 'keep' | 'tomorrow' | 'later' | 'someday'
const DISPOSITIONS: Array<{ key: Disposition; label: string; hint: string }> = [
  { key: 'keep', label: '保持', hint: '留在今天（明天会变成逾期）' },
  { key: 'tomorrow', label: '明天', hint: '改到明天，1 次点击' },
  { key: 'later', label: '延期', hint: '不排期，进「以后 · 待安排」' },
  { key: 'someday', label: '搁置', hint: '进「以后 · 将来」收件箱' },
]

/**
 * 收尾（结束今天，v1.35）。
 *
 * 解决的是"晚间处理 5 项 ≥15 次点击"：原来每一条都要进 ⋯ 菜单选日期，或者干脆不管它。
 * 现在一条一行、四个去向按钮，逐条选完一次确认；默认全部「保持」，不会手一滑把今天的活全推走。
 * 「全部设为明天」是**二次操作**（点了之后仍要确认），不是默认动作。
 */
export function EveningWrapUp({ open, onOpenChange, tasks }: {
  open: boolean
  onOpenChange: (open: boolean) => void
  tasks: Task[]
}) {
  const { update } = useTaskMutations()
  const plan = usePlanWrites()
  const today = todayStr()
  const tomorrow = addDays(today, 1)
  const [choices, setChoices] = useState<Record<string, Disposition>>({})

  // 每次打开重置为「保持」：上一次收尾留下的选择不该悄悄影响这一次
  useEffect(() => { if (open) setChoices({}) }, [open])

  const chosen = (t: Task): Disposition => choices[t.id] ?? 'keep'
  const tally = tasks.reduce((acc, t) => { acc[chosen(t)] += 1; return acc }, { keep: 0, tomorrow: 0, later: 0, someday: 0 } as Record<Disposition, number>)
  const changes = tally.tomorrow + tally.later + tally.someday

  function apply() {
    const undos: Array<() => void> = []
    for (const t of tasks) {
      const to = chosen(t)
      if (to === 'keep') continue
      const before = { dueDate: t.dueDate, status: t.status }
      if (to === 'tomorrow') {
        update.mutate({ id: t.id, patch: { dueDate: tomorrow } })
        void plan.move(t, tomorrow, today)
      } else if (to === 'later') {
        update.mutate({ id: t.id, patch: { dueDate: null } })
      } else {
        update.mutate({ id: t.id, patch: { status: 'someday', dueDate: null } })
      }
      undos.push(() => {
        update.mutate({ id: t.id, patch: before })
        if (to === 'tomorrow') void plan.unmove(t, t.dueDate ?? today, tomorrow)
      })
    }
    onOpenChange(false)
    toast.success('已处理 ' + changes + ' 项', {
      description: [
        tally.tomorrow > 0 && '明天 ' + tally.tomorrow,
        tally.later > 0 && '延期 ' + tally.later,
        tally.someday > 0 && '搁置 ' + tally.someday,
        tally.keep > 0 && '保持 ' + tally.keep,
      ].filter(Boolean).join(' · '),
      action: { label: '撤销', onClick: () => undos.forEach(f => f()) },
      duration: 6000,
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader>
          <SheetTitle>结束今天{tasks.length > 0 ? ' · 还有 ' + tasks.length + ' 项没完成' : ''}</SheetTitle>
          <SheetDescription>逐条选去向，默认「保持」。不改的任务明天会变成逾期。</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-2 space-y-2">
          {tasks.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">今天没有未完成的任务 🎉</p>
          ) : tasks.map(t => (
            <div key={t.id} className="rounded-xl border border-border bg-card p-2.5">
              <p className="text-sm leading-snug break-words line-clamp-2">{t.title}</p>
              <div className="mt-2 grid grid-cols-4 gap-1">
                {DISPOSITIONS.map(d => (
                  <button key={d.key} type="button" title={d.hint} aria-pressed={chosen(t) === d.key}
                    onClick={() => setChoices(c => ({ ...c, [t.id]: d.key }))}
                    className={cn('h-9 rounded-lg border text-xs transition-colors',
                      chosen(t) === d.key ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground')}>
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        <SheetFooter className="border-t border-border">
          <p className="text-xs text-muted-foreground">
            将移动 {tally.tomorrow} 项 · 延期 {tally.later} 项 · 搁置 {tally.someday} 项 · 保持 {tally.keep} 项
            {changes > 0 && ' · 明天 = ' + dayLabel(tomorrow, today)}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="h-11 flex-1" disabled={tasks.length === 0}
              onClick={() => setChoices(Object.fromEntries(tasks.map(t => [t.id, 'tomorrow' as Disposition])))}>
              全部设为明天
            </Button>
            <Button className="h-11 flex-1" disabled={changes === 0} onClick={apply}>确认</Button>
          </div>
          <Button variant="ghost" className="h-9" onClick={() => onOpenChange(false)}>取消</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
