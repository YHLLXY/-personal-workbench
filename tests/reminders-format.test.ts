import { describe, it, expect } from 'vitest'
import { countDue, effectiveRows, kindLabel, refDate, reminderFacts, reminderState, reminderText, taskReminderAt, type ReminderLike, type ReminderRefs } from '../src/modules/reminders/format'
import type { Exam, StudyGoal, Task } from '../src/lib/db/types'

const r = (over: Partial<ReminderLike>): ReminderLike => ({
  id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: '2026-08-08T01:30:00.000Z', sentAt: null, createdAt: '2026-08-08T00:00:00.000Z', ...over,
})

const task = (over: Partial<Task> = {}): Task => ({
  id: 't1', title: '交报告', focus: false, priority: 'medium', status: 'todo', dueDate: '2026-08-08', dueTime: '09:30',
  focusDate: null, tags: [], sort: 0, completedAt: null, createdAt: '2026-08-01T00:00:00.000Z', ...over,
})
const exam = (over: Partial<Exam> = {}): Exam => ({
  id: 'e1', title: '四级', examDate: '2026-08-10', examTime: '09:00', subject: null, note: null, createdAt: '2026-08-01T00:00:00.000Z', ...over,
})
const goal = (over: Partial<StudyGoal> = {}): StudyGoal => ({
  id: 'g1', title: '刷题', target: 100, progress: 0, deadline: '2026-08-12', status: 'active', note: null, completedAt: null, ...over,
})

describe('reminders/format', () => {
  it('countDue：只数已到点的，未到点不计（不再有「已忽略」这个概念）', () => {
    const now = Date.parse('2026-08-08T04:00:00.000Z')
    expect(countDue([
      r({ id: 'a', scheduledAt: '2026-08-08T01:30:00.000Z' }),
      r({ id: 'b', scheduledAt: '2026-08-08T04:00:00.000Z' }), // 正好到点
      r({ id: 'c', scheduledAt: '2026-08-09T01:30:00.000Z' }),
    ], now)).toBe(2)
  })

  it('kindLabel 中文标签', () => {
    expect(kindLabel('due')).toBe('任务到期')
    expect(kindLabel('exam-3d')).toBe('考前 3 天')
    expect(kindLabel('exam-1d')).toBe('考前 1 天')
    expect(kindLabel('exam-1h')).toBe('考前 1 小时')
  })

  it('reminderText 四种文案（前端版）', () => {
    expect(reminderText('due', '交报告', '2026-08-08', '09:30')).toContain('交报告')
    expect(reminderText('exam-3d', '四级', '2026-08-10', null)).toContain('3 天')
    expect(reminderText('exam-1d', '四级', '2026-08-10', null)).toContain('明天')
    expect(reminderText('exam-1h', '四级', '2026-08-10', '09:00')).toContain('1 小时')
  })

  it('refDate：按 refType 取引用对象的日期；对象缺失 → null', () => {
    expect(refDate(r({ refType: 'task', refId: 't1' }), { task: task() })).toBe('2026-08-08')
    expect(refDate(r({ refType: 'exam', refId: 'e1' }), { exam: exam() })).toBe('2026-08-10')
    expect(refDate(r({ refType: 'goal', refId: 'g1' }), { goal: goal() })).toBe('2026-08-12')
    expect(refDate(r({ refType: 'task', refId: 'gone' }), {})).toBeNull()
  })

  it('reminderState：未到点=upcoming；到点后只有引用对象**日期已过**才是 overdue（与全站 overdueTasks 同尺）', () => {
    // 现在 = 2026-08-08 12:00 上海（本地时区即 Asia/Shanghai）
    const now = new Date('2026-08-08T12:00:00+08:00').getTime()
    const refs: ReminderRefs = { task: task({ dueDate: '2026-08-08' }) }
    expect(reminderState(r({ scheduledAt: '2026-08-09T01:30:00.000Z' }), refs, now)).toBe('upcoming')
    // 今天 09:30 的提醒已响，但任务「今天到期」→ 仍是待处理，不是逾期
    expect(reminderState(r({ scheduledAt: '2026-08-08T01:30:00.000Z' }), refs, now)).toBe('due')
    // 次日才变红
    expect(reminderState(r({ scheduledAt: '2026-08-08T01:30:00.000Z' }), { task: task({ dueDate: '2026-08-07' }) }, now)).toBe('overdue')
    // 考试节点：提醒响了但考试在后天 → 待处理
    const examRefs: ReminderRefs = { exam: exam({ examDate: '2026-08-10' }) }
    expect(reminderState(r({ refType: 'exam', refId: 'e1', kind: 'exam-3d', scheduledAt: '2026-08-07T00:00:00.000Z' }), examRefs, now)).toBe('due')
    expect(reminderState(r({ refType: 'exam', refId: 'e1', kind: 'exam-3d', scheduledAt: '2026-08-07T00:00:00.000Z' }), { exam: exam({ examDate: '2026-08-07' }) }, now)).toBe('overdue')
    // 引用对象已删除 → 退回「待处理」，不误判成逾期
    expect(reminderState(r({ scheduledAt: '2026-08-01T01:30:00.000Z' }), {}, now)).toBe('due')
  })

  it('reminderFacts：三形态各给标题/文案/日期/状态；引用对象已删除时降级而不抛', () => {
    const now = new Date('2026-08-08T12:00:00+08:00').getTime()
    const t = reminderFacts(r({}), { task: task() }, now)
    expect(t).toMatchObject({ title: '交报告', state: 'due', missing: false, date: '2026-08-08', time: '09:30' })
    expect(t.text).toContain('交报告')
    const e = reminderFacts(r({ refType: 'exam', refId: 'e1', kind: 'exam-1d', scheduledAt: '2026-08-09T00:00:00.000Z' }), { exam: exam() }, now)
    expect(e).toMatchObject({ title: '四级', state: 'upcoming', missing: false })
    expect(e.text).toContain('明天')
    const g = reminderFacts(r({ refType: 'goal', refId: 'g1', kind: 'goal-due' }), { goal: goal() }, now)
    expect(g).toMatchObject({ title: '刷题', missing: false, time: null })
    const gone = reminderFacts(r({ refId: 'gone' }), {}, now)
    expect(gone).toMatchObject({ title: '（任务已删除）', missing: true, state: 'due' })
  })
})

