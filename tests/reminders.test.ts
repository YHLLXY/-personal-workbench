import { describe, it, expect } from 'vitest'
import { computeReminders, diffReminders, isDueNow, reminderText, shanghaiMs, todayShanghai } from '../api/reminders'

// 固定时刻：2026-08-08 12:00 上海 = 2026-08-08T04:00:00.000Z
const NOW = new Date('2026-08-08T04:00:00.000Z')

describe('shanghaiMs / todayShanghai（时区）', () => {
  it('上海 2026-08-08 09:30 = UTC 01:30', () => {
    expect(new Date(shanghaiMs('2026-08-08', '09:30')).toISOString()).toBe('2026-08-08T01:30:00.000Z')
  })
  it('无 time 时 = 当日 00:00 上海 = 前一日 16:00 UTC', () => {
    expect(new Date(shanghaiMs('2026-08-08')).toISOString()).toBe('2026-08-07T16:00:00.000Z')
  })
  it('坏格式日期返回 NaN（不抛 RangeError）', () => {
    expect(shanghaiMs('2026/08/08')).toBe(Number.NaN)
    expect(shanghaiMs('not-a-date')).toBe(Number.NaN)
  })
  it('todayShanghai：NOW（UTC 04:00 = 上海 12:00）为 2026-08-08', () => {
    expect(todayShanghai(NOW)).toBe('2026-08-08')
  })
  it('todayShanghai 跨日：UTC 2026-08-07T17:00Z（上海 08-08 01:00）为 2026-08-08', () => {
    expect(todayShanghai(new Date('2026-08-07T17:00:00.000Z'))).toBe('2026-08-08')
  })
})

describe('computeReminders', () => {
  const tasks = [
    { id: 't1', userId: 'u1', title: '交报告', status: 'todo', dueDate: '2026-08-08', dueTime: '09:30' },          // 已到期（上海 12:00 > 09:30）
    { id: 't2', userId: 'u1', title: '明天交作业', status: 'todo', dueDate: '2026-08-09', dueTime: '10:00' },     // 未来
    { id: 't3', userId: 'u1', title: '已完成任务', status: 'done', dueDate: '2026-08-08', dueTime: '09:30' },     // 跳过（完成）
    { id: 't4', userId: 'u1', title: '无时间任务', status: 'todo', dueDate: '2026-08-08', dueTime: null },        // 跳过（无 dueTime）
  ]
  const exams = [
    { id: 'e1', userId: 'u2', title: '四级', examDate: '2026-08-10', examTime: '09:00' },    // -3d=08-07 08:00 / -1d=08-09 08:00 / -1h=08-10 08:00 上海
    { id: 'e2', userId: 'u2', title: '已过考试', examDate: '2026-08-01', examTime: '09:00' }, // 跳过（已过）
    { id: 'e3', userId: 'u2', title: '无时间考试', examDate: '2026-08-20', examTime: null },  // 仅 -3d/-1d，无 -1h
  ]

  it('任务：仅未完成且有 dueTime 生成 due 节点；spec 携带对应 userId', () => {
    const specs = computeReminders(tasks, [], NOW)
    expect(specs).toHaveLength(2)
    expect(specs.find(s => s.refId === 't1')).toMatchObject({ userId: 'u1', refType: 'task', kind: 'due', scheduledAt: '2026-08-08T01:30:00.000Z', title: '交报告' })
    expect(specs.find(s => s.refId === 't2')).toMatchObject({ userId: 'u1', kind: 'due', scheduledAt: '2026-08-09T02:00:00.000Z' })
    expect(specs.every(s => s.userId === 'u1')).toBe(true)
  })

  it('考试：-3d/-1d 固定 08:00 上海，-1h 需 examTime；已过考试跳过；spec 携带对应 userId', () => {
    const specs = computeReminders([], exams, NOW)
    expect(specs).toHaveLength(5) // e1×3 + e3×2
    const e1 = specs.filter(s => s.refId === 'e1')
    expect(e1.every(s => s.userId === 'u2')).toBe(true)
    expect(e1.find(s => s.kind === 'exam-3d')?.scheduledAt).toBe('2026-08-07T00:00:00.000Z')  // 08-07 08:00 上海
    expect(e1.find(s => s.kind === 'exam-1d')?.scheduledAt).toBe('2026-08-09T00:00:00.000Z')  // 08-09 08:00 上海
    expect(e1.find(s => s.kind === 'exam-1h')?.scheduledAt).toBe('2026-08-10T00:00:00.000Z')  // 09:00-1h=08:00 上海
    expect(specs.some(s => s.refId === 'e2')).toBe(false)
    expect(specs.some(s => s.refId === 'e3' && s.kind === 'exam-1h')).toBe(false)
  })

  it('考试当天（examDate === today）仍生成全部节点', () => {
    const specs = computeReminders([], [{ id: 'e4', userId: 'u3', title: '今天考', examDate: '2026-08-08', examTime: '14:00' }], NOW)
    expect(specs).toHaveLength(3)
    expect(specs.every(s => s.userId === 'u3')).toBe(true)
  })

  it('坏格式日期（非 YYYY-MM-DD）输入被跳过：不抛错且不生成任何节点', () => {
    const badTasks = [
      { id: 'b1', userId: 'u1', title: '斜杠日期', status: 'todo', dueDate: '2026/08/08', dueTime: '09:30' },
      { id: 'b2', userId: 'u1', title: '非日期', status: 'todo', dueDate: 'not-a-date', dueTime: '09:30' },
    ]
    const badExams = [
      { id: 'b3', userId: 'u2', title: '非零填充日期', examDate: '2026-8-8', examTime: '09:00' },
      { id: 'b4', userId: 'u2', title: '非日期考试', examDate: 'whatever', examTime: null },
    ]
    expect(() => computeReminders(badTasks, badExams, NOW)).not.toThrow()
    expect(computeReminders(badTasks, badExams, NOW)).toHaveLength(0)
  })
})

