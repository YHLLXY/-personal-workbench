import { describe, it, expect } from 'vitest'
import { findUnfilledRows, gridRowFills } from '../src/lib/home-grid'
import { homeCards } from '../src/registry'

/** 首页网格空洞回归（v1.26）。CSS Grid 默认不回溯，跨度排错就会留空洞，靠机器把关。 */
describe('首页 12 列网格：行填充', () => {
  it('复刻「不回溯」排布：修复前的跨度确实产生 3/5/2 列空洞（与线上实测一致）', () => {
    // 修复前顺序 = 天气4 待办5 考试3 专注4 热点5 速记12 打卡7 复盘12 趋势5 项目5 成长5
    const legacy = [4, 5, 3, 4, 5, 12, 7, 12, 5, 5, 5]
    expect(gridRowFills(legacy)).toEqual([12, 9, 12, 7, 12, 10, 5])
    expect(findUnfilledRows(legacy).map(r => r.empty)).toEqual([3, 5, 2])
  })

  it('当前注册表 + 天气卡（按 home.tsx 的渲染顺序）无空洞', () => {
    // home.tsx 把天气卡固定渲染在第一位（col-span-12 md:col-span-4），其余按 desktopOrder 排
    const spans = [4, ...homeCards().sort((a, b) => a.desktopOrder - b.desktopOrder).map(c => Number(c.span))]
    expect(findUnfilledRows(spans)).toEqual([])
  })

  it('跨度取值合法且每张卡片只注册一次', () => {
    const cards = homeCards()
    for (const c of cards) expect(['3', '4', '5', '7', '8', '12']).toContain(c.span)
    const ids = cards.map(c => c.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(new Set(cards.map(c => c.desktopOrder)).size).toBe(cards.length)
  })
})
