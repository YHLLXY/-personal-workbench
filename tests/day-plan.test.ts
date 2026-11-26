import { describe, it, expect } from 'vitest'
import type { PlanItem, Task } from '../src/lib/db/types'
import { completePlanInput, materialize, planItemOn, plansOnDate, reschedulePlan, shiftDate, statsForDate, trimPlanItems } from '../src/lib/day-plan'

const T = '2026-11-26'
const Y = '2026-11-25'

function task(over: Partial<Task> & { id: string }): Task {
  return {
    title: '任务', focus: false, focusDate: null, priority: 'medium', status: 'todo',
    dueDate: null, dueTime: null, tags: [], sort: 1, completedAt: null, createdAt: '2026-11-01T00:00:00.000Z',
    ...over,
  } as Task
}
function item(over: Partial<PlanItem> & { planDate: string; taskId: string }): PlanItem {
  return { title: '任务', goalId: null, amount: null, doneAt: null, movedTo: null, createdAt: '2026-11-26T00:00:00.000Z', ...over }
}

describe('plansOnDate', () => {
  it('当天到期 / 当天焦点 / 进行中 都进当天计划', () => {
    expect(plansOnDate(task({ id: 'a', dueDate: T }), T)).toBe(true)
    expect(plansOnDate(task({ id: 'b', focus: true, focusDate: T }), T)).toBe(true)
    expect(plansOnDate(task({ id: 'c', status: 'doing' }), T)).toBe(true)
  })
  it('明天到期、无日期待安排、将来（someday）都不进今天', () => {
    expect(plansOnDate(task({ id: 'd', dueDate: '2026-11-27' }), T)).toBe(false)
    expect(plansOnDate(task({ id: 'e', dueDate: null }), T)).toBe(false)
    expect(plansOnDate(task({ id: 'f', status: 'someday' }), T)).toBe(false)
  })
})

describe('materialize（物化）', () => {
  it('只补今天该有计划项、且还没有行的任务', () => {
    const tasks = [task({ id: 'a', dueDate: T, title: '写报告' }), task({ id: 'b', dueDate: '2026-11-30' })]
    const need = materialize(tasks, [], T)
    expect(need).toEqual([{ planDate: T, taskId: 'a', title: '写报告', goalId: null, amount: null }])
  })

  it('幂等：已经有行的任务不再产出补丁（同一天重复进页面不会重复插）', () => {
    const tasks = [task({ id: 'a', dueDate: T })]
    const items = [item({ planDate: T, taskId: 'a' })]
    expect(materialize(tasks, items, T)).toEqual([])
  })

  it('已勾掉但还没有行的任务：补行时一并落完成事实（否则当天分母偏大、完成偏小）', () => {
    const done = task({ id: 'c', dueDate: T, status: 'done', completedAt: `${T}T09:00:00.000Z` })
    expect(materialize([done], [], T)).toEqual([
      { planDate: T, taskId: 'c', title: '任务', goalId: null, amount: null, doneAt: `${T}T09:00:00.000Z` },
    ])
  })

  it('重复任务当天完成（status 仍是 todo、dueDate 已滚到下一期）不算今天，由完成入口单独写行', () => {
    const repeated = task({ id: 'r', dueDate: '2026-11-27', completedAt: `${T}T09:00:00.000Z`, repeat: { freq: 'daily', interval: 1, anchor: 'due' } })
    expect(materialize([repeated], [], T)).toEqual([])
  })
})

describe('statsForDate（当日 5/3/2 口径）', () => {
  it('计划 / 完成 / 未完成 / 已改期 / 完成率', () => {
    const items = [
      item({ planDate: T, taskId: 'a', doneAt: `${T}T10:00:00.000Z` }),
      item({ planDate: T, taskId: 'b', doneAt: `${T}T11:00:00.000Z` }),
      item({ planDate: T, taskId: 'c', doneAt: `${T}T12:00:00.000Z` }),
      item({ planDate: T, taskId: 'd', movedTo: '2026-11-28' }),
      item({ planDate: T, taskId: 'e' }),
    ]
    expect(statsForDate(items, T)).toMatchObject({ planned: 5, done: 3, unfinished: 2, moved: 1, rate: 60 })
  })

  it('计划为 0 时不出百分比（0% 会被误读成"一项都没完成"）', () => {
    expect(statsForDate([], T)).toMatchObject({ planned: 0, done: 0, rate: null })
  })

  it('补完成单独计数，不混进当天 5/3/2', () => {
    const items = [
      item({ planDate: T, taskId: 'a' }),
      item({ planDate: Y, taskId: 'old', doneAt: `${T}T08:00:00.000Z` }),
    ]
    const s = statsForDate(items, T)
    expect(s).toMatchObject({ planned: 1, done: 0, backfilled: 1 })
  })

  it('历史那天不受今天改期影响：11-25 的计划项改期到 11-30 后，11-25 仍是「计划 1 未完成 1」', () => {
    const items = [item({ planDate: Y, taskId: 'a', movedTo: '2026-11-30' })]
    expect(statsForDate(items, Y)).toMatchObject({ planned: 1, done: 0, unfinished: 1, moved: 1 })
    expect(statsForDate(items, T)).toMatchObject({ planned: 0, done: 0 })
  })
})

describe('完成 / 改期的计划项补丁', () => {
  it('逾期任务今天补完成：落在它原来的计划日（进「今日补完成」，不进今日分母）', () => {
    const t = task({ id: 'x', dueDate: Y })
    expect(completePlanInput(t, T, new Date(`${T}T09:00:00.000Z`))).toMatchObject({ planDate: Y, doneAt: `${T}T09:00:00.000Z` })
  })

  it('没有到期日的任务：计划日按今天算', () => {
    expect(completePlanInput(task({ id: 'x' }), T, new Date(`${T}T09:00:00.000Z`)).planDate).toBe(T)
  })

  it('改期产出两条补丁：旧行 moved_to + 新行标题快照并清空 moved_to', () => {
    const r = reschedulePlan(task({ id: 'x', dueDate: T, title: '写报告' }), '2026-11-28', T)
    expect(r.fromDate).toBe(T)
    expect(r.from).toEqual({ planDate: T, taskId: 'x', movedTo: '2026-11-28' })
    expect(r.to).toEqual({ planDate: '2026-11-28', taskId: 'x', title: '写报告', movedTo: null })
  })
})

describe('辅助', () => {
  it('trimPlanItems 只留 400 天内（字符串比较即时间序）', () => {
    const items = [item({ planDate: '2024-01-01', taskId: 'old' }), item({ planDate: T, taskId: 'new' })]
    expect(trimPlanItems(items, T).map(i => i.taskId)).toEqual(['new'])
    expect(trimPlanItems(items, T, 10_000).map(i => i.taskId)).toEqual(['old', 'new'])
  })
  it('shiftDate 跨月/跨年', () => {
    expect(shiftDate('2026-11-26', -400)).toBe('2025-10-22')
    expect(shiftDate('2026-01-01', -1)).toBe('2025-12-31')
    expect(shiftDate('2026-02-28', 1)).toBe('2026-03-01')
  })
  it('planItemOn 按 (日期, 任务) 取行', () => {
    const items = [item({ planDate: T, taskId: 'a', title: 'A' })]
    expect(planItemOn(items, T, 'a')?.title).toBe('A')
    expect(planItemOn(items, Y, 'a')).toBeUndefined()
  })
})
