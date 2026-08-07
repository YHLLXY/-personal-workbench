import { describe, it, expect } from 'vitest'
import { taskCompletionRate, totalFocusMinutes, formatMinutes, activeNoteCount, buildWeeklyTrend } from '../src/lib/stats'
import type { Task, FocusSession, Note } from '../src/lib/db/types'

const mkTask = (over: Partial<Task>): Task => ({ id: 'x', title: 't', focus: false, priority: 'low', status: 'todo', dueDate: null, dueTime: null, tags: [], sort: 1, completedAt: null, createdAt: '2026-08-01T00:00:00.000Z', ...over })

describe('stats', () => {
  it('taskCompletionRate：完成/总数/百分比', () => {
    const tasks = [mkTask({ status: 'done' }), mkTask({ status: 'done' }), mkTask({ status: 'todo' })]
    expect(taskCompletionRate(tasks)).toEqual({ done: 2, total: 3, rate: 67 })
    expect(taskCompletionRate([])).toEqual({ done: 0, total: 0, rate: 0 })
  })

  it('totalFocusMinutes 累加分钟；formatMinutes 转小时/分钟', () => {
    const sessions: FocusSession[] = [
      { id: 'a', startAt: '2026-08-05T09:00:00.000Z', minutes: 25, note: null },
      { id: 'b', startAt: '2026-08-05T10:00:00.000Z', minutes: 50, note: null },
    ]
    expect(totalFocusMinutes(sessions)).toBe(75)
    expect(totalFocusMinutes([])).toBe(0)
    expect(formatMinutes(75)).toBe('1 小时 15 分钟')
    expect(formatMinutes(60)).toBe('1 小时')
    expect(formatMinutes(59)).toBe('59 分钟')
    expect(formatMinutes(45)).toBe('45 分钟')
    expect(formatMinutes(0)).toBe('0 分钟')
  })

  it('activeNoteCount 只计未归档笔记', () => {
    const notes: Note[] = [
      { id: 'a', content: 'x', tag: null, archived: false, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
      { id: 'b', content: 'y', tag: null, archived: true, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' },
    ]
    expect(activeNoteCount(notes)).toBe(1)
  })

  it('buildWeeklyTrend：近 7 天（含今天）任务完成数与专注分钟，今天标"今"', () => {
    const tasks = [
      mkTask({ status: 'done', completedAt: '2026-08-05T08:00:00.000Z' }), // 今天
      mkTask({ status: 'done', completedAt: '2026-08-03T08:00:00.000Z' }), // 2 天前
      mkTask({ status: 'done', completedAt: '2026-08-03T09:00:00.000Z' }),
    ]
    const sessions: FocusSession[] = [
      { id: 'a', startAt: '2026-08-05T09:00:00.000Z', minutes: 25, note: null },
      { id: 'b', startAt: '2026-08-04T09:00:00.000Z', minutes: 50, note: null },
    ]
    const days = buildWeeklyTrend(tasks, sessions, '2026-08-05')
    expect(days).toHaveLength(7)
    expect(days[6].date).toBe('2026-08-05')
    expect(days[6].label).toBe('今')
    expect(days[6].tasks).toBe(1)
    expect(days[6].minutes).toBe(25)
    const day3 = days.find(d => d.date === '2026-08-03')
    expect(day3?.tasks).toBe(2)
    const day4 = days.find(d => d.date === '2026-08-04')
    expect(day4?.minutes).toBe(50)
    expect(days.every(d => d.tasks >= 0 && d.minutes >= 0)).toBe(true)
  })
})
