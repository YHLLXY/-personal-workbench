import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ErrorBoundary } from '../src/components/error-boundary'

function Boom(): never {
  throw new Error('boom')
}

function Ok(): React.JSX.Element {
  return <div>ok content</div>
}

describe('ErrorBoundary', () => {
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

  beforeEach(() => {
    consoleError.mockClear()
    vi.restoreAllMocks()
  })

  it('正常子组件不受影响', () => {
    render(<ErrorBoundary><Ok /></ErrorBoundary>)
    expect(screen.getByText('ok content')).toBeInTheDocument()
  })

  it('子组件抛错时显示默认错误卡', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    expect(screen.getByText('页面出错了')).toBeInTheDocument()
    expect(screen.getByText('发生了意外错误，重试一下或稍后再来')).toBeInTheDocument()
  })

  it('非 chunk 错误点「重试」重置边界恢复渲染', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, pathname: '/' })
    render(<ErrorBoundary><Boom /></ErrorBoundary>)
    fireEvent.click(screen.getByText('重试'))
    expect(reload).not.toHaveBeenCalled()
    // 重置后子组件仍抛错 → 再次显示错误卡（错误未消失时重试安全降级）
    expect(screen.getByText('页面出错了')).toBeInTheDocument()
    vi.unstubAllGlobals()
  })

  it('chunk 加载失败显示弱网/更新提示，重试触发整页刷新', () => {
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload, pathname: '/tasks' })
    const ChunkBoom = (): never => {
      throw new Error('Failed to fetch dynamically imported module: https://x/assets/a.js')
    }
    render(<ErrorBoundary><ChunkBoom /></ErrorBoundary>)
    expect(screen.getByText('页面加载失败')).toBeInTheDocument()
    expect(screen.getByText('网络不稳定或应用刚更新，请重试')).toBeInTheDocument()
    expect(screen.getByText('返回首页')).toBeInTheDocument()
    fireEvent.click(screen.getByText('重试'))
    expect(reload).toHaveBeenCalledTimes(1)
    vi.unstubAllGlobals()
  })

  it('自定义 fallback 优先于默认', () => {
    render(
      <ErrorBoundary fallback={({ retry }) => (
        <button onClick={retry}>custom retry</button>
      )}>
        <Boom />
      </ErrorBoundary>,
    )
    expect(screen.getByText('custom retry')).toBeInTheDocument()
    expect(screen.queryByText('页面出错了')).not.toBeInTheDocument()
  })
})