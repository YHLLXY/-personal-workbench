import { describe, it, expect } from 'vitest'
import { todayTasks } from '../src/modules/overview/api'
import type { Task } from '../src/lib/db/types'

function t(partial: Partial<Task>): Task { return { id: 'x', title: 't', focus: false, priority: 'medium', status: 'todo', dueDate: null, tags: [], sort: 0, completedAt: null, createdAt: '', ...partial } }

describe('todayTasks', () => {
  it('只显示今日到期或焦点任务', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-08-04' }), t({ id: 'b', dueDate: '2026-08-10' }), t({ id: 'c', focus: true }), t({ id: 'd', status: 'done', dueDate: '2026-08-04' })]
    const list = todayTasks(tasks, '2026-08-04')
    expect(list.map(x => x.id).sort()).toEqual(['a', 'c'])
  })
  it('焦点任务排在前面', () => {
    const tasks = [t({ id: 'a', dueDate: '2026-08-04' }), t({ id: 'b', focus: true, dueDate: '2026-08-04' })]
    expect(todayTasks(tasks, '2026-08-04')[0].id).toBe('b')
  })
  it('高优先级排前', () => {
    const tasks = [t({ id: 'a', priority: 'low', dueDate: '2026-08-04' }), t({ id: 'b', priority: 'high', dueDate: '2026-08-04' })]
    expect(todayTasks(tasks, '2026-08-04')[0].id).toBe('b')
  })
})
