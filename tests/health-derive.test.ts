import { describe, it, expect } from 'vitest'
import { growthBoundHabitIds, partitionHabits } from '../src/modules/health/derive'
import type { GrowthAction, Habit } from '../src/lib/db/types'

function habit(id: string): Habit {
  return { id, name: id, icon: '✅', color: '#000', targetPerDay: 1, active: true, createdAt: '2026-08-28' }
}

function action(habitId: string | null, status: GrowthAction['status'] = 'active'): GrowthAction {
  return {
    id: `a-${habitId ?? 'none'}`, no: 1, title: 't', emoji: '📈', category: '学业', why: '', steps: [], targets: [],
    verify: '', habitId, status, sort: 0, createdAt: '2026-08-28',
  }
}

describe('growthBoundHabitIds', () => {
  it('收集全部非空 habitId，含暂停/已完成行动', () => {
    const ids = growthBoundHabitIds([action('h1'), action('h2', 'paused'), action('h3', 'done'), action(null)])
    expect([...ids].sort()).toEqual(['h1', 'h2', 'h3'])
  })
  it('空行动列表 → 空集合', () => {
    expect(growthBoundHabitIds([]).size).toBe(0)
  })
})

describe('partitionHabits', () => {
  it('按绑定关系分组，保持原有顺序', () => {
    const habits = [habit('h1'), habit('h2'), habit('h3')]
    const { own, linked } = partitionHabits(habits, new Set(['h2']))
    expect(own.map(h => h.id)).toEqual(['h1', 'h3'])
    expect(linked.map(h => h.id)).toEqual(['h2'])
  })
  it('无绑定 → 全部归 own', () => {
    const habits = [habit('h1'), habit('h2')]
    const { own, linked } = partitionHabits(habits, new Set())
    expect(own).toHaveLength(2)
    expect(linked).toHaveLength(0)
  })
  it('全部绑定 → 全部归 linked', () => {
    const habits = [habit('h1')]
    const { own, linked } = partitionHabits(habits, growthBoundHabitIds([action('h1', 'paused')]))
    expect(own).toHaveLength(0)
    expect(linked.map(h => h.id)).toEqual(['h1'])
  })
})
