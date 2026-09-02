import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'

/** pwa-install 是模块级 store：vi.resetModules 让每个用例拿到独立实例，互不串状态 */
async function fresh() {
  vi.resetModules()
  return await import('../src/lib/pwa-install')
}

function fakePromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const ev = new Event('beforeinstallprompt') as Event & {
    prompt: () => Promise<void>
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
  }
  Object.assign(ev, { prompt: vi.fn(async () => {}), userChoice: Promise.resolve({ outcome }) })
  return ev
}

function Probe(mod: Awaited<ReturnType<typeof fresh>>) {
  return function Probe() {
    const s = mod.usePwaInstall()
    return <div data-testid="pwa-probe">{`${s.canInstall}:${s.installed}`}</div>
  }
}

describe('pwa-install', () => {
  beforeEach(() => { vi.resetModules() })

  it('启动捕获后收到 beforeinstallprompt → canInstall=true（设置页订阅可见）', async () => {
    const mod = await fresh()
    mod.capturePwaInstall()
    const P = Probe(mod)
    render(<P />)
    expect(screen.getByTestId('pwa-probe').textContent).toBe('false:false')
    act(() => { window.dispatchEvent(fakePromptEvent()) })
    expect(screen.getByTestId('pwa-probe').textContent).toBe('true:false')
  })

  it('promptInstall 消费事件（一次性），userChoice accepted → installed=true', async () => {
    const mod = await fresh()
    mod.capturePwaInstall()
    const ev = fakePromptEvent('accepted')
    act(() => { window.dispatchEvent(ev) })
    await expect(mod.promptInstall()).resolves.toBe(true)
    // 事件一次性：调用过 prompt 后不可复用
    await expect(mod.promptInstall()).resolves.toBe(false)
    const P = Probe(mod)
    render(<P />)
    expect(screen.getByTestId('pwa-probe').textContent).toBe('false:true')
  })

  it('userChoice dismissed → 不标记已安装', async () => {
    const mod = await fresh()
    mod.capturePwaInstall()
    act(() => { window.dispatchEvent(fakePromptEvent('dismissed')) })
    await expect(mod.promptInstall()).resolves.toBe(true)
    const P = Probe(mod)
    render(<P />)
    expect(screen.getByTestId('pwa-probe').textContent).toBe('false:false')
  })

  it('appinstalled 事件 → installed=true 且 canInstall 收起', async () => {
    const mod = await fresh()
    mod.capturePwaInstall()
    act(() => { window.dispatchEvent(fakePromptEvent()) })
    act(() => { window.dispatchEvent(new Event('appinstalled')) })
    const P = Probe(mod)
    render(<P />)
    expect(screen.getByTestId('pwa-probe').textContent).toBe('false:true')
  })

  it('standalone 运行（display-mode: standalone）→ capture 即判定已安装', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true, addEventListener() {}, removeEventListener() {} }))
    const mod = await fresh()
    mod.capturePwaInstall()
    const P = Probe(mod)
    render(<P />)
    expect(screen.getByTestId('pwa-probe').textContent).toBe('false:true')
  })

  it('无事件时 promptInstall 返回 false 不抛错', async () => {
    const mod = await fresh()
    await expect(mod.promptInstall()).resolves.toBe(false)
  })
})
