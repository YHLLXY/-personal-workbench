import { localDateOfISO, type PlanItem, type PlanItemInput, type Task } from './db/types'
import { isDoneForToday } from './task-rules'

/**
 * 每日计划快照的纯函数层（v1.35）。
 *
 * 全部是「给定数据 → 给定补丁」的纯计算：不碰仓储、不碰 React。写库由 modules/overview/api.ts 的
 * usePlanSync 与 use-task-actions 负责。这样口径可以单测，而 hook 只做接线。
 *
 * 口径定义见 docs/plans/PLAN_V135_每日计划学习复盘协同.md §3.3：
 *   计划 = 当天有行；完成 = done_at 非空；未完成 = 计划 − 完成；已改期 = moved_to 非空且未完成。
 */

/** 某一天「应该有计划项」的任务：当天到期、当天焦点、或标记为进行中（要天天看到）。
 *  与 modules/overview/api.ts 的 isTodayScope 同义，区别是这里按**任意日期**算——
 *  复盘要对账历史日，不能写死今天。 */
export function plansOnDate(t: Task, date: string): boolean {
  return t.dueDate === date || (t.focus && t.focusDate === date) || t.status === 'doing'
}

/** 一条任务在某天的计划项 */
export function planItemOn(items: PlanItem[], date: string, taskId: string): PlanItem | undefined {
  return items.find(i => i.planDate === date && i.taskId === taskId)
}

/**
 * 物化：把某天「该有计划项但没有」的任务补成待写补丁。**幂等**——同一天重复进入页面不会产生重复行，
 * 已有行不重复插（这是 PK (plan_date, task_id) 的应用层守卫，本地模式没有主键，必须自己守）。
 * 已经完成的任务也补，并把 done_at 带上（旧版本完成过的任务没有行，否则当天分母会偏小）。
 */
export function materialize(tasks: Task[], items: PlanItem[], date: string): PlanItemInput[] {
  const existing = new Set(items.filter(i => i.planDate === date).map(i => i.taskId))
  const out: PlanItemInput[] = []
  for (const t of tasks) {
    if (existing.has(t.id) || !plansOnDate(t, date)) continue
    out.push({
      planDate: date,
      taskId: t.id,
      title: t.title,
      goalId: t.goalId ?? null,
      amount: t.progressAmount ?? null,
      // 已完成但仍缺行（v1.35 之前就勾掉了 / 通知完成）→ 补行时一并落完成事实
      ...(isDoneForToday(t, date) && t.completedAt ? { doneAt: t.completedAt } : {}),
    })
  }
  return out
}

export interface DayPlanStats {
  /** 当天计划项数（分母） */
  planned: number
  done: number
  unfinished: number
  /** 当天计划、但被改期走的（仍算未完成，单独计数给用户看） */
  moved: number
  /** 完成率百分比；计划为 0 时 null（不显示 0%，那是"今天什么都没有"而不是"完成 0%"） */
  rate: number | null
  /** 当天补完成的历史计划项（plan_date 更早、done_at 落在当天），单独一行小字，不混进 5/3/2 */
  backfilled: number
}

export function statsForDate(items: PlanItem[], date: string): DayPlanStats {
  const own = items.filter(i => i.planDate === date)
  const planned = own.length
  const done = own.filter(i => i.doneAt !== null).length
  const moved = own.filter(i => i.movedTo !== null && i.doneAt === null).length
  const backfilled = items.filter(i => i.doneAt !== null && i.planDate < date && localDateOfISO(i.doneAt) === date).length
  return { planned, done, unfinished: planned - done, moved, rate: planned === 0 ? null : Math.round((done / planned) * 100), backfilled }
}

/** 完成一条任务的计划项补丁：planDate 取**完成前**的 dueDate（逾期补完成落在原来的计划日，进「今日补完成」而不是今日分母） */
export function completePlanInput(t: Task, today: string, now = new Date()): PlanItemInput {
  // goalId / amount 一起带上：用户可能一进页面就勾完成（此时还没物化过），
  // 少了这两列，目标进度账本就收不到这笔量（v1.36 学习联动）
  return {
    planDate: t.dueDate ?? today, taskId: t.id, title: t.title,
    goalId: t.goalId ?? null, amount: t.progressAmount ?? null, doneAt: now.toISOString(),
  }
}
/** 撤销完成：只清 done_at（行保留，标题/来源日不变） */
export function reopenPlanInput(t: Task, today: string): PlanItemInput {
  return { planDate: t.dueDate ?? today, taskId: t.id, title: t.title, doneAt: null }
}

export interface ReschedulePlanInputs {
  /** 原来那天的行：标记 moved_to */
  from: PlanItemInput
  /** 新那天的行：标题快照 + 清空 moved_to（改回来时不能还挂着"已改期"） */
  to: PlanItemInput
  /** 改期的起点日（撤销时要按这一天把 from 的 moved_to 清回 null） */
  fromDate: string
}

/** 改期：旧行留痕 + 新行补一条（原实现只改任务 dueDate，历史里那一天的"未完成"就消失了） */
export function reschedulePlan(t: Task, toDate: string, today: string): ReschedulePlanInputs {
  const fromDate = t.dueDate ?? today
  return {
    fromDate,
    from: { planDate: fromDate, taskId: t.id, movedTo: toDate },
    to: { planDate: toDate, taskId: t.id, title: t.title, movedTo: null },
  }
}

/** 400 天裁剪（本地模式 localStorage 只有 ~5MB，云端也顺手控制增长）。
 *  用字符串比较而不是 Date：plan_date 是 YYYY-MM-DD，字典序即时间序，顺手避开时区。 */
export function trimPlanItems(items: PlanItem[], today: string, keepDays = 400): PlanItem[] {
  const cutoff = shiftDate(today, -keepDays)
  return items.filter(i => i.planDate >= cutoff)
}

/** 日期的人类可读标签（改期回执用）。今天/明天/后天给相对说法，其余给"M 月 D 日"——
 *  改期 toast 上写 "已改到 明天" 比 "已改到 2026-11-27" 快一步读懂。 */
export function dayLabel(date: string, today: string): string {
  if (date === today) return '今天'
  if (date === shiftDate(today, 1)) return '明天'
  if (date === shiftDate(today, 2)) return '后天'
  const [, m, d] = date.split('-')
  return `${Number(m)} 月 ${Number(d)} 日`
}

/** YYYY-MM-DD 加减天数（本地时区无关的纯字符串运算） */
export function shiftDate(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + days)
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(t.getUTCDate()).padStart(2, '0')}`
}
