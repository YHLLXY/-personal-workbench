import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ShortcutsDialog } from '../src/app/shortcuts-dialog'
import { useUiStore } from '../src/app/store'

function setPlatform(p: string) {
  Object.defineProperty(window.navigator, 'platform', { value: p, configurable: true })
}

describe('ShortcutsDialog', () => {
  beforeEach(() => { setPlatform('MacIntel'); useUiStore.setState({ shortcutsOpen: true }) })

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
    expect(screen.getByText('⌘⇧X')).toBeInTheDocument()
  })

  it('关闭状态不渲染', () => {
    useUiStore.setState({ shortcutsOpen: false })
    render(<ShortcutsDialog />)
    expect(document.querySelectorAll('kbd')).toHaveLength(0)
  })
})
