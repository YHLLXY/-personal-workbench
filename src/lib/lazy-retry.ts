import { lazy, type ComponentType, type LazyExoticComponent } from 'react'

/** sessionStorage 守卫标记：每个会话只自动刷新一次，避免刷新死循环 */
const REFRESHED_KEY = 'workbench-chunk-refreshed'

/** 识别 chunk 动态导入失败的错误（Chrome/Firefox/Safari 消息各不同） */
export function isChunkError(error: unknown): boolean {
  return error instanceof Error && (
    /Failed to fetch dynamically imported module/i.test(error.message) ||
    /Importing a module script failed/i.test(error.message) ||
    /error loading dynamically imported module/i.test(error.message) ||
    /Loading chunk .* failed/i.test(error.message)
  )
}

function shouldAutoRefresh(): boolean {
  try {
    if (sessionStorage.getItem(REFRESHED_KEY) === '1') return false
    sessionStorage.setItem(REFRESHED_KEY, '1')
    return true
  } catch {
    return false
  }
}

/** 从错误消息中提取 chunk URL（Chromium 消息格式：「Failed to fetch dynamically imported module: https://...」） */
function extractChunkUrl(message: string): string | null {
  const m = message.match(/https?:\/\/\S+/)
  if (!m) return null
  return m[0].replace(/[).,;'"]+$/, '')
}

/** 带时间戳 cache-busting 的动态 import：绕开 Chromium 对失败请求的 sticky cache。
 *  15s 超时保护：import() 永不落定（如请求被 SW 拦截挂起）时仍能继续重试流程。 */
function importWithBusting<T>(url: string): Promise<T> {
  const sep = url.includes('?') ? '&' : '?'
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('chunk import timed out')), 15_000)
    import(/* @vite-ignore */ `${url}${sep}t=${Date.now()}`).then(
      m => { clearTimeout(timer); resolve(m as T) },
      e => { clearTimeout(timer); reject(e as Error) },
    )
  })
}

/**
 * 动态 import 重试核心（纯函数，独立可测）：
 * 1. 首次失败 → 指数退避重试 3 次（1s/2s/4s），第 2 次起尝试 URL 时间戳 cache-busting；
 * 2. 仍失败且为 chunk 错误 → 会话内仅一次自动刷新（sessionStorage 守卫），
 *    解决部署版本错位导致 chunk 404（React.lazy 会缓存失败 Promise，
 *    普通错误边界的「重试」按钮不会重新拉取 chunk，必须整页刷新）；
 * 3. 刷新后仍失败 → 抛错交给 ErrorBoundary 兜底 UI。
 */
export async function importWithRetry<T>(
  importer: () => Promise<T>,
): Promise<T> {
  try {
    return await importer()
  } catch (firstError) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      await new Promise(r => setTimeout(r, 1000 * 2 ** (attempt - 1)))
      try {
        if (attempt >= 2 && isChunkError(firstError)) {
          const url = extractChunkUrl((firstError as Error).message)
          if (url) return await importWithBusting<T>(url)
        }
        return await importer()
      } catch {
        // 继续下一次重试
      }
    }
    if (isChunkError(firstError) && shouldAutoRefresh()) {
      window.location.reload()
    }
    throw firstError
  }
}

/**
 * 懒加载 + 自动重试包装：替换 React.lazy 全站统一使用。
 * 失败的 Promise 永不交给 React.lazy（否则被缓存，无法重试）。
 */
export function lazyRetry<T extends ComponentType<unknown>>(
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(() => importWithRetry(importer))
}