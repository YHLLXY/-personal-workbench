import { describe, it, expect } from 'vitest'
import { homeCards } from '../src/registry'

/** 首页卡片注册表约束（v1.32）。
 *  布局已改成 CSS 多列瀑布流，不再有「列跨度」这种东西——但 desktopOrder 仍然是排序依据，
 *  重复会让卡片顺序随机漂移；编号不连续则说明有人删卡没重排。 */
describe('首页卡片注册表', () => {
  it('每张卡片只注册一次，桌面顺序唯一', () => {
    const cards = homeCards()
    expect(cards.length).toBeGreaterThan(0)
    expect(new Set(cards.map(c => c.id)).size).toBe(cards.length)
    expect(new Set(cards.map(c => c.desktopOrder)).size).toBe(cards.length)
  })

  it('桌面顺序是连续整数 1..N（插卡时不必猜空位）', () => {
    const orders = homeCards().map(c => c.desktopOrder).sort((a, b) => a - b)
    expect(orders).toEqual(orders.map((_, i) => i + 1))
  })
})
