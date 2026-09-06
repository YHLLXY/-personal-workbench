import { describe, it, expect } from 'vitest'
import { isDoneForToday, todayTasks, todayDone } from '../src/modules/overview/api'
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
