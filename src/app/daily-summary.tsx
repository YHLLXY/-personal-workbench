import { useEffect, useMemo, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from '@/components/ui/button'
import { CalendarDays, ChevronDown, ChevronUp, ClipboardList, Sparkles } from 'lucide-react'
import { useTasks, useTaskMutations, todayTasks } from '@/modules/overview/api'
import { useExamsSoon } from '@/modules/study/api'
import { todayStr, localDateOfISO } from '@/lib/db/types'
import { CHANGELOG } from './changelog'
import { greeting } from '@/lib/greeting'

const STORAGE_KEY = 'wb:daily-summary-shown'

/** 两个 YYYY-MM-DD 的整天数差（UTC 纯字符串运算，避免本地时区陷阱） */
export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000)
}

export function daysLabel(n: number): string {
  if (n <= 0) return '今天'
  if (n === 1) return '明天'
  return `${n} 天后`
}

function fmtDate(ymd: string): string {
  const [, m, d] = ymd.split('-')
  return `${Number(m)} 月 ${Number(d)} 日`
}

export default function DailySummary() {
  const { data: tasks, isLoading: tasksLoading } = useTasks()
  const { data: exams, isLoading: examsLoading } = useExamsSoon()
  const { update } = useTaskMutations()
  const [open, setOpen] = useState(false)
  const [showAllLog, setShowAllLog] = useState(false)
  const today = todayStr()

  // 打开应用弹一次：数据就绪后判断，sessionStorage 标记避免刷新重复弹
  useEffect(() => {
    if (tasksLoading || examsLoading) return
    if (sessionStorage.getItem(STORAGE_KEY)) return
    const pending = todayTasks(tasks ?? [], today)
    const upcoming = (exams ?? []).slice(0, 3)
    if (pending.length === 0 && upcoming.length === 0) return
    sessionStorage.setItem(STORAGE_KEY, '1')
    setOpen(true)
  }, [tasksLoading, examsLoading, tasks, exams, today])

  // 今日已完成：按实际完成日期统计（逾期任务今天完成、焦点任务等都能计入）
  const doneToday = useMemo(
    () => (tasks ?? []).filter(t => t.status === 'done' && t.completedAt && localDateOfISO(t.completedAt) === today).length,
    [tasks, today],
  )
  const pendingList = useMemo(() => todayTasks(tasks ?? [], today), [tasks, today])
  const totalToday = doneToday + pendingList.length
  const percent = totalToday === 0 ? 0 : Math.round((doneToday / totalToday) * 100)
  const upcoming = (exams ?? []).slice(0, 3)
  const latest = CHANGELOG[0]

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {greeting(new Date())}，今天是 {fmtDate(today)}
          </DialogTitle>
          <DialogDescription>今天的安排与最新动态</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          {/* 今日待办 */}
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <ClipboardList className="size-4 text-primary" /> 今日待办
            </h3>
            {totalToday === 0 ? (
              <p className="mt-1.5 text-sm text-muted-foreground">今天没有安排任务</p>
            ) : (
              <>
                <div className="mt-2 flex items-center gap-2">
                  <Progress value={percent} className="h-2 flex-1" />
                  <span className="shrink-0 text-xs text-muted-foreground">
                    已完成 {doneToday}/{totalToday}
                  </span>
                </div>
                {pendingList.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {pendingList.map(t => (
                      <li key={t.id} className="flex items-center gap-2 py-0.5 text-sm">
                        <Checkbox onCheckedChange={() => update.mutate({ id: t.id, patch: { status: 'done' } })} />
                        <span className="truncate">{t.title}</span>
                        {t.dueTime && (
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{t.dueTime}</span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </section>

          {/* 考试倒计时 */}
          {upcoming.length > 0 && (
            <section>
              <h3 className="flex items-center gap-1.5 text-sm font-semibold">
                <CalendarDays className="size-4 text-primary" /> 考试倒计时
              </h3>
              <ul className="mt-1.5 space-y-1">
                {upcoming.map(e => (
                  <li key={e.id} className="flex items-center justify-between gap-3 py-0.5 text-sm">
                    <span className="truncate">{e.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {fmtDate(e.examDate)} · {daysLabel(daysBetween(e.examDate, today))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {/* 更新日志 */}
          <section>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold">
              <Sparkles className="size-4 text-primary" /> 更新日志
            </h3>
            <div className="mt-1.5 rounded-md border p-2.5">
              <p className="text-sm font-medium">
                {latest.version} · {latest.date} · {latest.title}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                {latest.items.map(i => (
                  <li key={i}>· {i}</li>
                ))}
              </ul>
            </div>
            {CHANGELOG.length > 1 && (
              <Button variant="ghost" size="sm" className="mt-1 h-6 text-xs" onClick={() => setShowAllLog(v => !v)}>
                {showAllLog ? '收起历史' : '查看全部历史'}
                {showAllLog ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
              </Button>
            )}
            {showAllLog && (
              <ul className="mt-1 space-y-2 pl-1 text-xs text-muted-foreground">
                {CHANGELOG.slice(1).map(e => (
                  <li key={e.version}>
                    <span className="font-medium">
                      {e.version} · {e.date}
                    </span>{' '}
                    {e.title}
                    <ul className="pl-3">
                      {e.items.map(i => (
                        <li key={i}>· {i}</li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  )
}
