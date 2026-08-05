/** 全局快捷键表与匹配/格式化工具（纯函数，可测） */

export interface Hotkey {
  id: string
  key: string        // 单字符，匹配时统一 toLowerCase
  mod: boolean       // Mac = ⌘(metaKey)，Windows = Ctrl(ctrlKey)
  shift: boolean
  description: string
}

export const HOTKEYS: Hotkey[] = [
  { id: 'palette', key: 'k', mod: true, shift: false, description: '打开命令面板' },
  { id: 'new-task', key: 'n', mod: true, shift: false, description: '新建任务' },
  { id: 'new-note', key: 'n', mod: true, shift: true, description: '新建速记' },
  { id: 'checkin', key: 'x', mod: true, shift: true, description: '今日全部打卡' },
  { id: 'settings', key: ',', mod: true, shift: false, description: '打开设置' },
]

export function isMacPlatform(): boolean {
  return typeof navigator !== 'undefined' && navigator.platform.toLowerCase().includes('mac')
}

export function matchHotkey(
  e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; key: string },
  isMac: boolean = isMacPlatform(),
): Hotkey | null {
  const modDown = isMac ? e.metaKey : e.ctrlKey
  const key = e.key.toLowerCase()
  for (const hk of HOTKEYS) {
    if (modDown && key === hk.key && e.shiftKey === hk.shift) return hk
  }
  return null
}

export function formatShortcut(hk: Hotkey, isMac: boolean = isMacPlatform()): string {
  const key = hk.key.toUpperCase()
  if (isMac) return hk.shift ? `⌘⇧${key}` : `⌘${key}`
  return hk.shift ? `Ctrl+Shift+${key}` : `Ctrl+${key}`
}
