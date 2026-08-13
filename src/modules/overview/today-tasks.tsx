import { useState } from 'react'
import { useTasks, useTaskMutations, todayTasks, overdueTasks } from './api'
import { TaskItem } from './task-item'
import { TaskDialog } from './task-dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { todayStr } from '@/lib/db/types'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import type { Task } from '@/lib/db/types'

export default function TodayTasks() {
  const { data: tasks, isLoading, isError } = useTasks()
  const { update, remove } = useTaskMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const today = todayStr()
  const list = todayTasks(tasks ?? [], today)
  const overdue = overdueTasks(tasks ?? [], today)
  const todayList = list.filter(t => !overdue.some(o => o.id === t.id))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">今日待办</h1>
          <p className="text-xs text-muted-foreground mt-0.5">共 {list.length} 项 · 标记 ⭐ 为今日焦点（最多 3 项）</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />新建</Button>
      </div>
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive py-10 text-center">加载失败，请重试</p>
      ) : list.length === 0 ? (
        <EmptyState icon="✓" title="今天没有待办" desc="点击右上角新建，或按 ⌘K 快速添加" />
      ) : (
        <div className="space-y-4">
          {overdue.length > 0 && (
            <section>
              <h2 className="text-xs text-destructive font-medium mb-1.5">已逾期 {overdue.length} 项</h2>
              <div className="space-y-1.5">
                {overdue.map(t => (
                  <div key={t.id} className="rounded-xl border border-destructive/25 bg-destructive/5">
                    <TaskItem task={t}
                      onToggle={() => update.mutate({ id: t.id, patch: { status: t.status === 'done' ? 'todo' : 'done' } })}
                      onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus } })}
                      onEdit={() => { setEditing(t); setDialogOpen(true) }}
                      onDelete={() => remove.mutate(t.id)}
                      onPostpone={() => update.mutate({ id: t.id, patch: { dueDate: today } })} />
                  </div>
                ))}
              </div>
            </section>
          )}
          {todayList.length > 0 && (
            <section>
              {overdue.length > 0 && <h2 className="text-xs font-medium text-muted-foreground mb-1.5">今日</h2>}
              <div className="space-y-1.5">
                {todayList.map(t => (
                  <TaskItem key={t.id} task={t}
                    onToggle={() => update.mutate({ id: t.id, patch: { status: t.status === 'done' ? 'todo' : 'done' } })}
                    onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus, focusDate: t.focus ? null : today } })}
                    onEdit={() => { setEditing(t); setDialogOpen(true) }}
                    onDelete={() => remove.mutate(t.id)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  )
}