describe('diffReminders（幂等）', () => {
  it('已有 (refType, refId, kind) 的节点跳过，只返回新增', () => {
    const computed = [
      { userId: 'u1', refType: 'task' as const, refId: 't1', kind: 'due' as const, scheduledAt: 'x', title: 'a' },
      { userId: 'u2', refType: 'exam' as const, refId: 'e1', kind: 'exam-3d' as const, scheduledAt: 'y', title: 'b' },
    ]
    const fresh = diffReminders([{ refType: 'task', refId: 't1', kind: 'due' }], computed)
    expect(fresh).toHaveLength(1)
    expect(fresh[0].refId).toBe('e1')
  })
  it('全部已有 → 空', () => {
    const computed = [{ userId: 'u1', refType: 'task' as const, refId: 't1', kind: 'due' as const, scheduledAt: 'x', title: 'a' }]
    expect(diffReminders([{ refType: 'task', refId: 't1', kind: 'due' }], computed)).toHaveLength(0)
  })
})

describe('isDueNow / reminderText', () => {
  it('到期判断（scheduledAt <= now）', () => {
    expect(isDueNow({ scheduledAt: '2026-08-08T01:30:00.000Z' }, NOW)).toBe(true)
    expect(isDueNow({ scheduledAt: '2026-08-08T05:00:00.000Z' }, NOW)).toBe(false)
  })
  it('四种文案', () => {
    expect(reminderText('due', '交报告', '2026-08-08', '09:30')).toContain('交报告')
    expect(reminderText('exam-3d', '四级', '2026-08-10', null)).toContain('3 天')
    expect(reminderText('exam-1d', '四级', '2026-08-10', null)).toContain('明天')
    expect(reminderText('exam-1h', '四级', '2026-08-10', '09:00')).toContain('1 小时')
  })
})
