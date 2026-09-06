import { describe, it, expect } from 'vitest'
import { isDoneForToday, todayTasks, todayDone } from '../src/modules/overview/api'
import { midpointSort } from '../src/lib/drag-sort'
import type { Task } from '../src/lib/db/types'

const TODAY = '2026-09-06'

function task(overrides: Partial<Task>): Task {
  return { id: 't', title: '任务', focus: false, priority: 'medium', status: 'todo', dueDate: TODAY, dueTime: null, focusDate: null, tags: [], sort: 1, completedAt: null, createdAt: '2026-09-01T00:00:00.000Z', ...overrides }
}

describe('isDoneForToday / todayDone / todayTasks（v1.24 repeat 口径）', () => {
  const repeatDaily = { freq: 'daily' as const, interval: 1, anchor: 'due' as const }

  it('isDoneForToday：普通完成看 status；repeat 完成看 completedAt 当天', () => {
    expect(isDoneForToday(task({ status: 'done' }), TODAY)).toBe(true)
    expect(isDoneForToday(task({ status: 'todo' }), TODAY)).toBe(false)
    // repeat 任务完成当天：status 仍是 todo（同一行滚动），但 completedAt 是今天 → 视为已完成
    expect(isDoneForToday(task({ repeat: repeatDaily, completedAt: `2026-09-06T02:00:00.000Z` }), TODAY)).toBe(true)
    // repeat 任务昨天完成的：dueDate 已滚到今天，不算已完成
    expect(isDoneForToday(task({ repeat: repeatDaily, completedAt: '2026-09-05T02:00:00.000Z' }), TODAY)).toBe(false)
  })

  it('todayDone 收容 repeat 完成态（划线保留 + 撤销语义一致）', () => {
    const normal = task({ id: 'a', status: 'done', completedAt: '2026-09-06T01:00:00.000Z' })
    const repeatDone = task({ id: 'b', repeat: repeatDaily, completedAt: '2026-09-06T02:00:00.000Z', dueDate: '2026-09-07' })
    const repeatStale = task({ id: 'c', repeat: repeatDaily, completedAt: '2026-09-05T02:00:00.000Z', dueDate: TODAY })
    const done = todayDone([normal, repeatDone, repeatStale], TODAY)
    expect(done.map(t => t.id)).toEqual(['b', 'a']) // 完成时间倒序
  })

  it('todayTasks 排除当天已滚动的 repeat 任务（防同帧双显）', () => {
    const repeatDoneToday = task({ id: 'a', repeat: repeatDaily, completedAt: '2026-09-06T02:00:00.000Z', dueDate: TODAY })
    const normal = task({ id: 'b' })
    const list = todayTasks([repeatDoneToday, normal], TODAY)
    expect(list.map(t => t.id)).toEqual(['b'])
  })

  it('todayTasks：repeat 昨日完成、今日到期 → 正常出现在今日区', () => {
    const t = task({ id: 'a', repeat: repeatDaily, completedAt: '2026-09-05T02:00:00.000Z' })
    expect(todayTasks([t], TODAY).map(x => x.id)).toEqual(['a'])
  })
})

describe('todayTasks 排序（v1.24 E：焦点 → doing → sort 降序）', () => {
  it('优先级不再参与比较（已烘焙进 sort），doing 优先于普通待办', () => {
    const low = task({ id: 'low', sort: 1e13 + 1 })
    const high = task({ id: 'high', priority: 'high', sort: 3e13 + 5 })
    const doing = task({ id: 'doing', status: 'doing', sort: 2e13 + 3 })
    const focusLow = task({ id: 'focus', focus: true, focusDate: TODAY, sort: 1e13 + 2 })
    expect(todayTasks([low, high, doing, focusLow], TODAY).map(t => t.id)).toEqual(['focus', 'doing', 'high', 'low'])
  })
  it('sort 相同分组内按 sort 降序（手动拖拽序生效）', () => {
    const a = task({ id: 'a', sort: 2e13 + 100 })
    const b = task({ id: 'b', sort: 2e13 + 200 })
    expect(todayTasks([a, b], TODAY).map(t => t.id)).toEqual(['b', 'a'])
  })
})

describe('midpointSort（v1.24 E：半序中点）', () => {
  it('两侧邻取中点；拖到头/尾用 ±65536 步长', () => {
    expect(midpointSort(3e13, 2e13)).toBe(2.5e13)
    expect(midpointSort(undefined, 2e13)).toBe(2e13 + 65536)
    expect(midpointSort(3e13, undefined)).toBe(3e13 - 65536)
  })
  it('空列表兜底保持烘焙值域 ≥1e13（防本地惰性归一化二次烘焙）', () => {
    expect(midpointSort(undefined, undefined)).toBeGreaterThanOrEqual(1e13)
  })
})
