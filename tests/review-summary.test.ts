import { describe, it, expect } from 'vitest'
import { buildDailySummary } from '../src/lib/review-summary'
import type { Task, HealthLog } from '../src/lib/db/types'

function task(p: Partial<Task>): Task { return { id: 't', title: 'x', focus: false, priority: 'medium', status: 'todo', dueDate: null, dueTime: null, focusDate: null, tags: [], sort: 0, completedAt: null, createdAt: new Date(2026, 7, 4, 8, 0).toISOString(), ...p } }

describe('buildDailySummary', () => {
  it('汇总当日完成任务/专注/打卡/健康', () => {
    const s = buildDailySummary('2026-08-04', {
      tasks: [task({ id: 'a', status: 'done', completedAt: new Date(2026, 7, 4, 10, 0).toISOString() }), task({ id: 'b', status: 'done', completedAt: new Date(2026, 7, 3, 10, 0).toISOString() }), task({ id: 'c' })],
      focusSessions: [{ id: 'f', startAt: new Date(2026, 7, 4, 9, 0).toISOString(), minutes: 50, note: null }],
      habitLogs: [{ id: 'h', habitId: 'x', logDate: '2026-08-04', count: 1 }],
      healthLogs: [{ id: 'w', logDate: '2026-08-04', type: 'weight', value: 62.5 } as HealthLog],
      exams: [],
    })
    expect(s.tasksDone).toBe(1)
    expect(s.tasksTotal).toBe(2)
    expect(s.focusMinutes).toBe(50)
    expect(s.habitChecks).toBe(1)
    expect(s.weightLog?.value).toBe(62.5)
  })

  it('v1.35：重复任务完成当天（status 仍是 todo）也计入当日完成，不能只看 status', () => {
    const s = buildDailySummary('2026-08-04', {
      tasks: [
        task({ id: 'r', status: 'todo', dueDate: '2026-08-05', completedAt: new Date(2026, 7, 4, 21, 0).toISOString() }),
        task({ id: 'n', status: 'done', completedAt: new Date(2026, 7, 4, 9, 0).toISOString() }),
      ],
      focusSessions: [], habitLogs: [], healthLogs: [], exams: [],
    })
    expect(s.tasksDone).toBe(2)
  })

  it('v1.35：切到历史日期时数字跟着变（D-16：原实现固定按 today 统计）', () => {
    const tasks = [
      task({ id: 'a', status: 'done', completedAt: new Date(2026, 7, 2, 10, 0).toISOString() }),
      task({ id: 'b', status: 'done', completedAt: new Date(2026, 7, 4, 10, 0).toISOString() }),
    ]
    const data = { tasks, focusSessions: [], habitLogs: [], healthLogs: [], exams: [] }
    expect(buildDailySummary('2026-08-02', data).tasksDone).toBe(1)
    expect(buildDailySummary('2026-08-04', data).tasksDone).toBe(1)
    expect(buildDailySummary('2026-08-03', data).tasksDone).toBe(0)
  })
})