import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { repository } from '../../lib/db'
import { todayStr } from '../../lib/db/types'

export const reviewKeys = { all: ['reviews'] as const }
export function useReviews() { return useQuery({ queryKey: reviewKeys.all, queryFn: () => repository.listReviews() }) }
export function useTodayReview() { return useQuery({ queryKey: reviewKeys.all, queryFn: () => repository.listReviews(), select: rs => rs.find(r => r.reviewDate === todayStr()) ?? null }) }

export interface ReviewPatchInput {
  reviewDate?: string
  mood?: number
  summary?: string
  planTomorrow?: string
  achievements?: string
  reflection?: string
  gratitude?: string
  learnings?: string
  score?: number | null
}

/** 保存复盘（默认今天；reviewDate 指定可编辑/回存历史日期，upsert 天然支持） */
export function useSaveReview() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (input: ReviewPatchInput) => {
      const { reviewDate, ...patch } = input
      return repository.upsertReview(reviewDate ?? todayStr(), patch)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }),
    onError: () => toast.error('保存失败，请重试'),
  })
}
