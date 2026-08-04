import { describe, it, expect, vi, beforeEach } from 'vitest'
import { loadHot } from '../src/lib/hot'

describe('loadHot', () => {
  beforeEach(() => { localStorage.clear() })
  it('无缓存且源失败时返回空且不崩溃', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
    const res = await loadHot(false)
    expect(res.items).toEqual([])
    expect(res.fromCache).toBe(false)
  })
})
