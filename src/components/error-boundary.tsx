import { Component, type ErrorInfo, type ReactNode } from 'react'
import { isChunkError } from '@/lib/lazy-retry'

interface ErrorBoundaryProps {
  children: ReactNode
  /** 自定义 fallback；默认提供移动端友好的错误卡 */
  fallback?: (props: { error: Error; retry: () => void }) => ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

const fallbackClass =
  'flex flex-col items-center justify-center gap-4 min-h-[240px] px-6 py-10 text-center'

/**
 * 零依赖手写错误边界（整体优化方案 P1）：
 * - 懒加载 chunk 失败 → 提示版本更新/弱网，重试按钮刷新页面（React.lazy 缓存失败
 *   Promise，重渲染不会重新 import，必须整页刷新）；
 * - 其他渲染错误 → 重试按钮重置边界重新渲染子树（偶发错误可恢复）；
 * - 「返回首页」用于非首页场景一键逃离错误页。
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[workbench] render error:', error, info.componentStack)
  }

  reset = (): void => {
    this.setState({ error: null })
  }

  render(): ReactNode {
    if (this.state.error === null) return this.props.children
    if (this.props.fallback) {
      return this.props.fallback({ error: this.state.error, retry: this.reset })
    }
    return <DefaultFallback error={this.state.error} retry={this.reset} />
  }
}

function DefaultFallback({ error, retry }: { error: Error; retry: () => void }) {
  const chunkFailed = isChunkError(error)
  return (
    <div className={fallbackClass}>
      <div className="size-12 rounded-full bg-destructive/10 text-destructive flex items-center justify-center text-2xl" aria-hidden>
        !
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{chunkFailed ? '页面加载失败' : '页面出错了'}</p>
        <p className="text-xs text-muted-foreground max-w-[260px]">
          {chunkFailed
            ? '网络不稳定或应用刚更新，请重试'
            : '发生了意外错误，重试一下或稍后再来'}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={chunkFailed ? () => window.location.reload() : retry}
          className="min-h-11 min-w-[88px] rounded-xl bg-primary px-5 text-sm font-medium text-primary-foreground active:scale-[0.98] transition-transform"
        >
          重试
        </button>
        {typeof window !== 'undefined' && window.location.pathname !== '/' && (
          <button
            type="button"
            onClick={() => { window.location.assign('/') }}
            className="min-h-11 min-w-[88px] rounded-xl bg-muted px-5 text-sm font-medium text-foreground active:scale-[0.98] transition-transform"
          >
            返回首页
          </button>
        )}
      </div>
    </div>
  )
}