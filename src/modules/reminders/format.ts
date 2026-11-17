import type { Exam, Reminder, StudyGoal, Task } from '@/lib/db/types'
import { isDoneForToday } from '@/lib/task-rules'

export type ReminderLike = Reminder

/** 引用对象三选一（调用方按 refType 取好传进来；取不到 = 已被删除） */
export interface ReminderRefs { task?: Task; exam?: Exam; goal?: StudyGoal }

/** Asia/Shanghai 固定 +8 偏移（无夏令时），与 api/reminders.ts 的 TZ_MS 同值 */
const TZ_MS = 8 * 60 * 60 * 1000

/**
 * 任务提醒时刻 = 任务的 dueDate + dueTime 按 +08:00 换算出的 UTC ISO。
 * 与 server 的 `shanghaiMs` 同口径（前端不能 import api/，故复刻这一份最小实现；两处必须一致）。
 * 缺任一字段或格式非法 → null（服务端同样不生成节点）。
 */
export function taskReminderAt(dueDate: string | null | undefined, dueTime: string | null | undefined): string | null {
  if (!dueDate || !dueTime) return null
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || !/^\d{2}:\d{2}$/.test(dueTime)) return null
  const [y, m, d] = dueDate.split('-').map(Number)
  const [hh, mm] = dueTime.split(':').map(Number)
  const ms = Date.UTC(y, m - 1, d, hh, mm) - TZ_MS
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null
}

/**
 * 待处理条数 = 节点时刻已到。角标用它。
 * **不看 sentAt**：没配通道时 sentAt 永远是 null，那不代表「还没到期」；
 * **也不看任何忽略/已读标记**（v1.31 起没有这个状态）——想让数字降下去，去把事做完。
 * 入参只要 scheduledAt：投影（effectiveRows）的产物也要能直接数。
 */
export function countDue(reminders: Array<Pick<Reminder, 'scheduledAt'>>, now = Date.now()): number {
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

/** 引用对象的数据源：tasks 为 undefined = 任务查询还没回来（首帧） */
export interface ReminderSources {
  tasks?: Task[]
  exams?: Exam[]
  goals?: StudyGoal[]
}

export interface EffectiveRow {
  /** 投影后的提醒：task 行的 scheduledAt 已被任务现算的时刻覆盖 */
  reminder: Reminder
  refs: ReminderRefs
}

/**
 * 提醒行 = 引用对象的**投影**，而且只允许存在这一个投影（v1.34）。
 * 提醒中心列表、侧边栏角标、首页横幅、排序与行内时刻全部读它 ——
 * 各处各算一套的结果就是 v1.31 修过的「角标 3 条、列表 2 条」原样复发。
 *
 * task 行的过滤（与 api/reminders.ts 的 liveRefKeys 同条件，避免「卡片没了、手机照响」）：
 *  ① 任务不存在（已删除）→ 不出现
 *  ② 今天已完成（isDoneForToday：重复任务完成当天 status 仍是 todo）→ 不出现
 *  ③ dueDate / dueTime 任一为空（提醒时间被清空）→ 不出现
 *  ④ scheduledAt 用任务现算的时刻 —— 用户改期后不必等服务端下一轮扫描才生效
 * exam / goal 行原样透传：节点该不该存在由服务端定，「引用对象已删除」保留 missing 降级文案。
 *
 * 这里不接 now：投影不做时间过滤，未到点的行还要显示在「即将到来」里（到没到点交给 reminderState）。
 */
export function effectiveRows(reminders: Reminder[], sources: ReminderSources, opts: { today: string }): EffectiveRow[] {
  const taskById = new Map((sources.tasks ?? []).map(t => [t.id, t]))
  const examById = new Map((sources.exams ?? []).map(e => [e.id, e]))
  const goalById = new Map((sources.goals ?? []).map(g => [g.id, g]))
  const out: EffectiveRow[] = []
  for (const r of reminders) {
    if (r.refType === 'exam') { out.push({ reminder: r, refs: { exam: examById.get(r.refId) } }); continue }
    if (r.refType === 'goal') { out.push({ reminder: r, refs: { goal: goalById.get(r.refId) } }); continue }
    const t = taskById.get(r.refId)
    if (sources.tasks === undefined) { out.push({ reminder: r, refs: { task: t } }); continue }
    if (!t || isDoneForToday(t, opts.today)) continue
    const at = taskReminderAt(t.dueDate, t.dueTime)
    if (!at) continue
    out.push({ reminder: { ...r, scheduledAt: at }, refs: { task: t } })
  }
  return out
}
