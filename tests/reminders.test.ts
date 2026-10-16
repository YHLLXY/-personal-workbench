import { describe, it, expect } from 'vitest'
import { computeReminders, isDueNow, liveRefKeys, planReminders, reminderText, shanghaiMs, todayShanghai, type ExistingReminder, type ReminderSpec } from '../api/reminders'

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
    const specs = computeReminders(tasks, [], [], NOW)
    expect(specs).toHaveLength(2)
    expect(specs.find(s => s.refId === 't1')).toMatchObject({ userId: 'u1', refType: 'task', kind: 'due', scheduledAt: '2026-08-08T01:30:00.000Z', title: '交报告' })
    expect(specs.find(s => s.refId === 't2')).toMatchObject({ userId: 'u1', kind: 'due', scheduledAt: '2026-08-09T02:00:00.000Z' })
    expect(specs.every(s => s.userId === 'u1')).toBe(true)
  })

  it('考试：-3d/-1d 固定 08:00 上海，-1h 需 examTime；已过考试与已过时刻节点跳过；spec 携带对应 userId', () => {
    const specs = computeReminders([], exams, [], NOW)
    expect(specs).toHaveLength(4) // e1×2（-3d 已过时刻跳过）+ e3×2
    const e1 = specs.filter(s => s.refId === 'e1')
    expect(e1.every(s => s.userId === 'u2')).toBe(true)
    expect(e1.find(s => s.kind === 'exam-3d')).toBeUndefined() // -3d = 08-07 08:00 上海，已过 NOW（08-08 12:00 上海）→ 不生成
    expect(e1.find(s => s.kind === 'exam-1d')?.scheduledAt).toBe('2026-08-09T00:00:00.000Z')  // 08-09 08:00 上海
    expect(e1.find(s => s.kind === 'exam-1h')?.scheduledAt).toBe('2026-08-10T00:00:00.000Z')  // 09:00-1h=08:00 上海
    expect(specs.some(s => s.refId === 'e2')).toBe(false)
    expect(specs.some(s => s.refId === 'e3' && s.kind === 'exam-1h')).toBe(false)
  })

  it('考试当天：已过时刻的 -3d/-1d 跳过，未来 -1h 生成', () => {
    const specs = computeReminders([], [{ id: 'e4', userId: 'u3', title: '今天考', examDate: '2026-08-08', examTime: '14:00' }], [], NOW)
    expect(specs).toHaveLength(1) // -3d/-1d（08-05/08-07 08:00 上海）已过 NOW；-1h（14:00−1h=13:00 上海）未来 → 仅生成
    expect(specs[0]).toMatchObject({ userId: 'u3', refType: 'exam', refId: 'e4', kind: 'exam-1h', scheduledAt: '2026-08-08T05:00:00.000Z' })
  })

  it('考试节点已过时刻不生成（建「明天考」不触发虚假的考前 3 天）', () => {
    // NOW = 2026-08-08 12:00 上海；考试 08-09（明天）→ -3d 节点（08-06 08:00 上海）已过 → 跳过；-1d 节点（08-08 08:00 上海）也已过 → 跳过；-1h（08-09 08:00 上海）未来 → 生成
    const specs = computeReminders([], [{ id: 'e5', userId: 'u4', title: '明天考', examDate: '2026-08-09', examTime: '09:00' }], [], NOW)
    expect(specs).toHaveLength(1)
    expect(specs[0].kind).toBe('exam-1h')
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
    expect(() => computeReminders(badTasks, badExams, [], NOW)).not.toThrow()
    expect(computeReminders(badTasks, badExams, [], NOW)).toHaveLength(0)
  })
})

describe('liveRefKeys（引用对象存活判定——提醒行该不该继续存在）', () => {
  const NOW2 = new Date('2026-08-08T04:00:00.000Z') // 上海 08-08 12:00
  it('任务未完成=活；考试今天及以后=活；目标未归档且有截止日=活', () => {
    const live = liveRefKeys(
      [{ id: 't1', userId: 'u1', title: 'a', status: 'todo', dueDate: null, dueTime: null },
       { id: 't2', userId: 'u1', title: 'b', status: 'done', dueDate: null, dueTime: null }],
      [{ id: 'e1', userId: 'u1', title: 'c', examDate: '2026-08-08', examTime: null },
       { id: 'e2', userId: 'u1', title: 'd', examDate: '2026-08-07', examTime: null }],
      [{ id: 'g1', userId: 'u1', title: 'e', status: 'active', deadline: '2026-08-12' },
       { id: 'g2', userId: 'u1', title: 'f', status: 'done', deadline: '2026-08-12' },
       { id: 'g3', userId: 'u1', title: 'g', status: 'active', deadline: null }],
      NOW2)
    expect([...live].sort()).toEqual(['exam:e1', 'goal:g1', 'task:t1'])
  })
})

