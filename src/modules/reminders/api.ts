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
  // staleTime：check-reminders 是重接口（服务端每次全量扫描+生成+推送），窗口聚焦/挂载不必反复打
  return useQuery({ queryKey: reminderKeys.all, queryFn: fetchReminders, staleTime: 30_000 })
}

export function useReminderMutations() {
  const qc = useQueryClient()
  // 乐观更新：忽略/恢复只改一条记录，写库可信（本地同步/云端单条 update）。
  // 成功后不再 invalidate——否则会触发 check-reminders 全量重跑（扫三表+发送推送），UI 卡数秒（2026-08 线上反馈）。
  function useOptimisticToggle(dismissed: boolean) {
    return useMutation({
      mutationFn: (id: string) => (dismissed ? repository.dismissReminder(id) : repository.restoreReminder(id)),
      onMutate: async (id: string) => {
        await qc.cancelQueries({ queryKey: reminderKeys.all })
        const prev = qc.getQueryData<Reminder[]>(reminderKeys.all)
        qc.setQueryData<Reminder[]>(reminderKeys.all, old =>
          (old ?? []).map(r => (r.id === id ? { ...r, dismissedAt: dismissed ? new Date().toISOString() : null } : r)))
        return { prev }
      },
      onError: (_e, _id, ctx) => {
        if (ctx?.prev) qc.setQueryData(reminderKeys.all, ctx.prev)
        toast.error('操作失败')
      },
    })
  }
  const dismiss = useOptimisticToggle(true)
  const restore = useOptimisticToggle(false)
  // 全部忽略：批量 dismiss + 一次乐观更新（同一套「不 invalidate」纪律）
  const dismissAll = useMutation({
    mutationFn: async (ids: string[]) => { await Promise.all(ids.map(id => repository.dismissReminder(id))); return ids.length },
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: reminderKeys.all })
      const prev = qc.getQueryData<Reminder[]>(reminderKeys.all)
      const at = new Date().toISOString()
      qc.setQueryData<Reminder[]>(reminderKeys.all, old => (old ?? []).map(r => (r.dismissedAt ? r : { ...r, dismissedAt: at })))
      return { prev }
    },
    onError: (_e, _ids, ctx) => {
      if (ctx?.prev) qc.setQueryData(reminderKeys.all, ctx.prev)
      toast.error('操作失败')
    },
  })
  return { dismiss, restore, dismissAll }
}

/** 订阅提醒数据并同步角标未读数（在 layout 调用一次即可；useEffect 内更新 store 避免渲染期副作用） */
export function useReminderSync() {
  const { data } = useReminders()
  const setUnread = useReminderStore(s => s.setUnread)
  const unread = useReminderStore(s => s.unread)
  useEffect(() => { setUnread(countUnread(data ?? [])) }, [data, setUnread])
  return unread
}
