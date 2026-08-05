import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { matchHotkey } from '@/lib/hotkeys'
import { useUiStore } from './store'

/** 全局快捷键分发：在 Shell（Router 内）调用一次；命中后 preventDefault 阻止浏览器默认行为 */
export function useGlobalHotkeys() {
  const navigate = useNavigate()
  const setPaletteOpen = useUiStore(s => s.setPaletteOpen)
  const setCaptureOpen = useUiStore(s => s.setCaptureOpen)
  const setCaptureTab = useUiStore(s => s.setCaptureTab)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const hk = matchHotkey(e)
      if (!hk) return
      e.preventDefault()
      switch (hk.id) {
        case 'palette': setPaletteOpen(v => !v); break
        case 'new-task': setCaptureTab('task'); setCaptureOpen(true); break
        case 'new-note': setCaptureTab('note'); setCaptureOpen(true); break
        case 'checkin': setCaptureTab('habit'); setCaptureOpen(true); break
        case 'settings': navigate('/settings'); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, setPaletteOpen, setCaptureOpen, setCaptureTab])
}
