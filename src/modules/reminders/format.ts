import type { Reminder } from '@/lib/db/types'

export type ReminderLike = Reminder

/** 未读 = 未忽略 且 scheduledAt 已到期 */
export function countUnread(reminders: Reminder[], now = Date.now()): number {
  return reminders.filter(r => !r.dismissedAt && new Date(r.scheduledAt).getTime() <= now).length
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
