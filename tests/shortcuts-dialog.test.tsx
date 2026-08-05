import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShortcutsDialog } from '../src/app/shortcuts-dialog'
import { useUiStore } from '../src/app/store'

describe('ShortcutsDialog', () => {
  const ORIGINAL_PLATFORM = window.navigator.platform

  beforeEach(() => {
    Object.defineProperty(window.navigator, 'platform', { value: 'MacIntel', configurable: true })
    useUiStore.setState({ shortcutsOpen: true })
  })

  afterEach(() => {
    Object.defineProperty(window.navigator, 'platform', { value: ORIGINAL_PLATFORM, configurable: true })
  })

  it('打开时列出全部 5 个快捷键（描述 + kbd）', () => {
    render(<ShortcutsDialog />)
    expect(screen.getByText('快捷键')).toBeInTheDocument()
    expect(screen.getByText('打开命令面板')).toBeInTheDocument()
    expect(screen.getByText('新建任务')).toBeInTheDocument()
    expect(screen.getByText('新建速记')).toBeInTheDocument()
    expect(screen.getByText('今日全部打卡')).toBeInTheDocument()
    expect(screen.getByText('打开设置')).toBeInTheDocument()
    expect(document.querySelectorAll('kbd')).toHaveLength(5)
    expect(screen.getByText('⌘K')).toBeInTheDocument()
    expect(screen.getByText('⌘N')).toBeInTheDocument()
    expect(screen.getByText('⌘⇧N')).toBeInTheDocument()
    expect(screen.getByText('⌘⇧X')).toBeInTheDocument()
    expect(screen.getByText('⌘,')).toBeInTheDocument()
  })

  it('关闭状态不渲染', () => {
    useUiStore.setState({ shortcutsOpen: false })
    render(<ShortcutsDialog />)
    expect(document.querySelectorAll('kbd')).toHaveLength(0)
  })

  it('按 Escape 关闭对话框并更新 store', async () => {
    useUiStore.setState({ shortcutsOpen: true })
    render(<ShortcutsDialog />)
    const user = userEvent.setup()
    await user.keyboard('{Escape}')
    expect(document.querySelectorAll('kbd')).toHaveLength(0)
    expect(useUiStore.getState().shortcutsOpen).toBe(false)
  })
})
