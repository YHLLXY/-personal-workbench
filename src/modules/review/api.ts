import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '../../lib/db'
import { todayStr } from '../../lib/db/types'

export const reviewKeys = { all: ['reviews'] as const }
export function useReviews() { return useQuery({ queryKey: reviewKeys.all, queryFn: () => repository.listReviews() }) }
export function useTodayReview() { return useQuery({ queryKey: reviewKeys.all, queryFn: () => repository.listReviews(), select: rs => rs.find(r => r.reviewDate === todayStr()) ?? null }) }
export function useSaveReview() {
  const qc = useQueryClient()
  return useMutation({ mutationFn: ({ mood, summary, planTomorrow }: { mood: number; summary: string; planTomorrow: string }) => repository.upsertReview(todayStr(), { mood, summary, planTomorrow }), onSuccess: () => qc.invalidateQueries({ queryKey: reviewKeys.all }) })
}
