import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { isCloudMode, repository } from '@/lib/db'
import { getSupabaseClient } from '@/lib/db/supabase-client'
import type { Reminder } from '@/lib/db/types'
import { countDue } from './format'
import { useReminderStore } from './store'

export const reminderKeys = { all: ['reminders'] as const }

export interface CheckRemindersResult { reminders: Reminder[]; vapidPublicKey: string | null }

/** 云端：调 /api/check-reminders（服务端同时做兜底生成+发送，幂等）；本地：repository 列表 */
async function fetchReminders(): Promise<Reminder[]> {
  if (!isCloudMode) return repository.listReminders()
  const sb = getSupabaseClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session) return []
  const r = await fetch('/api/check-reminders', { headers: { authorization: `Bearer ${session.access_token}` } })
  if (!r.ok) throw new Error(`check-reminders ${r.status}`)
  const j = (await r.json()) as CheckRemindersResult
  return j.reminders
}

export function useReminders() {
  // staleTime：check-reminders 是重接口（服务端每次全量扫描+生成+推送），窗口聚焦/挂载不必反复打
  return useQuery({ queryKey: reminderKeys.all, queryFn: fetchReminders, staleTime: 30_000 })
}

/**
 * v1.31：**「忽略 / 恢复」整套 mutation 已删除**。
 * 提醒是引用对象（任务/考试/目标）的派生视图，出口只有一个——去把对应的事处理掉；
 * 服务端下一次扫描按 liveRefKeys 把行删掉，角标自然下降。
 * 旧实现为此专门维护 dismissedAt + 乐观更新 + 「不 invalidate」纪律，是在给一个派生数据造独立生命周期，
 * 也让人误以为「提醒」和「事情」是两份状态。
 */

/** 订阅提醒数据并同步角标（在 layout 调用一次即可；useEffect 内更新 store 避免渲染期副作用） */
export function useReminderSync() {
  const { data } = useReminders()
  const setUnread = useReminderStore(s => s.setUnread)
  const unread = useReminderStore(s => s.unread)
  useEffect(() => { setUnread(countDue(data ?? [])) }, [data, setUnread])
  return unread
}
