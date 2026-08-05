import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../src/app/theme'

/** matchMedia mock 工厂：可改 matches 并触发 change 监听（jsdom 无 matchMedia，必须 stub） */
function makeMatchMedia(initialDark: boolean) {
  let dark = initialDark
  const listeners: Array<(e: { matches: boolean }) => void> = []
  const mql = {
    get matches() { return dark },
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => { listeners.push(cb) },
    removeEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
      const i = listeners.indexOf(cb)
      if (i >= 0) listeners.splice(i, 1)
    },
  }
  return {
    mql,
    setDark(v: boolean) {
      dark = v
      listeners.forEach(cb => cb({ matches: v }))
    },
    install() { vi.stubGlobal('matchMedia', vi.fn().mockReturnValue(mql)) },
  }
}

function Probe() {
  const { theme, resolvedTheme, toggle } = useTheme()
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={toggle}>toggle</button>
    </div>
  )
}

describe('ThemeProvider 三态', () => {
  beforeEach(() => { localStorage.clear(); vi.unstubAllGlobals() })

  it('默认 light；toggle 按 light→dark→system→light 循环', () => {
    makeMatchMedia(false).install()
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('light')
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('system')
    expect(document.documentElement.classList.contains('dark')).toBe(false)
    fireEvent.click(screen.getByText('toggle'))
    expect(screen.getByTestId('theme').textContent).toBe('light')
  })

  it('system 模式解析当前系统配色；持久化到 localStorage', () => {
    makeMatchMedia(true).install() // 系统深色
    localStorage.setItem('wb-theme', 'system')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('theme').textContent).toBe('system')
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
    expect(localStorage.getItem('wb-theme')).toBe('system')
  })

  it('system 模式下系统配色变化即时跟随（change 事件）', () => {
    const mm = makeMatchMedia(false)
    mm.install()
    localStorage.setItem('wb-theme', 'system')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('resolved').textContent).toBe('light')
    act(() => mm.setDark(true))
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    expect(document.documentElement.classList.contains('dark')).toBe(true)
  })

  it('明确选 dark 后系统配色变化不干扰', () => {
    const mm = makeMatchMedia(false)
    mm.install()
    localStorage.setItem('wb-theme', 'dark')
    render(<ThemeProvider><Probe /></ThemeProvider>)
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
    act(() => mm.setDark(false))
    expect(screen.getByTestId('resolved').textContent).toBe('dark')
  })
})
