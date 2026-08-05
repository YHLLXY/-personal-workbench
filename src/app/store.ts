import { create } from 'zustand'

interface UiState {
  paletteOpen: boolean
  captureOpen: boolean
  captureTab: 'task' | 'note' | 'habit'
  shortcutsOpen: boolean
  setPaletteOpen: (v: boolean | ((v: boolean) => boolean)) => void
  setCaptureOpen: (v: boolean) => void
  setCaptureTab: (v: 'task' | 'note' | 'habit') => void
  setShortcutsOpen: (v: boolean) => void
}
export const useUiStore = create<UiState>(set => ({
  paletteOpen: false,
  captureOpen: false,
  captureTab: 'task',
  shortcutsOpen: false,
  setPaletteOpen: v => set(s => ({ paletteOpen: typeof v === 'function' ? v(s.paletteOpen) : v })),
  setCaptureOpen: v => set({ captureOpen: v }),
  setCaptureTab: v => set({ captureTab: v }),
  setShortcutsOpen: v => set({ shortcutsOpen: v }),
}))
