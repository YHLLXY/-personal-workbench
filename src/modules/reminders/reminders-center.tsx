import { Link } from 'react-router-dom'
import { useReminders } from './api'
import { useTaskMutations, useTasks } from '@/modules/overview/api'
import { useExams } from '@/modules/study/api'
import { useStudyGoals } from '@/modules/study/goals-api'
import { countDue, kindLabel, reminderFacts, type ReminderRefs, type ReminderState } from './format'
import { AlertTriangle, Bell, CalendarClock, Clock3, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { todayStr } from '@/lib/db/types'
import type { Reminder } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/** 三组的固定顺序与配色：已逾期（红）→ 待处理（主色）→ 即将到来（默认）。
 *  分组取代了旧版「全部 / 未读 / 已忽略」三个 tab —— 那三个 tab 的存在本身就是「提醒被当成实体」的产物。 */
const GROUPS: Array<{ key: ReminderState; title: string }> = [
  { key: 'overdue', title: '已逾期' },
  { key: 'due', title: '待处理' },
  { key: 'upcoming', title: '即将到来' },
]

const ROW_TONE: Record<ReminderState, string> = {
  overdue: 'border-destructive/35 bg-destructive/8',
  due: 'border-primary/30 bg-primary/5',
  upcoming: 'border-border bg-card',
}

export default function RemindersCenter() {
  const { data: reminders, isLoading, isError } = useReminders()
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const { data: goals } = useStudyGoals()
  const { update } = useTaskMutations()
  const taskById = new Map((tasks ?? []).map(t => [t.id, t]))
  const examById = new Map((exams ?? []).map(e => [e.id, e]))
  const goalById = new Map((goals ?? []).map(g => [g.id, g]))
  const now = Date.now()
  const today = todayStr()

  function refsOf(r: Reminder): ReminderRefs {
    return r.refType === 'task' ? { task: taskById.get(r.refId) }
      : r.refType === 'exam' ? { exam: examById.get(r.refId) }
      : { goal: goalById.get(r.refId) }
  }
  const rows = (reminders ?? []).map(r => ({ r, facts: reminderFacts(r, refsOf(r), now) }))
  // 组内统一按到期时刻升序：拖得最久 / 最早到点的排最前，顶上永远是最该处理的那条
  rows.sort((a, b) => a.r.scheduledAt.localeCompare(b.r.scheduledAt))
  const dueCount = countDue(reminders ?? [], now)
  const overdueCount = rows.filter(x => x.facts.state === 'overdue').length

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold">提醒中心</h1>
        <p className="text-xs text-muted-foreground mt-0.5">任务到期、考试节点与目标截止 · 到点发通知，逾期标红；把事处理掉，提醒自动消失</p>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3 text-xs">
        <span className="rounded-full border border-destructive/30 bg-destructive/8 text-destructive px-3 py-1.5">已逾期 {overdueCount}</span>
        <span className="rounded-full border border-primary/30 bg-primary/8 text-primary px-3 py-1.5">待处理 {dueCount - overdueCount}</span>
        <span className="rounded-full border border-border text-muted-foreground px-3 py-1.5">即将到来 {rows.length - dueCount}</span>
      </div>
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive py-10 text-center">加载失败，请重试</p>
      ) : rows.length === 0 ? (
        <EmptyState icon="⏰" title="暂无提醒" desc="给待办设置提醒时间、给考试设置考试时间后，这里会按节点出现提醒" />
      ) : (
        <div className="space-y-4">
          {GROUPS.map(g => {
            const list = rows.filter(x => x.facts.state === g.key)
            if (list.length === 0) return null
            return (
              <section key={g.key}>
                <h2 className={cn('text-xs font-medium mb-1.5 flex items-center gap-1.5', g.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
                  {g.key === 'overdue' && <AlertTriangle className="size-3.5" strokeWidth={2} />}
                  {g.title} {list.length} 条
                </h2>
                <div className="space-y-1.5">
                  {list.map(({ r, facts }) => (
                    <div key={r.id} className={cn('flex items-start gap-3 rounded-xl border p-3', ROW_TONE[facts.state])}>
                      {facts.state === 'overdue'
                        ? <AlertTriangle className="size-4 mt-0.5 shrink-0 text-destructive" strokeWidth={1.8} />
                        : facts.state === 'due'
                          ? <Bell className="size-4 mt-0.5 shrink-0 text-primary" strokeWidth={1.7} />
                          : <Clock3 className="size-4 mt-0.5 shrink-0 text-muted-foreground" strokeWidth={1.7} />}
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium break-words">{facts.text}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {kindLabel(r.kind)} · {new Date(r.scheduledAt).toLocaleString('zh-CN', { hour12: false })}
                          {r.sentAt ? ' · 已通知' : facts.state === 'upcoming' ? ' · 待通知' : ' · 未送达'}
                          {facts.state === 'overdue' && ' · 已逾期'}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5 self-center">
                        {r.refType === 'task' && !facts.missing && (
                          <>
                            {facts.state === 'overdue' && (
                              <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => update.mutate({ id: r.refId, patch: { dueDate: today } }, { onSuccess: () => toast.success('已顺延到今天') })}>
                                <CalendarClock className="size-3 mr-1" />顺延
                              </Button>
                            )}
                            <Button size="sm" variant="ghost" className="h-7 text-[11px]" onClick={() => update.mutate({ id: r.refId, patch: { status: 'done' } }, { onSuccess: () => toast.success('已完成，提醒已消除') })}>完成</Button>
                          </>
                        )}
                        {!facts.missing && (
                          <Link to={r.refType === 'task' ? '/tasks' : '/study'} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                            查看<ExternalLink className="size-3" />
                          </Link>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
