import { create } from 'zustand'

interface ReminderState {
  unread: number
  setUnread: (n: number) => void
}
export const useReminderStore = create<ReminderState>(set => ({
  unread: 0,
  setUnread: n => set({ unread: n }),
}))
