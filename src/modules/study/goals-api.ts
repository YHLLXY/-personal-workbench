import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { repository } from '../../lib/db'
import type { StudyGoal, StudyGoalInput } from '../../lib/db/types'

export const goalKeys = { all: ['studyGoals'] as const }

export function useStudyGoals() { return useQuery({ queryKey: goalKeys.all, queryFn: () => repository.listStudyGoals() }) }

export function useStudyGoalMutations() {
  const qc = useQueryClient()
  const invalidate = () => qc.invalidateQueries({ queryKey: goalKeys.all })
  return {
    create: useMutation({ mutationFn: (input: StudyGoalInput) => repository.createStudyGoal(input), onSuccess: invalidate, onError: () => toast.error('添加失败') }),
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<StudyGoal> }) => repository.updateStudyGoal(id, patch), onSuccess: invalidate, onError: () => toast.error('保存失败') }),
    remove: useMutation({ mutationFn: (id: string) => repository.deleteStudyGoal(id), onSuccess: invalidate, onError: () => toast.error('删除失败') }),
  }
}