describe('planReminders（增 / 改 / 删 三向对齐）', () => {
  const NOW2 = new Date('2026-08-08T04:00:00.000Z')
  const FUTURE = '2026-08-09T02:00:00.000Z'
  const spec = (over: Partial<ReminderSpec> = {}): ReminderSpec =>
    ({ userId: 'u1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: FUTURE, title: '交报告', ...over })
  const row = (over: Partial<ExistingReminder> = {}): ExistingReminder =>
    ({ id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: FUTURE, ...over })
  const liveAll = new Set(['task:t1'])

  it('新增：key 不存在 → create', () => {
    const plan = planReminders([], [spec()], liveAll, NOW2)
    expect(plan.create).toHaveLength(1)
    expect(plan.update).toHaveLength(0)
    expect(plan.remove).toHaveLength(0)
  })

  it('幂等：scheduledAt 一致 → 三个方向都不动', () => {
    const plan = planReminders([row()], [spec()], liveAll, NOW2)
    expect(plan).toEqual({ create: [], update: [], remove: [] })
  })

  it('改期到未来 → update 且 resetDelivery=true（清空 sent_at 重新计时）', () => {
    // 回归：旧版 diffReminders 只按 (refType,refId,kind) 去重、不比较 scheduledAt，
    // 于是把任务提醒从 09:00 改到 18:00 永远不生效——这条用例就是那个缺陷的守门人
    const plan = planReminders([row({ scheduledAt: '2026-08-08T01:00:00.000Z' })], [spec({ scheduledAt: FUTURE })], liveAll, NOW2)
    expect(plan.create).toHaveLength(0)
    expect(plan.update).toEqual([{ id: 'r1', scheduledAt: FUTURE, resetDelivery: true }])
  })

  it('改期到过去 → update 但 resetDelivery=false（保留投递记录，不补发也不抹掉）', () => {
    const past = '2026-08-01T01:00:00.000Z'
    const plan = planReminders([row({ scheduledAt: FUTURE })], [spec({ scheduledAt: past })], liveAll, NOW2)
    expect(plan.update).toEqual([{ id: 'r1', scheduledAt: past, resetDelivery: false }])
  })

  it('引用对象已终结 → remove（任务完成/删除、考试已过、目标归档）', () => {
    const existing = [
      row({ id: 'r1' }),
      row({ id: 'r2', refType: 'exam', refId: 'e9', kind: 'exam-1d' }),
    ]
    const plan = planReminders(existing, [spec()], liveAll, NOW2)
    expect(plan.remove).toEqual(['r2'])
    expect(() => planReminders(existing, [spec()], new Set(), NOW2)).not.toThrow()
    expect(planReminders(existing, [spec()], new Set(), NOW2).remove).toEqual(['r1', 'r2'])
  })

  it('节点时刻已过但引用对象还活着 → 保留该行（已发出的通知记录不被误删）', () => {
    // 考试 08-10，考前 3 天节点（08-07）已过 → computeReminders 不再生成它，
    // 但考试还没结束，那条「还有 3 天」的记录要留到考试结束
    const existing = [row({ id: 'r1', refType: 'exam', refId: 'e1', kind: 'exam-3d', scheduledAt: '2026-08-07T00:00:00.000Z' })]
    const plan = planReminders(existing, [], new Set(['exam:e1']), NOW2)
    expect(plan.remove).toHaveLength(0)
    expect(plan.update).toHaveLength(0)
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

describe('目标截止提醒（v1.14 接入）', () => {
  const NOW = new Date('2026-08-05T00:00:00.000Z')

  it('有截止日的进行中目标生成 goal-3d 与 goal-due 两个节点（截止 08:00）', () => {
    const specs = computeReminders([], [], [{ id: 'g1', userId: 'u1', title: '刷题 50 道', status: 'active', deadline: '2026-08-12' }], NOW)
    const kinds = specs.map(s => s.kind).sort()
    expect(kinds).toEqual(['goal-3d', 'goal-due'])
    expect(specs.every(s => s.refType === 'goal' && s.refId === 'g1')).toBe(true)
    // goal-due 应为截止日 08:00 上海时间 = 00:00 UTC
    const due = specs.find(s => s.kind === 'goal-due')!
    expect(due.scheduledAt).toBe('2026-08-12T00:00:00.000Z')
  })

  it('已归档目标与无截止日目标不生成', () => {
    const specs = computeReminders([], [], [
      { id: 'g2', userId: 'u1', title: '已完成', status: 'done', deadline: '2026-08-12' },
      { id: 'g3', userId: 'u1', title: '无截止', status: 'active', deadline: null },
    ], NOW)
    expect(specs).toHaveLength(0)
  })

  it('截止日在 3 天内的目标只生成 goal-due（3 天节点已过不补发）', () => {
    const specs = computeReminders([], [], [{ id: 'g4', userId: 'u1', title: '临近截止', status: 'active', deadline: '2026-08-06' }], NOW)
    expect(specs.map(s => s.kind)).toEqual(['goal-due'])
  })
})
