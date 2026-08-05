import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useGlobalHotkeys } from '../src/app/hotkeys'
import { useUiStore } from '../src/app/store'
import { QuickCapture } from '../src/app/quick-capture'
import { CommandPalette } from '../src/app/command-palette'
import { ThemeProvider } from '../src/app/theme'

/** 固定平台：jsdom platform 为空（默认 Windows 分支），Mac 机跑测试也保持一致 */
function setPlatform(p: string) {
  Object.defineProperty(window.navigator, 'platform', { value: p, configurable: true })
}

function Probe() {
  useGlobalHotkeys()
  const paletteOpen = useUiStore(s => s.paletteOpen)
  const captureOpen = useUiStore(s => s.captureOpen)
  const captureTab = useUiStore(s => s.captureTab)
  return <div data-testid="state">{`${paletteOpen}|${captureOpen}|${captureTab}`}</div>
}

describe('useGlobalHotkeys', () => {
  beforeEach(() => {
    setPlatform('Win32')
    useUiStore.setState({ paletteOpen: false, captureOpen: false, captureTab: 'task', shortcutsOpen: false })
  })

  it('Ctrl+K 切换命令面板', () => {
    render(<MemoryRouter><Probe /></MemoryRouter>)
    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' })
    expect(screen.getByTestId('state').textContent).toBe('true|false|task')
    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' })
    expect(screen.getByTestId('state').textContent).toBe('false|false|task')
  })

  it('Ctrl+N / Ctrl+Shift+N / Ctrl+Shift+X 打开对应 Tab（大写 key 归一）', () => {
    render(<MemoryRouter><Probe /></MemoryRouter>)
    fireEvent.keyDown(window, { ctrlKey: true, key: 'N' })
    expect(screen.getByTestId('state').textContent).toBe('false|true|task')
    fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, key: 'N' })
    expect(screen.getByTestId('state').textContent).toBe('false|true|note')
    fireEvent.keyDown(window, { ctrlKey: true, shiftKey: true, key: 'x' })
    expect(screen.getByTestId('state').textContent).toBe('false|true|habit')
  })

  it('Ctrl+, 打开设置路由', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Probe />} />
          <Route path="/settings" element={<div>SETTINGS_PAGE</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.keyDown(window, { ctrlKey: true, key: ',' })
    expect(screen.getByText('SETTINGS_PAGE')).toBeInTheDocument()
  })

  it('无修饰键的普通按键不触发', () => {
    render(<MemoryRouter><Probe /></MemoryRouter>)
    fireEvent.keyDown(window, { key: 'n' })
    expect(screen.getByTestId('state').textContent).toBe('false|false|task')
  })

  it('Esc 只关闭最上层（命令面板），不关闭其下的快速捕获', () => {
    useUiStore.setState({ paletteOpen: true, captureOpen: true, captureTab: 'task', shortcutsOpen: false })
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <MemoryRouter>
        <QueryClientProvider client={qc}>
          <ThemeProvider>
            <QuickCapture />
            <CommandPalette />
          </ThemeProvider>
        </QueryClientProvider>
      </MemoryRouter>,
    )
    fireEvent.keyDown(window, { key: 'Escape' })
    expect(useUiStore.getState().paletteOpen).toBe(false)
    expect(useUiStore.getState().captureOpen).toBe(true)
  })
})
