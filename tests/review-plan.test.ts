import { describe, it, expect } from 'vitest'
import { parsePlan, buildTrend, existingTitles, readSectionOpen, saveSectionOpen } from '../src/modules/review/review-utils'
import type { Review, Task } from '../src/lib/db/types'

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
  it('去掉行首列表符号与标题符号（v1.34：从 Markdown 里贴过来不再带 "- " / "1. " / "# "）', () => {
    expect(parsePlan('- 复习数学\n* 背单词\n1. 跑步\n2、冥想\n### 复盘')).toEqual(['复习数学', '背单词', '跑步', '冥想', '复盘'])
  })
  it('数字开头的条目不会被误剥（1.5 小时跑步 保持原样）', () => {
    expect(parsePlan('1.5 小时跑步')).toEqual(['1.5 小时跑步'])
  })
  it('过滤纯标点条目', () => {
    expect(parsePlan('复习数学\n——\n、、\n背单词')).toEqual(['复习数学', '背单词'])
  })
  it('批内重复不在这里去重（交给可编辑预览兜底，见 existingTitles 的另一层去重）', () => {
    expect(parsePlan('背单词\n背单词')).toEqual(['背单词', '背单词'])
  })
})

describe('existingTitles（明日待办去重：只认同一天已存在的任务）', () => {
  const t = (title: string, dueDate: string | null): Task => ({
    id: title + dueDate, title, focus: false, priority: 'medium', status: 'todo', dueDate, dueTime: null,
    focusDate: null, tags: [], sort: 0, completedAt: null, createdAt: '2026-09-01T00:00:00.000Z',
  })
  it('同标题同日期才命中；别的日期不算', () => {
    const set = existingTitles([t('背单词', '2026-09-07'), t('跑步', '2026-09-07'), t('背单词', '2026-09-08')], '2026-09-07')
    expect([...set].sort()).toEqual(['背单词', '跑步'])
  })
  it('标题首尾空白不造成漏判', () => {
    expect(existingTitles([t(' 背单词 ', '2026-09-07')], '2026-09-07').has('背单词')).toBe(true)
  })
})

describe('折叠区开合状态（按日期 + 分区持久化）', () => {
  it('未存过 → null（调用方据此回落到「有内容就展开」）；存过 → 原值', () => {
    localStorage.clear()
    expect(readSectionOpen('2026-09-07', 'plan')).toBeNull()
    saveSectionOpen('2026-09-07', 'plan', true)
    expect(readSectionOpen('2026-09-07', 'plan')).toBe(true)
    saveSectionOpen('2026-09-07', 'plan', false)
    expect(readSectionOpen('2026-09-07', 'plan')).toBe(false)
    // 换日期不串味
    expect(readSectionOpen('2026-09-08', 'plan')).toBeNull()
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
