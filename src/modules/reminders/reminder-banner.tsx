import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'
import { useReminderView } from './api'
import { reminderFacts } from './format'
import { claimNotifications, reminderKey } from './notify-log'

/**
 * 首页顶部横幅：**最该处理的那一条**到期提醒（点击跳提醒中心）。
 * v1.31 修：旧版只过滤「未忽略」、**不看时间**，再按 scheduledAt **倒序**取第一条 ——
 * 于是「3 条提醒待处理」后面挂的可能是下周才到期的那条，而真正过期 3 天的根本不在文案里。
 * 现在：先只留已到期，再取**最早**的一条（组内升序 = 拖最久的在最前，与提醒中心同一口径）。
 * v1.34：数据源换成 useReminderView 的投影 —— 任务已完成 / 提醒时间被清空的提醒不该再弹通知。
 */
export default function ReminderBanner() {
  const { rows, dueCount } = useReminderView()
  const now = Date.now()
  // rows 由 useMemo 缓存，故 effect 的依赖是稳定引用（数据没变就不会重跑）
  const due = rows
    .filter(x => new Date(x.reminder.scheduledAt).getTime() <= now)
    .sort((a, b) => a.reminder.scheduledAt.localeCompare(b.reminder.scheduledAt))

  // 前台系统通知：到期但服务端没发出去的（本地模式 sentAt 恒 null）弹一条。
  // v1.33.1：去重账本从「组件内 useRef」换成 localStorage（见 notify-log.ts）——
  // 旧版 ref 只在当前挂载有效，离开首页再回来就是新的一次，同一条提醒会反复弹。
  // 通知是增强能力：任何失败静默，绝不冒泡到 ErrorBoundary（v1.23 全站崩溃根因）。
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const pending = rows.filter(x => !x.reminder.sentAt && new Date(x.reminder.scheduledAt).getTime() <= Date.now())
    const freshKeys = claimNotifications(pending.map(x => reminderKey(x.reminder.id, x.reminder.scheduledAt)))
    if (freshKeys.length === 0) return
    const wanted = new Set(freshKeys)
    const fresh = pending.filter(x => wanted.has(reminderKey(x.reminder.id, x.reminder.scheduledAt)))
    // 单条 → 直接给正文；多条 → 报总数并带上最紧急那条，不再是一句没有信息量的「N 条待处理」
    const first = fresh.slice().sort((a, b) => a.reminder.scheduledAt.localeCompare(b.reminder.scheduledAt))[0]
    const firstText = first ? reminderFacts(first.reminder, first.refs).text : ''
    const body = fresh.length === 1 ? firstText : `${fresh.length} 条提醒待处理（最紧急：${firstText}）`
    // 必须走 SW 通道：Chrome（SW 控制下）与 iOS 均禁用 new Notification 构造器
    //（TypeError: Illegal constructor，v1.23 全站崩溃根因），registration.showNotification 是唯一跨平台合法路径。
    // 点击行为由 sw.ts 的 notificationclick（聚焦窗口）承接。
    void navigator.serviceWorker?.ready
      .then(reg => reg.showNotification('个人工作台提醒', { body, icon: '/pwa-192x192.png' }))
      .catch(() => { /* 无 SW / 发送失败：静默，应用内提醒中心仍是完整通道 */ })
  }, [rows])

  if (dueCount === 0) return null
  const top = due[0]
  const text = top ? reminderFacts(top.reminder, top.refs, now).text : `${dueCount} 条提醒`

  return (
    <Link to="/reminders" className="mb-4 flex items-center gap-2.5 rounded-xl border border-primary/25 bg-primary/8 px-4 py-3 text-sm hover:bg-primary/12 transition-colors">
      <Bell className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
      <span className="truncate text-foreground font-medium">{text}</span>
      <span className="ml-auto shrink-0 rounded-full bg-primary text-primary-foreground text-[10px] px-2 py-0.5">{dueCount}</span>
    </Link>
  )
}
