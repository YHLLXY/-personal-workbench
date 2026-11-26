import { describe, it, expect } from 'vitest'
import type { PlanItem, StudyGoal } from '../src/lib/db/types'
import { autoProgress, calibrateBase, displayProgress, progressPercent } from '../src/lib/study-progress'

const goal: StudyGoal = { id: 'g1', title: '复习 1100 个单词', target: 1100, progress: 100, deadline: null, status: 'active', note: null, completedAt: null }
function item(over: Partial<PlanItem> & { taskId: string }): PlanItem {
  return { planDate: '2026-11-27', title: 't', goalId: 'g1', amount: 20, doneAt: null, movedTo: null, createdAt: '2026-11-27T00:00:00.000Z', ...over }
}

describe('autoProgress（自动推进）', () => {
  it('只累加「已完成 + 归属本目标」的计划项', () => {
    const items = [
      item({ taskId: 'a', doneAt: '2026-11-27T10:00:00.000Z' }),
      item({ taskId: 'b' }), // 未完成
      item({ taskId: 'c', goalId: 'g2', doneAt: '2026-11-27T10:00:00.000Z' }), // 别的目标
    ]
    expect(autoProgress(items, 'g1')).toBe(20)
  })

  it('amount 缺省按 1 计', () => {
    expect(autoProgress([item({ taskId: 'a', amount: null, doneAt: '2026-11-27T10:00:00.000Z' })], 'g1')).toBe(1)
  })
})

describe('displayProgress（展示值）', () => {
  it('展示 = 基准 + 自动，并夹在 [0, target]', () => {
    const items = [item({ taskId: 'a', doneAt: '2026-11-27T10:00:00.000Z' })]
    expect(displayProgress(goal, items)).toEqual({ value: 120, auto: 20 })
    expect(displayProgress({ ...goal, progress: 1090 }, items).value).toBe(1100)
  })

  it('老目标没有任何关联任务时，展示与升级前完全一致（零迁移）', () => {
    expect(displayProgress(goal, []).value).toBe(100)
  })

  it('撤销完成：清掉 done_at 后展示自动回退，不需要减操作（不重复计数）', () => {
    const done = [item({ taskId: 'a', doneAt: '2026-11-27T10:00:00.000Z' })]
    const undone = [item({ taskId: 'a', doneAt: null })]
    expect(displayProgress(goal, done).value).toBe(120)
    expect(displayProgress(goal, undone).value).toBe(100)
  })

  it('改期/删除任务不影响：进度只看 done_at，不看计划日；计划项保留即历史贡献不丢', () => {
    const moved = [item({ taskId: 'a', planDate: '2026-11-20', movedTo: '2026-11-28', doneAt: '2026-11-21T10:00:00.000Z' })]
    expect(displayProgress(goal, moved).value).toBe(120)
  })
})

describe('calibrateBase（手动校准）', () => {
  it('点 +1 时写回的是「期望值 − 自动」，不是把展示值当基准（否则双算）', () => {
    const items = [item({ taskId: 'a', doneAt: '2026-11-27T10:00:00.000Z' })] // auto=20
    const base = calibrateBase(goal, items, 121) // 用户希望看到 121
    expect(base).toBe(101)
    expect(displayProgress({ ...goal, progress: base }, items).value).toBe(121)
  })

  it('校准结果夹在 [0, target]，不会写负数或超过目标', () => {
    const items = [item({ taskId: 'a', amount: 200, doneAt: '2026-11-27T10:00:00.000Z' })]
    expect(calibrateBase(goal, items, 0)).toBe(0)
    expect(calibrateBase(goal, items, 1100)).toBe(900)
  })
})

describe('progressPercent', () => {
  it('百分比四舍五入；target=0 不产生 NaN', () => {
    expect(progressPercent(goal, [item({ taskId: 'a', doneAt: '2026-11-27T10:00:00.000Z' })])).toBe(11)
    expect(progressPercent({ ...goal, target: 0 }, [])).toBe(0)
  })
})
