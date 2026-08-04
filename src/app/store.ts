import { create } from 'zustand'

interface UiState {
  paletteOpen: boolean
  captureOpen: boolean
  setPaletteOpen: (v: boolean | ((v: boolean) => boolean)) => void
  setCaptureOpen: (v: boolean) => void
}
export const useUiStore = create<UiState>(set => ({
  paletteOpen: false,
  captureOpen: false,
  setPaletteOpen: v => set(s => ({ paletteOpen: typeof v === 'function' ? v(s.paletteOpen) : v })),
  setCaptureOpen: v => set({ captureOpen: v }),
}))
