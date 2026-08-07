import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useReminders } from './api'
import { useTasks } from '@/modules/overview/api'
import { useExams } from '@/modules/study/api'
import { countUnread, reminderText } from './format'
import type { Reminder } from '@/lib/db/types'

/** 首页顶部横幅：最近未读到期提醒（点击跳提醒中心） */
export default function ReminderBanner() {
  const { data: reminders } = useReminders()
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const unread = countUnread(reminders ?? [])

  // 前台系统通知：到期未发送的提醒弹系统通知（需已授权；订阅推送时授权，见设置页）
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const due = (reminders ?? []).filter(r => !r.sentAt && !r.dismissedAt && new Date(r.scheduledAt).getTime() <= Date.now())
    if (due.length === 0) return
    const n = new Notification('个人工作台提醒', { body: `${due.length} 条提醒待处理，点击查看`, icon: '/pwa-192x192.png' })
    n.onclick = () => { window.focus(); n.close() }
  }, [reminders])

  if (unread === 0) return null
  const taskById = new Map((tasks ?? []).map(t => [t.id, t]))
  const examById = new Map((exams ?? []).map(e => [e.id, e]))

  function textOf(r: Reminder): string {
    if (r.refType === 'task') {
      const t = taskById.get(r.refId)
      return reminderText(r.kind, t?.title ?? '', t?.dueDate ?? '', t?.dueTime ?? null)
    }
    const e = examById.get(r.refId)
    return reminderText(r.kind, e?.title ?? '', e?.examDate ?? '', e?.examTime ?? null)
  }

  const newest = [...(reminders ?? [])].filter(r => !r.dismissedAt).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt))[0]

  return (
    <Link to="/reminders" className="mb-4 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm hover:bg-primary/12 transition-colors">
      <Bell className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
      <span className="truncate text-primary-foreground/90">{newest ? textOf(newest) : `${unread} 条提醒`}</span>
      <span className="ml-auto shrink-0 rounded-full bg-primary text-primary-foreground text-[10px] px-2 py-0.5">{unread}</span>
    </Link>
  )
}