/** v1.34：提醒行 = 引用对象的唯一投影（列表 / 角标 / 横幅 / 排序都读它） */
describe('reminders/format 投影（taskReminderAt / effectiveRows）', () => {
  const TODAY = '2026-08-08'
  const repeatDaily = { freq: 'daily' as const, interval: 1, anchor: 'due' as const }

  it('taskReminderAt：按 +08:00 折算（与服务端 shanghaiMs 同口径）；缺字段 / 坏格式 → null', () => {
    expect(taskReminderAt('2026-08-08', '09:30')).toBe('2026-08-08T01:30:00.000Z')
    expect(taskReminderAt('2026-08-08', null)).toBeNull()
    expect(taskReminderAt(null, '09:30')).toBeNull()
    expect(taskReminderAt('2026/08/08', '09:30')).toBeNull()
    expect(taskReminderAt('2026-08-08', '9:30')).toBeNull()
  })

  it('task 行：scheduledAt 用任务现算的时刻覆盖（改期立刻生效，不必等服务端下一轮扫描）', () => {
    const rows = effectiveRows(
      [r({ scheduledAt: '2026-08-01T00:00:00.000Z' })],
      { tasks: [task({ dueDate: '2026-08-09', dueTime: '18:00' })] },
      { today: TODAY })
    expect(rows).toHaveLength(1)
    expect(rows[0].reminder.scheduledAt).toBe('2026-08-09T10:00:00.000Z')
  })

  it('task 行：已完成 / 当天已完成的重复任务 / 任务已删除 / 提醒时间被清空 → 都不出现', () => {
    const rows = effectiveRows(
      [r({ id: 'r1', refId: 'done' }), r({ id: 'r2', refId: 'rep' }), r({ id: 'r3', refId: 'gone' }), r({ id: 'r4', refId: 'noTime' })],
      {
        tasks: [
          task({ id: 'done', status: 'done' }),
          task({ id: 'rep', status: 'todo', repeat: repeatDaily, completedAt: '2026-08-08T02:00:00.000Z' }),
          task({ id: 'noTime', status: 'todo', dueTime: null }),
        ],
      },
      { today: TODAY })
    expect(rows).toHaveLength(0)
  })

  it('任务查询还没回来（tasks === undefined）→ 不过滤也不覆盖，避免首帧闪空', () => {
    const rows = effectiveRows([r({ scheduledAt: '2026-08-01T00:00:00.000Z' })], {}, { today: TODAY })
    expect(rows).toHaveLength(1)
    expect(rows[0].reminder.scheduledAt).toBe('2026-08-01T00:00:00.000Z')
    expect(rows[0].refs.task).toBeUndefined()
  })

  it('exam / goal 行原样透传（节点该不该存在由服务端定）；引用对象已删也保留降级行', () => {
    const rows = effectiveRows(
      [r({ id: 're', refType: 'exam', refId: 'e1', kind: 'exam-1d', scheduledAt: '2026-08-09T00:00:00.000Z' }),
       r({ id: 'rg', refType: 'goal', refId: 'g1', kind: 'goal-due', scheduledAt: '2026-08-12T00:00:00.000Z' }),
       r({ id: 'rm', refType: 'exam', refId: 'gone', kind: 'exam-1d' })],
      { tasks: [], exams: [exam()], goals: [goal()] },
      { today: TODAY })
    expect(rows.map(x => x.reminder.id)).toEqual(['re', 'rg', 'rm'])
    expect(rows[0].refs.exam?.id).toBe('e1')
    expect(rows[1].refs.goal?.id).toBe('g1')
    expect(rows[2].refs.exam).toBeUndefined()
  })
})
