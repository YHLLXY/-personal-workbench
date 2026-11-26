import type { Task, FocusSession, HabitLog, HealthLog, Exam } from './db/types'
import { localDateOfISO } from './db/types'

export interface DailySummary {
  tasksDone: number
  tasksTotal: number
  focusMinutes: number
  habitChecks: number
  weightLog: HealthLog | null
  sleepLog: HealthLog | null
  exerciseLog: HealthLog | null
  upcomingExams: Exam[]
}

export function buildDailySummary(date: string, data: {
  tasks: Task[]; focusSessions: FocusSession[]; habitLogs: HabitLog[]; healthLogs: HealthLog[]; exams: Exam[]
}): DailySummary {
  // 注意：completedAt/startAt 是 UTC ISO，必须经 localDateOfISO 转本地日期再与 date 比较（时区修复，Task 11 引入的 helper）
  // v1.35：判定改看 completedAt 而不是 status —— 重复任务完成当天 status 仍是 todo（同一行滚到下一期），
  // 只看 status 会把"每天背单词"这类主力任务排除在当日完成数之外（与 todayDone 口径对齐）
  const done = data.tasks.filter(t => t.completedAt !== null && localDateOfISO(t.completedAt) === date)
  const focus = data.focusSessions.filter(s => localDateOfISO(s.startAt) === date).reduce((sum, s) => sum + s.minutes, 0)
  const habit = data.habitLogs.filter(l => l.logDate === date).length
  const byType = (type: HealthLog['type']) => data.healthLogs.find(h => h.logDate === date && h.type === type) ?? null
  return {
    tasksDone: done.length,
    // 语义是「累计完成」（review.tsx 展示为 sub 累计 N），不要改成当日口径
    tasksTotal: data.tasks.filter(t => t.status === 'done').length,
    focusMinutes: focus,
    habitChecks: habit,
    weightLog: byType('weight'),
    sleepLog: byType('sleep'),
    exerciseLog: byType('exercise'),
    upcomingExams: data.exams.filter(e => e.examDate >= date).sort((a, b) => a.examDate.localeCompare(b.examDate)).slice(0, 3),
  }
}
