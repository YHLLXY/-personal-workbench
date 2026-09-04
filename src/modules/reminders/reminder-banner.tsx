import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useReminders } from './api'
import { useTasks } from '@/modules/overview/api'
import { useExams } from '@/modules/study/api'
import { useStudyGoals } from '@/modules/study/goals-api'
import { countUnread, reminderText } from './format'
import type { Reminder } from '@/lib/db/types'

/** 首页顶部横幅：最近未读到期提醒（点击跳提醒中心） */
export default function ReminderBanner() {
  const { data: reminders } = useReminders()
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const { data: goals } = useStudyGoals()
  const unread = countUnread(reminders ?? [])
  const notifiedRef = useRef(new Set<string>())

  // 前台系统通知：到期未发送的提醒弹系统通知（每 id 每次会话仅弹一次，避免本地模式重复打扰）
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const due = (reminders ?? []).filter(r => !r.sentAt && !r.dismissedAt && new Date(r.scheduledAt).getTime() <= Date.now())
    // 清理已处理/已忽略的 id（忽略后可重新提醒）
    for (const id of notifiedRef.current) if (!due.some(r => r.id === id)) notifiedRef.current.delete(id)
    const fresh = due.filter(r => !notifiedRef.current.has(r.id))
    if (fresh.length === 0) return
    // 去重 id 先登记：通知是 fire-and-forget，失败不重试（每次 effect 重跑都重试反而骚扰）
    for (const r of fresh) notifiedRef.current.add(r.id)
    // 必须走 SW 通道：Chrome（SW 控制下）与 iOS 均禁用 new Notification 构造器
    //（TypeError: Illegal constructor，v1.23 全站崩溃根因），registration.showNotification 是唯一跨平台合法路径。
    // 点击行为由 sw.ts 的 notificationclick（聚焦窗口）承接。通知是增强能力：任何失败静默，绝不冒泡到 ErrorBoundary。
    void navigator.serviceWorker?.ready
      .then(reg => reg.showNotification('个人工作台提醒', { body: `${fresh.length} 条提醒待处理，点击查看`, icon: '/pwa-192x192.png' }))
      .catch(() => { /* 无 SW / 发送失败：静默，应用内提醒中心仍是完整通道 */ })
  }, [reminders])

  if (unread === 0) return null
  const taskById = new Map((tasks ?? []).map(t => [t.id, t]))
  const examById = new Map((exams ?? []).map(e => [e.id, e]))
  const goalById = new Map((goals ?? []).map(g => [g.id, g]))

  function textOf(r: Reminder): string {
    if (r.refType === 'task') {
      const t = taskById.get(r.refId)
      return reminderText(r.kind, t?.title ?? '', t?.dueDate ?? '', t?.dueTime ?? null)
    }
    if (r.refType === 'goal') {
      const g = goalById.get(r.refId)
      return reminderText(r.kind, g?.title ?? '', g?.deadline ?? '', null)
    }
    const e = examById.get(r.refId)
    return reminderText(r.kind, e?.title ?? '', e?.examDate ?? '', e?.examTime ?? null)
  }

  const newest = [...(reminders ?? [])].filter(r => !r.dismissedAt).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0]

  return (
    <Link to="/reminders" className="mb-4 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm hover:bg-primary/12 transition-colors">
      <Bell className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
      <span className="truncate text-foreground font-medium">{newest ? textOf(newest) : `${unread} 条提醒`}</span>
      <span className="ml-auto shrink-0 rounded-full bg-primary text-primary-foreground text-[10px] px-2 py-0.5">{unread}</span>
    </Link>
  )
}
