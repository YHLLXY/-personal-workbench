import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { repository } from '../../lib/db'
import type { Task, TaskInput } from '../../lib/db/types'

export const taskKeys = { all: ['tasks'] as const }

export function useTasks() {
  return useQuery({ queryKey: taskKeys.all, queryFn: () => repository.listTasks() })
}

export function useTaskMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: taskKeys.all })
  return {
    create: useMutation({ mutationFn: (input: TaskInput) => repository.createTask(input), onSuccess: invalidate, onError: () => toast.error('添加失败') }),
    update: useMutation({
      mutationFn: ({ id, patch }: { id: string; patch: Partial<Task> }) => repository.updateTask(id, patch),
      onMutate: async ({ id, patch }) => {
        // 乐观更新
        await qc.cancelQueries({ queryKey: taskKeys.all })
        const prev = qc.getQueryData<Task[]>(taskKeys.all) ?? []
        qc.setQueryData<Task[]>(taskKeys.all, prev.map(t => t.id === id ? { ...t, ...patch } : t))
        return { prev }
      },
      onError: (_e, _v, ctx) => ctx && qc.setQueryData(taskKeys.all, ctx.prev),
      onSettled: invalidate,
    }),
    remove: useMutation({
      mutationFn: (id: string) => repository.deleteTask(id),
      onMutate: async (id) => {
        await qc.cancelQueries({ queryKey: taskKeys.all })
        const prev = qc.getQueryData<Task[]>(taskKeys.all) ?? []
        qc.setQueryData<Task[]>(taskKeys.all, prev.filter(t => t.id !== id))
        return { prev }
      },
      onError: (_e, _v, ctx) => ctx && qc.setQueryData(taskKeys.all, ctx.prev),
      onSettled: invalidate,
    }),
  }
}

/** 今日任务（今日到期 + 今日焦点 + 已过期未完成，不含 done） */
export function todayTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter(t => t.status !== 'done' && (t.dueDate === today || (t.focus && t.focusDate === today) || (t.dueDate && t.dueDate < today)))
    .sort((a, b) => Number(b.focus) - Number(a.focus) || priorityRank(a) - priorityRank(b))
}
/** 已过期未完成任务（顺延/逾期区用） */
export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter(t => t.status !== 'done' && t.dueDate !== null && t.dueDate < today)
}
/** 近 windowDays 天内的逾期（逾期区用，默认 7 天限窗） */
export function recentOverdue(tasks: Task[], today: string, windowDays = 7): Task[] {
  const start = daysBefore(today, windowDays)
  return tasks.filter(t => t.status !== 'done' && t.dueDate !== null && t.dueDate < today && t.dueDate >= start)
}
/** 更早的逾期（折叠区 + 一键归档用） */
export function oldOverdue(tasks: Task[], today: string, windowDays = 7): Task[] {
  const start = daysBefore(today, windowDays)
  return tasks.filter(t => t.status !== 'done' && t.dueDate !== null && t.dueDate < start)
}
function daysBefore(dateStr: string, n: number): string {
  const d = new Date(`${dateStr}T00:00:00`)
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function priorityRank(t: Task) { return t.priority === 'high' ? 0 : t.priority === 'medium' ? 1 : 2 }
