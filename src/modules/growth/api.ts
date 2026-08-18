import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { repository } from '../../lib/db'
import type { GrowthAction, GrowthActionInput } from '../../lib/db/types'
import { GROWTH_PRESETS } from './presets'

export { GROWTH_PRESETS }

export const growthKeys = { all: ['growthActions'] as const }

export function useGrowthActions() { return useQuery({ queryKey: growthKeys.all, queryFn: () => repository.listGrowthActions() }) }

/** 计算待导入清单：按 no 跳过已存在的行动（幂等核心，纯函数便于测试） */
export function buildImportPlan(existing: GrowthAction[]): GrowthActionInput[] {
  const haveNos = new Set(existing.map(g => g.no))
  return GROWTH_PRESETS.filter(p => !haveNos.has(p.no))
}

/** 一键导入十项行动：逐条创建 Habit（icon=行动 emoji）+ GrowthAction（habitId 关联）。
 *  幂等：按 no 跳过已存在的行动，重复调用不会产生重复数据。 */
export function useImportPresets() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (existing: GrowthAction[]) => {
      const results: GrowthAction[] = []
      for (const p of buildImportPlan(existing)) {
        const habit = await repository.createHabit({ name: p.title, icon: p.emoji, color: '#5B8A72', targetPerDay: 1 })
        const action = await repository.createGrowthAction({ ...p, habitId: habit.id } as GrowthActionInput)
        results.push(action)
      }
      return results.length
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: growthKeys.all })
      qc.invalidateQueries({ queryKey: ['habits'] })
      qc.invalidateQueries({ queryKey: ['habitLogs'] })
    },
  })
}

export function useGrowthMutations() {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: growthKeys.all })
  return {
    update: useMutation({ mutationFn: ({ id, patch }: { id: string; patch: Partial<GrowthAction> }) => repository.updateGrowthAction(id, patch), onSuccess: inv }),
    remove: useMutation({ mutationFn: (id: string) => repository.deleteGrowthAction(id), onSuccess: inv }),
  }
}
