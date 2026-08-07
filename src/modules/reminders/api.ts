import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { isCloudMode, repository } from '@/lib/db'
import { getSupabaseClient } from '@/lib/db/supabase-client'
import type { Reminder } from '@/lib/db/types'
import { countUnread } from './format'
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
  return useQuery({ queryKey: reminderKeys.all, queryFn: fetchReminders })
}

export function useReminderMutations() {
  const qc = useQueryClient()
  const inv = () => qc.invalidateQueries({ queryKey: reminderKeys.all })
  return {
    dismiss: useMutation({ mutationFn: (id: string) => repository.dismissReminder(id), onSuccess: inv, onError: () => toast.error('操作失败') }),
    restore: useMutation({ mutationFn: (id: string) => repository.restoreReminder(id), onSuccess: inv, onError: () => toast.error('操作失败') }),
  }
}

/** 订阅提醒数据并同步角标未读数（在 layout 调用一次即可；useEffect 内更新 store 避免渲染期副作用） */
export function useReminderSync() {
  const { data } = useReminders()
  const setUnread = useReminderStore(s => s.setUnread)
  const unread = useReminderStore(s => s.unread)
  useEffect(() => { setUnread(countUnread(data ?? [])) }, [data, setUnread])
  return unread
}
