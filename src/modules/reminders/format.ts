import type { Exam, Reminder, StudyGoal, Task } from '@/lib/db/types'

export type ReminderLike = Reminder

/** 引用对象三选一（调用方按 refType 取好传进来；取不到 = 已被删除） */
export interface ReminderRefs { task?: Task; exam?: Exam; goal?: StudyGoal }

/**
 * 待处理条数 = 节点时刻已到。角标用它。
 * **不看 sentAt**：没配通道时 sentAt 永远是 null，那不代表「还没到期」；
 * **也不看任何忽略/已读标记**（v1.31 起没有这个状态）——想让数字降下去，去把事做完。
 */
export function countDue(reminders: Reminder[], now = Date.now()): number {
  return reminders.filter(r => new Date(r.scheduledAt).getTime() <= now).length
}

export function kindLabel(kind: Reminder['kind']): string {
  switch (kind) {
    case 'due': return '任务到期'
    case 'exam-3d': return '考前 3 天'
    case 'exam-1d': return '考前 1 天'
    case 'exam-1h': return '考前 1 小时'
    case 'goal-3d': return '目标还剩 3 天'
    case 'goal-due': return '目标截止'
  }
}

/** 前端轻量文案（服务端 api/reminders.ts 有同构版；前端禁止 import api/） */
export function reminderText(kind: Reminder['kind'], title: string, date: string, time: string | null): string {
  switch (kind) {
    case 'due': return `任务「${title}」到点了，记得处理`
    case 'exam-3d': return `考试「${title}」还有 3 天（${date}）`
    case 'exam-1d': return `考试「${title}」就在明天（${date}）`
    case 'exam-1h': return `考试「${title}」1 小时后开始（${date} ${time ?? ''}）`
    case 'goal-3d': return `学习目标「${title}」还剩 3 天（${date}），每天推进一点`
    case 'goal-due': return `学习目标「${title}」今天截止（${date}），记得收尾`
  }
}

export type ReminderState = 'overdue' | 'due' | 'upcoming'

function localDay(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 引用对象的日期：任务 dueDate / 考试 examDate / 目标 deadline；对象已删除或无日期 → null */
export function refDate(r: Reminder, refs: ReminderRefs): string | null {
  if (r.refType === 'task') return refs.task?.dueDate ?? null
  if (r.refType === 'exam') return refs.exam?.examDate ?? null
  return refs.goal?.deadline ?? null
}

/**
 * 三档状态：即将到来 / 待处理 / 已逾期。
 * **逾期口径与全站 overdueTasks 同一把尺：日期级，不是时刻级**——今天到期、今天提醒响过，仍是「待处理」，
 * 次日才变红。若按时刻判，同一个任务在「今日待办」不红、在「提醒中心」红，两个页面自相矛盾。
 */
export function reminderState(r: Reminder, refs: ReminderRefs, now = Date.now()): ReminderState {
  if (new Date(r.scheduledAt).getTime() > now) return 'upcoming'
  const date = refDate(r, refs)
  if (!date) return 'due'
  return date < localDay(now) ? 'overdue' : 'due'
}

export interface ReminderFacts {
  title: string
  text: string
  date: string
  time: string | null
  state: ReminderState
  /** 引用对象已被删除 → 只能给「前往处理」以外的降级展示 */
  missing: boolean
}

/** 提醒 → 展示所需的一切（提醒中心与首页横幅共用，避免两处各写一份 describe 走偏） */
export function reminderFacts(r: Reminder, refs: ReminderRefs, now = Date.now()): ReminderFacts {
  const state = reminderState(r, refs, now)
  if (r.refType === 'task') {
    const t = refs.task
    return { title: t?.title ?? '（任务已删除）', text: reminderText(r.kind, t?.title ?? '', t?.dueDate ?? '', t?.dueTime ?? null), date: t?.dueDate ?? '', time: t?.dueTime ?? null, state, missing: !t }
  }
  if (r.refType === 'goal') {
    const g = refs.goal
    return { title: g?.title ?? '（目标已删除）', text: reminderText(r.kind, g?.title ?? '', g?.deadline ?? '', null), date: g?.deadline ?? '', time: null, state, missing: !g }
  }
  const e = refs.exam
  return { title: e?.title ?? '（考试已删除）', text: reminderText(r.kind, e?.title ?? '', e?.examDate ?? '', e?.examTime ?? null), date: e?.examDate ?? '', time: e?.examTime ?? null, state, missing: !e }
}
