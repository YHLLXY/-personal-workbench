import { describe, it, expect } from 'vitest'
import { renderMarkdown } from '../src/modules/news/news-view'
import { buildWeeklySummary } from '../src/modules/review/review-utils'
import type { Note } from '../src/lib/db/types'

describe('renderMarkdown', () => {
  it('标题/粗体/斜体/行内代码', () => {
    expect(renderMarkdown('# 标题')).toContain('<h1>标题</h1>')
    expect(renderMarkdown('## 二级')).toContain('<h2>二级</h2>')
    expect(renderMarkdown('**加粗**和*斜体*以及`代码`')).toContain('<strong>加粗</strong>')
    expect(renderMarkdown('*斜体*')).toContain('<em>斜体</em>')
    expect(renderMarkdown('`x=1`')).toContain('<code>x=1</code>')
  })
  it('列表与分段', () => {
    const html = renderMarkdown('- 甲\n- 乙\n\n段落一\n段落二')
    expect(html).toContain('<ul>')
    expect(html).toContain('<li>甲</li>')
    expect(html).toContain('<p>段落一<br>段落二</p>')
  })
  it('Markdown 链接与裸 https 链接，javascript: 被拒', () => {
    expect(renderMarkdown('[示例](https://a.dev)')).toContain('<a href="https://a.dev"')
    expect(renderMarkdown('看 https://b.dev 就懂')).toContain('<a href="https://b.dev"')
    expect(renderMarkdown('[x](javascript:alert(1))')).not.toContain('<a href="javascript:') // 非法协议不成链接，原样文本
  })
  it('XSS 防线：HTML 先转义，script/事件属性只会以文本呈现', () => {
    const html = renderMarkdown('<script>alert(1)</script>')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
    expect(renderMarkdown('<img src=x onerror=alert(1)>')).not.toContain('<img')
  })
  it('代码块内原样转义、不解析行内语法', () => {
    const html = renderMarkdown('```\n**不是粗体** <b>\n```')
    expect(html).toContain('<pre><code>')
    expect(html).toContain('**不是粗体**')
    expect(html).toContain('&lt;b&gt;')
    expect(html).not.toContain('<strong>')
  })
})

describe('buildWeeklySummary（本周聚合）', () => {
  const T = '2026-08-28' // 周五；窗口 08-22..08-28
  function task(done: boolean, date: string) {
    return { id: 'x', title: 't', focus: false, priority: 'medium', status: done ? 'done' : 'todo', dueDate: date, dueTime: null, focusDate: null, tags: [], sort: 0, completedAt: done ? `${date}T10:00:00.000Z` : null, createdAt: '2026-08-01T00:00:00.000Z' } as never
  }
  it('聚合 7 天窗口内的完成/专注/打卡/复盘，窗口外不计', () => {
    const r = buildWeeklySummary(T, {
      tasks: [task(true, '2026-08-27'), task(true, '2026-08-21'), task(false, '2026-08-28')],
      focusSessions: [{ id: 'f', startAt: '2026-08-26T09:00:00.000Z', minutes: 25, note: null }, { id: 'g', startAt: '2026-08-20T09:00:00.000Z', minutes: 50, note: null }] as never,
      habitLogs: [{ id: 'h1', habitId: 'a', logDate: '2026-08-28', count: 1 }, { id: 'h2', habitId: 'b', logDate: '2026-08-21', count: 1 }] as never,
      reviews: [
        { id: 'r1', reviewDate: '2026-08-27', mood: 4, score: 8, summary: '', planTomorrow: '', achievements: '', reflection: '', gratitude: '', learnings: '', updatedAt: '' },
        { id: 'r2', reviewDate: '2026-08-20', mood: 2, score: 3, summary: '', planTomorrow: '', achievements: '', reflection: '', gratitude: '', learnings: '', updatedAt: '' },
      ] as never,
    })
    expect(r.tasksDone).toBe(1) // 08-27 计入，08-21 在窗口外
    expect(r.focusMinutes).toBe(25)
    expect(r.habitChecks).toBe(1)
    expect(r.reviewsWritten).toBe(1)
    expect(r.avgMood).toBe(4)
    expect(r.avgScore).toBe(8)
  })
  it('score 留空的复盘不拉低评分均值；空数据全部为 0/null', () => {
    const r = buildWeeklySummary(T, {
      tasks: [], focusSessions: [], habitLogs: [],
      reviews: [
        { id: 'r1', reviewDate: '2026-08-28', mood: 3, score: null, summary: '', planTomorrow: '', achievements: '', reflection: '', gratitude: '', learnings: '', updatedAt: '' },
        { id: 'r2', reviewDate: '2026-08-27', mood: 5, score: 7, summary: '', planTomorrow: '', achievements: '', reflection: '', gratitude: '', learnings: '', updatedAt: '' },
      ] as never,
    })
    expect(r.avgMood).toBe(4)
    expect(r.avgScore).toBe(7)
    expect(buildWeeklySummary(T, { tasks: [], focusSessions: [], habitLogs: [], reviews: [] })).toEqual({ tasksDone: 0, focusMinutes: 0, habitChecks: 0, reviewsWritten: 0, avgMood: null, avgScore: null })
  })
})

// Note 类型仅用于类型导入检查（filterNotes 已在 news-view 单独测过）
describe('类型冒烟', () => { it('Note 导入可用', () => { const n: Note | null = null; expect(n).toBeNull() }) })
