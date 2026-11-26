import type { PlanItem, StudyGoal } from './db/types'

/**
 * 学习目标进度的账本式口径（v1.36，委托书 5.4）。
 *
 * 核心问题：旧实现的 progress 是一个**被加减出来的数字**。完成一条关联任务时 +5，撤销时 -5——
 * 一旦某次撤销没发生（刷新、关页、并发），这个数字就永久偏了，而且没人知道偏了多少。
 *
 * 改成账本：\`display = clamp(基准确认值 + 已完成计划项之和, 0, target)\`。
 * - 自动部分永远从事实（plan_items.done_at）重新派生，撤销只要清掉 done_at，数字自己回退；
 * - 手动 ± 改的是**基准**，不是展示值，所以"手动 + 自动"不会双算；
 * - 零迁移：老目标的 progress 原值就是基准，没有关联任务时 auto=0，展示与升级前一模一样。
 */

/** 一条计划项贡献多少（amount 缺省按 1 计——生成任务时没填量的，一次完成算一步） */
export function amountOf(item: PlanItem): number {
  return item.amount ?? 1
}

/** 自动推进量：已完成的、归属该目标的计划项之和 */
export function autoProgress(items: PlanItem[], goalId: string): number {
  let sum = 0
  for (const item of items) {
    if (item.goalId !== goalId || item.doneAt === null) continue
    sum += amountOf(item)
  }
  return sum
}

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v))

/** 展示进度：基准 + 自动，夹在 [0, target] */
export function displayProgress(goal: StudyGoal, items: PlanItem[]): { value: number; auto: number } {
  const auto = autoProgress(items, goal.id)
  return { value: clamp(goal.progress + auto, 0, goal.target), auto }
}

/** 手动校准：想让展示值等于 desired，应该把基准写回多少。
 *  例：基准 0、自动 48、用户点 +1 期望 49 → 写回 1，而不是把展示值当基准写成 49（那就成了双算）。 */
export function calibrateBase(goal: StudyGoal, items: PlanItem[], desired: number): number {
  const auto = autoProgress(items, goal.id)
  return clamp(desired - auto, 0, goal.target)
}

/** 完成率百分比（target 为 0 时给 0，不产生 NaN） */
export function progressPercent(goal: StudyGoal, items: PlanItem[]): number {
  if (goal.target <= 0) return 0
  return Math.round((displayProgress(goal, items).value / goal.target) * 100)
}
