import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '../../lib/db'
import { todayStr } from '../../lib/db/types'
import type { Exam, ExamInput } from '../../lib/db/types'

export const examKeys = { all: ['exams'] as const }
export const focusKeys = { all: ['focusSessions'] as const }

export function useExams() { return useQuery({ queryKey: examKeys.all, queryFn: () => repository.listExams() }) }
/** 最近的未过期考试 */
export function useExamsSoon() { return useQuery({ queryKey: examKeys.all, queryFn: () => repository.listExams(), select: exams => exams.filter(e => e.examDate >= todayStr()).sort((a, b) => a.examDate.localeCompare(b.examDate)).slice(0, 5) }) }

export function useExamMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: examKeys.all })
  return {
    create: useMutation({ mutationFn: (input: ExamInput) => repository.createExam(input), onSuccess: invalidate }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<Exam> }) => repository.updateExam(id, patch), onSuccess: invalidate }),
    remove: useMutation({ mutationFn: (id: string) => repository.deleteExam(id), onSuccess: invalidate }),
  }
}

export function useFocusSessions() { return useQuery({ queryKey: focusKeys.all, queryFn: () => repository.listFocusSessions() }) }
/** 今日专注总分钟 */
export function useFocusToday() {
  return useQuery({ queryKey: focusKeys.all, queryFn: () => repository.listFocusSessions(), select: sessions => {
    const today = todayStr()
    const list = sessions.filter(s => s.startAt.slice(0, 10) === today)
    return { minutes: list.reduce((sum, s) => sum + s.minutes, 0), count: list.length }
  } })
}
export function useCreateFocus() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ minutes, note }: { minutes: number; note?: string }) => repository.createFocusSession(minutes, note), onSuccess: () => qc.invalidateQueries({ queryKey: focusKeys.all }) })
}

export function daysUntil(dateStr: string): number {
  const d = Math.ceil((new Date(dateStr + 'T00:00:00').getTime() - Date.now()) / 86400000)
  // Math.ceil 对 (0, -1) 区间的负分数返回 -0，归一化为 0
  return d === 0 ? 0 : d
}
