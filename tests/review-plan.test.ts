import { describe, it, expect } from 'vitest'
import { parsePlan, buildTrend } from '../src/modules/review/review-utils'
import type { Review } from '../src/lib/db/types'

function r(partial: Partial<Review>): Review { return { id: 'x', reviewDate: '2026-08-01', mood: 3, achievements: '', reflection: '', gratitude: '', learnings: '', summary: '', planTomorrow: '', score: null, updatedAt: '', ...partial } }

describe('parsePlan（明日计划文本 → 待办条目）', () => {
  it('按换行拆分', () => {
    expect(parsePlan('复习数学\n背单词\n跑步 30 分钟')).toEqual(['复习数学', '背单词', '跑步 30 分钟'])
  })
  it('按中文分号、英文分号拆分', () => {
    expect(parsePlan('复习数学；背单词;跑步')).toEqual(['复习数学', '背单词', '跑步'])
  })
  it('按中文逗号拆分', () => {
    expect(parsePlan('复习数学，背单词，跑步')).toEqual(['复习数学', '背单词', '跑步'])
  })
  it('混合分隔符一起拆', () => {
    expect(parsePlan('复习数学，背单词；跑步\n冥想;复盘')).toEqual(['复习数学', '背单词', '跑步', '冥想', '复盘'])
  })
  it('trim 条目首尾空白', () => {
    expect(parsePlan('  复习数学  \n\t背单词\t')).toEqual(['复习数学', '背单词'])
  })
  it('过滤空行与纯空格行', () => {
    expect(parsePlan('复习数学\n\n   \n背单词')).toEqual(['复习数学', '背单词'])
  })
  it('过滤长度≤1 的行', () => {
    expect(parsePlan('复习数学\na\n1\n、\n背单词')).toEqual(['复习数学', '背单词'])
  })
  it('空文本或全无效内容返回空数组', () => {
    expect(parsePlan('')).toEqual([])
    expect(parsePlan('   \n\na\n；；')).toEqual([])
  })
})

describe('buildTrend（最近 14 条复盘趋势，归一到 0-1）', () => {
  it('不足 2 条返回空数组（不渲染）', () => {
    expect(buildTrend([])).toEqual({ moodY: [], scoreY: [], dates: [] })
    expect(buildTrend([r({ reviewDate: '2026-08-01' })])).toEqual({ moodY: [], scoreY: [], dates: [] })
  })
  it('mood 1-5 与 score 1-10 各自归一到 0-1', () => {
    const t = buildTrend([
      r({ reviewDate: '2026-08-01', mood: 1, score: 1 }),
      r({ reviewDate: '2026-08-02', mood: 3, score: 5.5 }),
      r({ reviewDate: '2026-08-03', mood: 5, score: 10 }),
    ])
    expect(t.dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(t.moodY).toEqual([0, 0.5, 1])
    expect(t.scoreY[0]).toBe(0)
    expect(t.scoreY[1]).toBeCloseTo(0.5, 10)
    expect(t.scoreY[2]).toBe(1)
  })
  it('score 留空按中位 5 处理（(5-1)/9）', () => {
    const t = buildTrend([r({ reviewDate: '2026-08-01', score: null }), r({ reviewDate: '2026-08-02', score: null })])
    expect(t.scoreY[0]).toBeCloseTo(4 / 9, 10)
    expect(t.scoreY[1]).toBeCloseTo(4 / 9, 10)
  })
  it('乱序输入按 reviewDate 升序排列', () => {
    const t = buildTrend([r({ reviewDate: '2026-08-03', mood: 5 }), r({ reviewDate: '2026-08-01', mood: 1 }), r({ reviewDate: '2026-08-02', mood: 3 })])
    expect(t.dates).toEqual(['2026-08-01', '2026-08-02', '2026-08-03'])
    expect(t.moodY).toEqual([0, 0.5, 1])
  })
  it('超过 14 条时只取最近 14 条（升序）', () => {
    const many = Array.from({ length: 16 }, (_, i) => r({ reviewDate: `2026-07-${String(i + 10).padStart(2, '0')}`, mood: (i % 5) + 1, score: i + 1 }))
    const t = buildTrend(many)
    expect(t.dates).toHaveLength(14)
    expect(t.dates[0]).toBe('2026-07-12') // 最早的 2 条被丢弃
    expect(t.dates[13]).toBe('2026-07-25')
  })
})
