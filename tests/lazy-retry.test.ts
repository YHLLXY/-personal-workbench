import { describe, it, expect, vi, afterEach } from 'vitest'
import { importWithRetry, isChunkError } from '../src/lib/lazy-retry'

const chunkError = new Error('Failed to fetch dynamically imported module: https://x/a.js')

describe('importWithRetry', () => {
  afterEach(() => {
    vi.useRealTimers()
    sessionStorage.clear()
    vi.unstubAllGlobals()
  })

  it('首次成功直接 resolve，importer 只调用一次', async () => {
    const importer = vi.fn().mockResolvedValue({ default: () => null })
    await expect(importWithRetry(importer)).resolves.toEqual({ default: expect.any(Function) })
    expect(importer).toHaveBeenCalledTimes(1)
  })

  it('瞬时失败：1s 退避后重试成功', async () => {
    vi.useFakeTimers()
    const importer = vi.fn()
      .mockRejectedValueOnce(chunkError)
      .mockResolvedValueOnce({ default: () => null })
    const promise = importWithRetry(importer)
    const assertion = expect(promise).resolves.toEqual({ default: expect.any(Function) })
    await vi.advanceTimersByTimeAsync(1000)
    await assertion
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it('非 chunk 错误：重试上限 3 次后抛错，不触发自动刷新', async () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const error = new Error('boom in render')
    const importer = vi.fn().mockRejectedValue(error)
    const promise = importWithRetry(importer)
    const assertion = expect(promise).rejects.toBe(error)
    await vi.advanceTimersByTimeAsync(1000 + 2000 + 4000 + 1000)
    await assertion
    expect(importer).toHaveBeenCalledTimes(4)
    expect(reload).not.toHaveBeenCalled()
  })

  it('chunk 错误：重试耗尽后自动刷新一次（sessionStorage 守卫）', async () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const importer = vi.fn().mockRejectedValue(chunkError)
    const promise = importWithRetry(importer)
    const assertion = expect(promise).rejects.toBe(chunkError)
    await vi.advanceTimersByTimeAsync(60_000)
    await assertion
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('会话内只自动刷新一次（守卫标记防死循环）', async () => {
    vi.useFakeTimers()
    const reload = vi.fn()
    vi.stubGlobal('location', { ...window.location, reload })
    const importer = vi.fn().mockRejectedValue(chunkError)
    const p1 = importWithRetry(importer)
    const a1 = expect(p1).rejects.toBe(chunkError)
    await vi.advanceTimersByTimeAsync(60_000)
    await a1
    expect(reload).toHaveBeenCalledTimes(1)
    const p2 = importWithRetry(importer)
    const a2 = expect(p2).rejects.toBe(chunkError)
    await vi.advanceTimersByTimeAsync(60_000)
    await a2
    expect(reload).toHaveBeenCalledTimes(1)
  })
})

describe('isChunkError', () => {
  it('识别各浏览器 chunk 错误消息', () => {
    expect(isChunkError(new Error('Failed to fetch dynamically imported module: https://x/a.js'))).toBe(true)
    expect(isChunkError(new Error('Importing a module script failed'))).toBe(true)
    expect(isChunkError(new Error('error loading dynamically imported module'))).toBe(true)
    expect(isChunkError(new Error('Loading chunk 12 failed'))).toBe(true)
    expect(isChunkError(new Error('random error'))).toBe(false)
    expect(isChunkError('not an error')).toBe(false)
    expect(isChunkError(null)).toBe(false)
  })
})