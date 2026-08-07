import { useReminderMutations, useReminders } from './api'
import { useTasks } from '@/modules/overview/api'
import { useExams } from '@/modules/study/api'
import { kindLabel, reminderText } from './format'
import type { Reminder } from '@/lib/db/types'
import { Bell, BellOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { cn } from '@/lib/utils'

export default function RemindersCenter() {
  const { data: reminders, isLoading, isError } = useReminders()
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const { dismiss, restore } = useReminderMutations()
  const taskById = new Map((tasks ?? []).map(t => [t.id, t]))
  const examById = new Map((exams ?? []).map(e => [e.id, e]))

  function describe(r: Reminder): { title: string; text: string; date: string; time: string | null } {
    if (r.refType === 'task') {
      const t = taskById.get(r.refId)
      return { title: t?.title ?? '（任务已删除）', text: reminderText(r.kind, t?.title ?? '', t?.dueDate ?? '', t?.dueTime ?? null), date: t?.dueDate ?? '', time: t?.dueTime ?? null }
    }
    const e = examById.get(r.refId)
    return { title: e?.title ?? '（考试已删除）', text: reminderText(r.kind, e?.title ?? '', e?.examDate ?? '', e?.examTime ?? null), date: e?.examDate ?? '', time: e?.examTime ?? null }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">提醒中心</h1>
          <p className="text-xs text-muted-foreground mt-0.5">任务到期与考试节点提醒 · 应用内与系统推送双通道</p>
        </div>
      </div>
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive py-10 text-center">加载失败，请重试</p>
      ) : (reminders ?? []).length === 0 ? (
        <EmptyState icon="⏰" title="暂无提醒" desc="给待办设置提醒时间、给考试设置考试时间后，这里会按节点出现提醒" />
      ) : (
        <div className="space-y-1.5">
          {(reminders ?? []).map(r => {
            const d = describe(r)
            const unread = !r.dismissedAt
            return (
              <div key={r.id} className={cn('flex items-start gap-3 rounded-xl border border-border bg-card p-3', unread && 'border-primary/30 bg-primary/5')}>
                {unread ? <Bell className="size-4 mt-0.5 shrink-0 text-primary" strokeWidth={1.7} /> : <BellOff className="size-4 mt-0.5 shrink-0 text-muted-foreground" strokeWidth={1.7} />}
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{d.text}</div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    {kindLabel(r.kind)} · {new Date(r.scheduledAt).toLocaleString('zh-CN', { hour12: false })}
                    {r.sentAt ? ' · 已发送' : unread ? ' · 待发送' : ''}
                    {r.dismissedAt ? ' · 已忽略' : ''}
                  </div>
                </div>
                {r.dismissedAt ? (
                  <Button size="sm" variant="outline" onClick={() => restore.mutate(r.id)}>恢复</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => dismiss.mutate(r.id)}>忽略</Button>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
