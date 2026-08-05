import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CommandPalette } from '../src/app/command-palette'
import { useUiStore } from '../src/app/store'
import { ThemeProvider } from '../src/app/theme'

function setPlatform(p: string) {
  Object.defineProperty(window.navigator, 'platform', { value: p, configurable: true })
}

function renderPalette() {
  return render(<MemoryRouter><ThemeProvider><CommandPalette /></ThemeProvider></MemoryRouter>)
}

describe('CommandPalette', () => {
  beforeEach(() => { setPlatform('MacIntel'); useUiStore.setState({ paletteOpen: true, captureOpen: false, captureTab: 'task', shortcutsOpen: false }) })

  it('未打开时不渲染', () => {
    useUiStore.setState({ paletteOpen: false })
    renderPalette()
    expect(screen.queryByPlaceholderText('输入命令或搜索…')).not.toBeInTheDocument()
  })

  it('打开时显示三组与全部新命令', () => {
    renderPalette()
    expect(screen.getByText('新建')).toBeInTheDocument()
    expect(screen.getByText('操作')).toBeInTheDocument()
    expect(screen.getByText('导航')).toBeInTheDocument()
    expect(screen.getByText('新建任务')).toBeInTheDocument()
    expect(screen.getByText('切换主题（当前：浅色）')).toBeInTheDocument()
    expect(screen.getByText('导出备份')).toBeInTheDocument()
    expect(screen.getByText('快捷键说明')).toBeInTheDocument()
    expect(screen.getByText('打开设置')).toBeInTheDocument()
  })

  it('快捷键提示以 kbd 显示（Mac 固定为 ⌘ 前缀）', () => {
    renderPalette()
    expect(screen.getByText('⌘N')).toBeInTheDocument()
    expect(screen.getByText('⌘⇧N')).toBeInTheDocument()
    expect(screen.getByText('⌘⇧X')).toBeInTheDocument()
    expect(screen.getByText('⌘,')).toBeInTheDocument()
  })

  it('搜索过滤：匹配的命令与页面，空结果显示无匹配', () => {
    renderPalette()
    const input = screen.getByPlaceholderText('输入命令或搜索…')
    fireEvent.change(input, { target: { value: '导出' } })
    expect(screen.getByText('导出备份')).toBeInTheDocument()
    expect(screen.queryByText('新建任务')).not.toBeInTheDocument()
    fireEvent.change(input, { target: { value: 'zzz不存在' } })
    expect(screen.getByText('没有匹配结果')).toBeInTheDocument()
  })
})
