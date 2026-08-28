import { describe, it, expect } from 'vitest'
import { todayTasks, overdueTasks, recentOverdue, oldOverdue, isTodayScope } from '../src/modules/overview/api'
import type { Task } from '../src/lib/db/types'

function t(partial: Partial<Task>): Task { return { id: 'x', title: 't', focus: false, priority: 'medium', status: 'todo', dueDate: null, dueTime: null, focusDate: null, tags: [], sort: 0, completedAt: null, createdAt: '', ...partial } }

describe('todayTasks', () => {
  it('只显示今日到期、今日焦点或已逾期任务', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-08-04' }), t({ id: 'b', dueDate: '2026-08-10' }), t({ id: 'c', focus: true, focusDate: '2026-08-04' }), t({ id: 'd', status: 'done', dueDate: '2026-08-04' }), t({ id: 'e', dueDate: '2026-08-03' })]
    const list = todayTasks(tasks, '2026-08-04')
    expect(list.map(x => x.id).sort()).toEqual(['a', 'c', 'e'])
  })
  it('焦点任务仅在其绑定日期显示（bug 回归：昨天的焦点明天不再出现）', () => {
    const tasks = [t({ id: 'a', focus: true, focusDate: '2026-08-03' }), t({ id: 'b', focus: true, focusDate: '2026-08-04' }), t({ id: 'c', focus: true, focusDate: null })]
    const list = todayTasks(tasks, '2026-08-04')
    expect(list.map(x => x.id)).toEqual(['b'])
  })
  it('焦点任务排在前面', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-08-04' }), t({ id: 'b', focus: true, focusDate: '2026-08-04', dueDate: '2026-08-04' })]
    expect(todayTasks(tasks, '2026-08-04')[0].id).toBe('b')
  })
  it('高优先级排前', () => {
    const tasks = [t({ id: 'a', priority: 'low', dueDate: '2026-08-04' }), t({ id: 'b', priority: 'high', dueDate: '2026-08-04' })]
    expect(todayTasks(tasks, '2026-08-04')[0].id).toBe('b')
  })
})

describe('overdueTasks', () => {
  it('只返回已过期未完成任务（不含 done 与今日/未来/无日期）', () => {
    const tasks = [
      t({ id: 'a', dueDate: '2026-08-03' }),
      t({ id: 'b', dueDate: '2026-08-04' }),
      t({ id: 'c', status: 'done', dueDate: '2026-08-03' }),
      t({ id: 'd', dueDate: null }),
      t({ id: 'e', dueDate: '2026-08-05' }),
    ]
    const list = overdueTasks(tasks, '2026-08-04')
    expect(list.map(x => x.id)).toEqual(['a'])
  })
  it('顺延语义：把 overdue 的 dueDate 改成今天后不再属于逾期', () => {
    const postponed = t({ id: 'a', dueDate: '2026-08-04' })
    expect(overdueTasks([postponed], '2026-08-04')).toHaveLength(0)
    expect(todayTasks([postponed], '2026-08-04').map(x => x.id)).toEqual(['a'])
  })
})

describe('recentOverdue', () => {
  it('只返回近 7 天内的逾期（含第 7 天边界），不含 done', () => {
    const tasks = [
      t({ id: 'a', dueDate: '2026-08-03' }),
      t({ id: 'b', dueDate: '2026-07-27' }),
      t({ id: 'c', status: 'done', dueDate: '2026-08-03' }),
      t({ id: 'd', dueDate: '2026-07-26' }),
    ]
    const list = recentOverdue(tasks, '2026-08-04')
    expect(list.map(x => x.id)).toEqual(['a'])
  })
  it('7 天窗口边界：today-7 属于窗口内，today-8 属于更早', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-07-28' }), t({ id: 'b', dueDate: '2026-07-27' })]
    expect(recentOverdue(tasks, '2026-08-04').map(x => x.id)).toEqual(['a'])
    expect(oldOverdue(tasks, '2026-08-04').map(x => x.id)).toEqual(['b'])
  })
  it('自定义窗口天数', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-08-01' }), t({ id: 'b', dueDate: '2026-07-30' })]
    expect(recentOverdue(tasks, '2026-08-04', 3).map(x => x.id)).toEqual(['a'])
  })
  it('跨月窗口边界：today=8-01 窗口起点回到 7 月（daysBefore 跨月正确）', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-07-29' }), t({ id: 'b', dueDate: '2026-07-28' })]
    expect(recentOverdue(tasks, '2026-08-01', 3).map(x => x.id)).toEqual(['a'])
    expect(oldOverdue(tasks, '2026-08-01', 3).map(x => x.id)).toEqual(['b'])
  })
})

describe('oldOverdue', () => {
  it('只返回窗口之前（更早）的逾期', () => {
    const tasks = [
      t({ id: 'a', dueDate: '2026-07-27' }),
      t({ id: 'b', dueDate: '2026-07-26' }),
      t({ id: 'c', dueDate: '2026-08-03' }),
      t({ id: 'd', status: 'done', dueDate: '2026-07-20' }),
    ]
    expect(oldOverdue(tasks, '2026-08-04').map(x => x.id)).toEqual(['a', 'b'])
  })
  it('recent + old 完整覆盖所有逾期，无遗漏无重复', () => {
    const tasks = [
      t({ id: 'a', dueDate: '2026-07-01' }),
      t({ id: 'b', dueDate: '2026-07-28' }),
      t({ id: 'c', dueDate: '2026-08-03' }),
      t({ id: 'd', dueDate: '2026-08-04' }),
      t({ id: 'e', status: 'done', dueDate: '2026-07-01' }),
      t({ id: 'f', dueDate: null }),
    ]
    const recent = recentOverdue(tasks, '2026-08-04').map(x => x.id)
    const old = oldOverdue(tasks, '2026-08-04').map(x => x.id)
    expect([...recent, ...old].sort()).toEqual(['a', 'b', 'c'])
  })
})

describe('isTodayScope（今日口径，历史逾期不计入）', () => {
  it('仅今日到期或今日焦点算今日；昨日到期、昨日焦点、未来任务都不算', () => {
    const tasks = [
      t({ id: 'a', dueDate: '2026-08-04' }),
      t({ id: 'b', focus: true, focusDate: '2026-08-04', dueDate: '2026-08-10' }),
      t({ id: 'c', dueDate: '2026-08-03' }),   // 逾期
      t({ id: 'd', focus: true, focusDate: '2026-08-03' }), // 昨日焦点
      t({ id: 'e', dueDate: '2026-08-05' }),   // 未来
      t({ id: 'f' }),                          // 无日期
    ]
    const inScope = tasks.filter(x => isTodayScope(x, '2026-08-04')).map(x => x.id)
    expect(inScope.sort()).toEqual(['a', 'b'])
  })
  it('done 的今日任务也在口径内（供 done/total 统计使用）', () => {
    expect(isTodayScope(t({ id: 'g', status: 'done', dueDate: '2026-08-04' }), '2026-08-04')).toBe(true)
  })
})
