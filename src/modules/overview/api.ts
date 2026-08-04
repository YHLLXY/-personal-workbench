import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
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
    create: useMutation({ mutationFn: (input: TaskInput) => repository.createTask(input), onSuccess: invalidate }),
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

/** 今日任务（含过期未完成） */
export function todayTasks(tasks: Task[], today: string): Task[] {
  return tasks
    .filter(t => t.status !== 'done' && (t.dueDate === today || t.focus))
    .sort((a, b) => Number(b.focus) - Number(a.focus) || priorityRank(a) - priorityRank(b))
}
function priorityRank(t: Task) { return t.priority === 'high' ? 0 : t.priority === 'medium' ? 1 : 2 }
