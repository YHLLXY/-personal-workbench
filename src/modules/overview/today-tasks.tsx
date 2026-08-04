import { useState } from 'react'
import { useTasks, useTaskMutations, todayTasks } from './api'
import { TaskItem } from './task-item'
import { TaskDialog } from './task-dialog'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { todayStr } from '@/lib/db/types'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'

export default function TodayTasks() {
  const { data: tasks, isLoading } = useTasks()
  const { update, remove } = useTaskMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const today = todayStr()
  const list = todayTasks(tasks ?? [], today)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">今日待办</h1>
          <p className="text-xs text-muted-foreground mt-0.5">共 {list.length} 项 · 标记 ⭐ 为今日焦点（最多 3 项）</p>
        </div>
        <Button onClick={() => setDialogOpen(true)}><Plus className="size-4 mr-1" />新建</Button>
      </div>
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : list.length === 0 ? (
        <EmptyState icon="✓" title="今天没有待办" desc="点击右上角新建，或按 ⌘K 快速添加" />
      ) : (
        <div className="space-y-1.5">
          {list.map(t => <TaskItem key={t.id} task={t} onToggle={() => update.mutate({ id: t.id, patch: { status: t.status === 'done' ? 'todo' : 'done' } })} onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus } })} onEdit={() => {}} onDelete={() => remove.mutate(t.id)} />)}
        </div>
      )}
      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  )
}
