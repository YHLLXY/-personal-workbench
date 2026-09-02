import { useSyncExternalStore } from 'react'

/**
 * PWA 安装引导（「添加到主屏幕」）状态。
 * beforeinstallprompt 在页面加载早期就可能派发——捕获必须挂在启动链（src/pwa.ts 调 capturePwaInstall），
 * 挂到懒加载页面组件会在用户先进其他页时永久丢事件。设置页用 usePwaInstall() 订阅。
 * iOS Safari 无该 API（只能引导手动「分享→添加到主屏幕」，由设置页处理），standalone 判定含 navigator.standalone。
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export interface PwaInstallState {
  /** 已捕获安装事件，可 promptInstall() 一键唤起（Android / 桌面 Chromium） */
  canInstall: boolean
  /** 已以 standalone（主屏幕/桌面应用）模式运行 */
  installed: boolean
}

let deferred: BeforeInstallPromptEvent | null = null
let state: PwaInstallState = { canInstall: false, installed: false }
const listeners = new Set<() => void>()

function setState(next: Partial<PwaInstallState>): void {
  state = { ...state, ...next }
  for (const l of listeners) l()
}

function detectInstalled(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false
  return window.matchMedia('(display-mode: standalone)').matches
    || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

/** 启动期调用一次（src/pwa.ts）：挂 beforeinstallprompt / appinstalled 监听并检测当前运行模式 */
export function capturePwaInstall(): void {
  if (typeof window === 'undefined') return
  if (detectInstalled()) setState({ installed: true })
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault()
    deferred = e as BeforeInstallPromptEvent
    setState({ canInstall: true })
  })
  window.addEventListener('appinstalled', () => {
    deferred = null
    setState({ canInstall: false, installed: true })
  })
}

/** 唤起原生安装气泡；事件不存在或已消费返回 false。prompt 一次性，调用后必须清引用 */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false
  const ev = deferred
  deferred = null
  setState({ canInstall: false })
  try {
    await ev.prompt()
    const { outcome } = await ev.userChoice
    if (outcome === 'accepted') setState({ installed: true })
    return true
  } catch {
    return false
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** 设置页订阅安装状态；snapshot 引用在 setState 时才变，useSyncExternalStore 可安全比较 */
export function usePwaInstall(): PwaInstallState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
