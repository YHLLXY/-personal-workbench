import { describe, it, expect } from 'vitest'
import { SOURCES, STABLE_SOURCES, type HotCategory } from '../api/hot'

describe('SOURCES 源库', () => {
  it('id 全局唯一', () => {
    const ids = SOURCES.map(s => s.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('category 合法且每个分类至少 2 个源', () => {
    const cats = SOURCES.map(s => s.category)
    for (const c of cats) expect(['tech', 'academic', 'zh']).toContain(c)
    for (const c of ['tech', 'academic', 'zh'] as HotCategory[]) {
      expect(SOURCES.filter(s => s.category === c).length).toBeGreaterThanOrEqual(2)
    }
  })
  it('稳定源（非 experimental）不少于 15 个', () => {
    expect(STABLE_SOURCES.length).toBeGreaterThanOrEqual(15)
  })
  it('每个源都有 name 与 fetch 函数', () => {
    for (const s of SOURCES) {
      expect(typeof s.name).toBe('string')
      expect(s.name.length).toBeGreaterThan(0)
      expect(typeof s.fetch).toBe('function')
    }
  })
})
