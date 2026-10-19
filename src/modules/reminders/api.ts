import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { isCloudMode, repository } from '@/lib/db'
import { getSupabaseClient } from '@/lib/db/supabase-client'
import type { Reminder } from '@/lib/db/types'
import { countDue } from './format'
import { useReminderStore } from './store'

export const reminderKeys = { all: ['reminders'] as const }

export interface CheckRemindersResult { reminders: Reminder[]; vapidPublicKey: string | null; scannedAt?: string }

/** 云端：调 /api/check-reminders（服务端同时做兜底生成+发送，幂等）；本地：repository 列表 */
async function fetchReminders(): Promise<Reminder[]> {
  if (!isCloudMode) return repository.listReminders()
  const sb = getSupabaseClient()
  const { data: { session } } = await sb.auth.getSession()
  if (!session) return []
  const r = await fetch('/api/check-reminders', { headers: { authorization: `Bearer ${session.access_token}` } })
  if (!r.ok) throw new Error(`check-reminders ${r.status}`)
  const j = (await r.json()) as CheckRemindersResult
  // 服务端扫描时刻写进 store（不在渲染期做副作用的话，提醒中心就只能显示"加载成功"，看不到新鲜度）
  useReminderStore.getState().setScannedAt(j.scannedAt ?? null)
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

/**
 * 到点触发（v1.32）：页面开着时不必等服务端 cron —— 在**下一条提醒的计划时刻**把查询作废，
 * useReminders 重新打 /api/check-reminders，服务端顺手完成生成与发送、前端顺手弹横幅。
 * 服务端 cron 的实测间隔是小时级（中位 199 分钟），这条定时器负责"应用开着就准点"。
 */
export function useReminderTimer() {
  const qc = useQueryClient()
  const { data } = useReminders()
  useEffect(() => {
    const next = (data ?? [])
      .map(r => new Date(r.scheduledAt).getTime())
      .filter(t => Number.isFinite(t) && t > Date.now())
      .sort((a, b) => a - b)[0]
    if (!next) return
    // 上限 24 小时：免得长期挂着的标签页把 timeout 堆成天文数字
    const delay = Math.min(next - Date.now() + 1000, 24 * 60 * 60 * 1000)
    const id = window.setTimeout(() => { void qc.invalidateQueries({ queryKey: reminderKeys.all }) }, delay)
    return () => window.clearTimeout(id)
  }, [data, qc])
}

/** 订阅提醒数据并同步角标（在 layout 调用一次即可；useEffect 内更新 store 避免渲染期副作用） */
export function useReminderSync() {
  const { data } = useReminders()
  const setUnread = useReminderStore(s => s.setUnread)
  const unread = useReminderStore(s => s.unread)
  useEffect(() => { setUnread(countDue(data ?? [])) }, [data, setUnread])
  return unread
}
