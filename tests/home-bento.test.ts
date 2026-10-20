import { describe, it, expect } from 'vitest'
import { homeCards } from '../src/registry'
import { SPAN_CLASS, bentoRows, bentoSpans, type BentoSpan } from '../src/lib/bento'

/** 首页 12 列 Bento 的几何约束（v1.33）。
 *  grid-auto-flow: row 不会回退——某一行跨度之和不足 12，右边就是一个洞
 *  （用户 2026-10-20 报的「还是有很大的空隙」就是这个形态，只是那一次洞在列底）。
 *  这条测试只回答一个问题：把卡片按 desktopOrder 排好后，每一行都填得满吗？ */
function clsSpan(cls: string, bp: 'md' | 'xl'): number {
  const m = cls.match(new RegExp(bp + ':col-span-(\\d+)'))
  return m ? Number(m[1]) : 12
}

describe('首页 Bento 跨度', () => {
  const cards = homeCards().sort((a, b) => a.desktopOrder - b.desktopOrder)

  it('每张卡都声明了合法跨度', () => {
    expect(cards.length).toBeGreaterThan(0)
    for (const c of cards) expect([4, 6, 8, 12]).toContain(c.span)
  })

  it('XL 断点：每行跨度之和都等于 12（含最后一行）', () => {
    const rows = bentoRows(bentoSpans(cards).map(s => clsSpan(SPAN_CLASS[s], 'xl')), 12)
    expect(rows.length).toBe(4)
    for (const r of rows) expect(r.sum).toBe(12)
  })

  it('MD 断点：两列降级后不留行尾空洞', () => {
    const spans = bentoSpans(cards).map(s => clsSpan(SPAN_CLASS[s], 'md'))
    const rows = bentoRows(spans, 12)
    for (const r of rows.slice(0, -1)) expect(r.sum).toBe(12)
    expect(rows[rows.length - 1].sum).toBeLessThanOrEqual(12)
  })

  it('跨度映射不写死 px：4/6/8 在 md 上都是 6 列', () => {
    const map: Record<BentoSpan, string> = SPAN_CLASS
    expect(clsSpan(map[4], 'md')).toBe(6)
    expect(clsSpan(map[6], 'md')).toBe(6)
    expect(clsSpan(map[8], 'md')).toBe(6)
    expect(clsSpan(map[4], 'xl')).toBe(4)
    expect(clsSpan(map[8], 'xl')).toBe(8)
  })
})
