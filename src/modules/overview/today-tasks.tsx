import { useState } from 'react'
import { useTasks, useTaskMutations, todayTasks, recentOverdue, oldOverdue } from './api'
import { TaskItem } from './task-item'
import { TaskDialog } from './task-dialog'
import { Button } from '@/components/ui/button'
import { ChevronDown, Plus } from 'lucide-react'
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
  const recent = recentOverdue(tasks ?? [], today)
  const old = oldOverdue(tasks ?? [], today)
  const overdue = [...recent, ...old]
  const todayList = list.filter(t => !overdue.some(o => o.id === t.id))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">今日待办</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            今日 {todayList.length} 项{overdue.length > 0 && <span className="text-destructive"> · 逾期 {overdue.length} 项</span>} · 标记 ⭐ 为今日焦点（最多 3 项）
          </p>
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
              <h2 className="text-xs text-destructive font-medium mb-1.5">已逾期 {recent.length} 项{old.length > 0 && ` · 更早 ${old.length} 项已折叠`}</h2>
              {recent.length > 0 && (
                <div className="space-y-1.5">
                  {recent.map(t => (
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
              )}
              {old.length > 0 && (
                <details className="group rounded-xl border border-border bg-card">
                  <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <span className="flex items-center gap-1.5">
                      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                      更早过期 {old.length} 项
                    </span>
                    <span className="text-[10px]">点击展开</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-1.5">
                    {old.map(t => (
                      <TaskItem key={t.id} task={t}
                        onToggle={() => update.mutate({ id: t.id, patch: { status: t.status === 'done' ? 'todo' : 'done' } })}
                        onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus } })}
                        onEdit={() => { setEditing(t); setDialogOpen(true) }}
                        onDelete={() => remove.mutate(t.id)}
                        onPostpone={() => update.mutate({ id: t.id, patch: { dueDate: today } })} />
                    ))}
                    <Button
                      variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/30"
                      onClick={() => {
                        if (window.confirm(`将 ${old.length} 项更早过期的历史待办标记为已完成？这些任务将不再出现在待办中。`)) {
                          old.forEach(t => update.mutate({ id: t.id, patch: { status: 'done' } }))
                        }
                      }}>
                      清理历史待办（全部标记完成）
                    </Button>
                  </div>
                </details>
              )}
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
