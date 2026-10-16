import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useReminders } from './api'
import { useTasks } from '@/modules/overview/api'
import { useExams } from '@/modules/study/api'
import { useStudyGoals } from '@/modules/study/goals-api'
import { countDue, reminderFacts, type ReminderRefs } from './format'
import type { Reminder } from '@/lib/db/types'

/**
 * 首页顶部横幅：**最该处理的那一条**到期提醒（点击跳提醒中心）。
 * v1.31 修：旧版只过滤「未忽略」、**不看时间**，再按 scheduledAt **倒序**取第一条 ——
 * 于是「3 条提醒待处理」后面挂的可能是下周才到期的那条，而真正过期 3 天的根本不在文案里。
 * 现在：先只留已到期，再取**最早**的一条（组内升序 = 拖最久的在最前，与提醒中心同一口径）。
 */
export default function ReminderBanner() {
  const { data: reminders } = useReminders()
  const { data: tasks } = useTasks()
  const { data: exams } = useExams()
  const { data: goals } = useStudyGoals()
  const notifiedRef = useRef(new Set<string>())
  const now = Date.now()
  const taskById = new Map((tasks ?? []).map(t => [t.id, t]))
  const examById = new Map((exams ?? []).map(e => [e.id, e]))
  const goalById = new Map((goals ?? []).map(g => [g.id, g]))

  function refsOf(r: Reminder): ReminderRefs {
    return r.refType === 'task' ? { task: taskById.get(r.refId) }
      : r.refType === 'exam' ? { exam: examById.get(r.refId) }
      : { goal: goalById.get(r.refId) }
  }
  const due = (reminders ?? [])
    .filter(r => new Date(r.scheduledAt).getTime() <= now)
    .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const unread = countDue(reminders ?? [], now)

  // 前台系统通知：到期但服务端没发出去的（本地模式 sentAt 恒 null）弹一条，每 id 每次会话仅一次。
  // 通知是增强能力：任何失败静默，绝不冒泡到 ErrorBoundary（v1.23 全站崩溃根因）。
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const pending = (reminders ?? []).filter(r => !r.sentAt && new Date(r.scheduledAt).getTime() <= Date.now())
    for (const id of notifiedRef.current) if (!pending.some(r => r.id === id)) notifiedRef.current.delete(id)
    const fresh = pending.filter(r => !notifiedRef.current.has(r.id))
    if (fresh.length === 0) return
    for (const r of fresh) notifiedRef.current.add(r.id)
    // 单条 → 直接给正文；多条 → 报总数并带上最紧急那条，不再是一句没有信息量的「N 条待处理」
    const first = fresh.slice().sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))[0]
    const firstText = first ? reminderFacts(first, refsOf(first)).text : ''
    const body = fresh.length === 1 ? firstText : `${fresh.length} 条提醒待处理（最紧急：${firstText}）`
    // 必须走 SW 通道：Chrome（SW 控制下）与 iOS 均禁用 new Notification 构造器
    //（TypeError: Illegal constructor，v1.23 全站崩溃根因），registration.showNotification 是唯一跨平台合法路径。
    // 点击行为由 sw.ts 的 notificationclick（聚焦窗口）承接。
    void navigator.serviceWorker?.ready
      .then(reg => reg.showNotification('个人工作台提醒', { body, icon: '/pwa-192x192.png' }))
      .catch(() => { /* 无 SW / 发送失败：静默，应用内提醒中心仍是完整通道 */ })
    // refsOf 依赖 tasks/exams/goals，但它们变了不必重发通知；依赖 reminders 即可
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reminders])

  if (unread === 0) return null
  const top = due[0]
  const text = top ? reminderFacts(top, refsOf(top), now).text : `${unread} 条提醒`

  return (
    <Link to="/reminders" className="mb-4 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm hover:bg-primary/12 transition-colors">
      <Bell className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
      <span className="truncate text-foreground font-medium">{text}</span>
      <span className="ml-auto shrink-0 rounded-full bg-primary text-primary-foreground text-[10px] px-2 py-0.5">{unread}</span>
    </Link>
  )
}
