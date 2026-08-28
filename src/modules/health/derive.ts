import type { GrowthAction, Habit } from '../../lib/db/types'

/** 被任意状态行动绑定的习惯 id 集合。
 *  归属判定是结构关系（行动通过 habitId 关联习惯），与行动 active/paused/done 无关：
 *  被绑定的习惯打卡收敛到「自我提升」，健康模块只保留自有习惯，避免同一习惯两处打卡。 */
export function growthBoundHabitIds(actions: GrowthAction[]): Set<string> {
  return new Set(actions.map(a => a.habitId).filter((x): x is string => x != null))
}

/** 把习惯分成「健康自有」与「行动绑定」两组（今日打卡/快速打卡/习惯管理共用） */
export function partitionHabits(habits: Habit[], bound: Set<string>): { own: Habit[]; linked: Habit[] } {
  const own: Habit[] = []
  const linked: Habit[] = []
  for (const h of habits) (bound.has(h.id) ? linked : own).push(h)
  return { own, linked }
}
