import { describe, it, expect } from 'vitest'
import { todayTasks, overdueTasks } from '../src/modules/overview/api'
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
