import { describe, it, expect } from 'vitest'
import { buildHeatCells, streakFromLogDates } from '../src/lib/heatmap'

function daysAgo(n: number): string {
  const d = new Date(); d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

describe('heatmap', () => {
  it('生成 days 个格子，今天在最后', () => {
    const cells = buildHeatCells([], 14)
    expect(cells).toHaveLength(14)
    expect(cells[13]).toEqual({ level: 0 })
  })
  it('当天多次打卡封顶 3', () => {
    const today = daysAgo(0)
    const cells = buildHeatCells([today, today, today, today], 1)
    expect(cells[0].level).toBe(3)
  })
  it('连续打卡统计', () => {
    expect(streakFromLogDates([daysAgo(0), daysAgo(1), daysAgo(2)])).toBe(3)
    expect(streakFromLogDates([daysAgo(0), daysAgo(2)])).toBe(1)
  })
})
