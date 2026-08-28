import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { repository } from '../../lib/db'
import { todayStr } from '../../lib/db/types'
import { buildHeatCells, streakFromLogDates } from '../../lib/heatmap'

export const habitKeys = { all: ['habits'] as const }
export const habitLogKeys = { all: ['habitLogs'] as const }
export const healthKeys = { all: ['healthLogs'] as const }

export function useHabits() { return useQuery({ queryKey: habitKeys.all, queryFn: () => repository.listHabits() }) }
export function useHabitMutations() {
  // deleteHabit 会级联删除 habitLogs，需连同日志缓存一起失效，避免热力图/连续天数残留已删习惯的日期
  const qc = useQueryClient(); const inv = () => { qc.invalidateQueries({ queryKey: habitKeys.all }); qc.invalidateQueries({ queryKey: habitLogKeys.all }) }
  return {
    create: useMutation({ mutationFn: (input: { name: string; icon?: string; color?: string; targetPerDay?: number }) => repository.createHabit(input), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => repository.deleteHabit(id), onSuccess: inv }),
  }
}
export function useHabitLogs() { return useQuery({ queryKey: habitLogKeys.all, queryFn: () => repository.listHabitLogs() }) }
export function useSetHabitLog() {
  const qc = useQueryClient(); const inv = () => qc.invalidateQueries({ queryKey: habitLogKeys.all })
  return useMutation({ mutationFn: ({ habitId, date, count }: { habitId: string; date: string; count: number }) => repository.setHabitLog(habitId, date, count), onSuccess: inv })
}
/** 首页统计：连续天数 + 今日完成数（select 派生，与 useHeatCells 共用同一份日志缓存） */
export function useHabitStats() {
  return useQuery({ queryKey: habitLogKeys.all, queryFn: () => repository.listHabitLogs(), select: logs => {
    const today = todayStr()
    return { streak: streakFromLogDates(logs.map(l => l.logDate)), todayCount: logs.filter(l => l.logDate === today).length }
  } })
}
export function useHeatCells(days = 14) {
  return useQuery({ queryKey: habitLogKeys.all, queryFn: () => repository.listHabitLogs(), select: logs => buildHeatCells(logs.map(l => l.logDate), days) })
}

export function useHealthLogs() { return useQuery({ queryKey: healthKeys.all, queryFn: () => repository.listHealthLogs() }) }
export function useHealthMutations() {
  const qc = useQueryClient(); const inv = () => qc.invalidateQueries({ queryKey: healthKeys.all })
  return {
    create: useMutation({
      mutationFn: (input: { logDate: string; type: 'weight' | 'sleep' | 'exercise'; value: number }) => repository.createHealthLog(input),
      onSuccess: inv,
      onError: () => toast.error('记录失败，请重试'), // 失败必须有反馈，否则用户重按造成重复记录
    }),
    remove: useMutation({ mutationFn: (id: string) => repository.deleteHealthLog(id), onSuccess: inv }),
  }
}
