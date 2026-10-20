import { describe, it, expect } from 'vitest'
import { homeCards } from '../src/registry'

/** 首页卡片注册表约束。
 *  v1.33 起布局是 12 列 Bento：desktopOrder 决定行流顺序，span 决定占几列（见 tests/home-bento.test.ts）。
 *  这里只管两件事——顺序唯一、编号连续（删卡不重排会让网格错位）。 */
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
