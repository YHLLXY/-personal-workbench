import { create } from 'zustand'

interface UiState {
  paletteOpen: boolean
  captureOpen: boolean
  setPaletteOpen: (v: boolean) => void
  setCaptureOpen: (v: boolean) => void
}
export const useUiStore = create<UiState>(set => ({
  paletteOpen: false,
  captureOpen: false,
  setPaletteOpen: v => set({ paletteOpen: v }),
  setCaptureOpen: v => set({ captureOpen: v }),
}))
