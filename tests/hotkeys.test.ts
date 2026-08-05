import { describe, it, expect } from 'vitest'
import { HOTKEYS, matchHotkey, formatShortcut } from '../src/lib/hotkeys'

type KeyEv = { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; key: string }
const ev = (p: Partial<KeyEv>): KeyEv => ({ metaKey: false, ctrlKey: false, shiftKey: false, key: '', ...p })

describe('HOTKEYS 表', () => {
  it('含 5 个条目且 id 唯一', () => {
    expect(HOTKEYS).toHaveLength(5)
    expect(new Set(HOTKEYS.map(h => h.id)).size).toBe(5)
  })
})

describe('matchHotkey', () => {
  it('Mac 用 metaKey：⌘K 匹配 palette，Ctrl+K 不匹配', () => {
    expect(matchHotkey(ev({ metaKey: true, key: 'k' }), true)?.id).toBe('palette')
    expect(matchHotkey(ev({ ctrlKey: true, key: 'k' }), true)).toBeNull()
  })
  it('Windows 用 ctrlKey：Ctrl+K 匹配，metaKey 不匹配', () => {
    expect(matchHotkey(ev({ ctrlKey: true, key: 'k' }), false)?.id).toBe('palette')
    expect(matchHotkey(ev({ metaKey: true, key: 'k' }), false)).toBeNull()
  })
  it('shift 组合与大写 key：⌘⇧N 匹配 new-note（N 归一为 n）', () => {
    expect(matchHotkey(ev({ metaKey: true, shiftKey: true, key: 'N' }), true)?.id).toBe('new-note')
  })
  it('shift 严格匹配：⌘⇧N 不匹配 new-task', () => {
    expect(matchHotkey(ev({ metaKey: true, shiftKey: true, key: 'n' }), true)?.id).toBe('new-note')
  })
  it('⌘, 匹配 settings', () => {
    expect(matchHotkey(ev({ metaKey: true, key: ',' }), true)?.id).toBe('settings')
  })
  it('未知按键返回 null', () => {
    expect(matchHotkey(ev({ metaKey: true, key: 'z' }), true)).toBeNull()
  })
  it('修饰键未按下时不匹配', () => {
    expect(matchHotkey(ev({ key: 'k' }), true)).toBeNull()
  })
})

describe('formatShortcut', () => {
  const hk = (id: string) => {
    const found = HOTKEYS.find(h => h.id === id)
    if (!found) throw new Error(`unknown hotkey id: ${id}`)
    return found
  }
  it('Mac：⌘N 与 ⌘⇧N', () => {
    expect(formatShortcut(hk('new-task'), true)).toBe('⌘N')
    expect(formatShortcut(hk('new-note'), true)).toBe('⌘⇧N')
  })
  it('Windows：Ctrl+N 与 Ctrl+Shift+N', () => {
    expect(formatShortcut(hk('new-task'), false)).toBe('Ctrl+N')
    expect(formatShortcut(hk('new-note'), false)).toBe('Ctrl+Shift+N')
  })
  it('逗号键直接显示', () => {
    expect(formatShortcut(hk('settings'), true)).toBe('⌘,')
    expect(formatShortcut(hk('settings'), false)).toBe('Ctrl+,')
  })
})
