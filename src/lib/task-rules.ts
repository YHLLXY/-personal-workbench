import { localDateOfISO, type Task } from './db/types'
import { nextOccurrence, prevOccurrence } from './repeat'

/**
 * 「今天已完成」的统一判定（v1.24）：普通任务看 status；重复任务当天完成后 status 仍是 todo
 * （同一行滚到下一期，completedAt 记完成时刻），所以单独覆盖。
 * v1.34：从 modules/overview/api.ts 挪进 lib —— 提醒中心的投影（reminders/format.ts）同样要用它，
 * 而纯函数不该挂在某个模块的 api.ts 里（api.ts 是 React Query 钩子的家，不是规则的）。
 */
export function isDoneForToday(t: Task, today: string): boolean {
  return t.status === 'done' || (t.repeat != null && t.completedAt !== null && localDateOfISO(t.completedAt) === today)
}

export interface CompletionPlan {
  /** 落库补丁。乐观更新走 applyTaskPatch，completedAt 的派生规则与仓储层一致 */
  patch: Partial<Task>
  /** 撤销补丁：5 秒内点「撤销」原样写回（通知 toast 用） */
  undo: Partial<Task>
  /** 重复任务完成后的下一次到期日（toast 文案用） */
  nextDue?: string
}

/**
 * 完成一条任务的唯一规则（v1.34）：今日待办与提醒中心共用同一条。
 * - 普通任务：status → done
 * - 重复任务：**绝不能写 status='done'** —— 那会终结整条序列；同一行滚到下一期（completedAt + dueDate 推进）
 * 撤销补丁还原「完成前的原值」而不是用 prevOccurrence() 倒推：完成这一刻闭包里就有精确原值。
 */
export function completionPatch(t: Task, today: string, now = new Date()): CompletionPlan {
  if (!t.repeat) {
    const undo: Partial<Task> = { status: t.status === 'done' ? 'todo' : t.status }
    return { patch: { status: 'done' }, undo }
  }
  const completedAt = now.toISOString()
  const next = nextOccurrence(t.dueDate ?? today, t.repeat, completedAt, today)
  return { patch: { completedAt, dueDate: next }, undo: { completedAt: null, dueDate: t.dueDate }, nextDue: next }
}

/**
 * 已完成 → 回到未完成（今日待办点方块切换用）。普通任务清 status；
 * 重复任务把 dueDate 退回上一槽位（anchor='complete' 且晚完成时是近似值，见 lib/repeat.ts 注记）。
 */
export function reopenPatch(t: Task, today: string): Partial<Task> {
  if (t.repeat) return { completedAt: null, dueDate: prevOccurrence(t.dueDate ?? today, t.repeat) }
  return { status: 'todo' }
}
