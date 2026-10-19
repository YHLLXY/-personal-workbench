import { create } from 'zustand'

interface ReminderState {
  unread: number
  setUnread: (n: number) => void
  /** 最近一次 /api/check-reminders 的扫描时刻（v1.32）：让"多久没扫过"在提醒中心可见 */
  scannedAt: string | null
  setScannedAt: (s: string | null) => void
}
export const useReminderStore = create<ReminderState>(set => ({
  unread: 0,
  setUnread: n => set({ unread: n }),
  scannedAt: null,
  setScannedAt: s => set({ scannedAt: s }),
}))
