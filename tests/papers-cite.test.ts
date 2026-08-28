import { describe, it, expect } from 'vitest'
import { formatCitation, toBibTeX } from '../src/modules/news/cite'
import type { Paper } from '../src/lib/db/types'

function p(partial: Partial<Paper>): Paper { return { id: 'x', title: 't', authors: '', arxivId: null, url: null, status: 'done', rating: null, note: null, createdAt: '', ...partial } }

describe('formatCitation', () => {
  it('完整字段输出：作者 (年份). 标题. 来源. 链接', () => {
    const paper = p({ title: '论文标题', authors: '张三, 李四', source: 'Nature', url: 'https://example.com/a', createdAt: '2024-05-01T10:00:00.000Z' })
    expect(formatCitation(paper)).toBe('张三, 李四 (2024). 论文标题. Nature. https://example.com/a')
  })
  it('无年份：省略 (yyyy) 段，其余保留', () => {
    expect(formatCitation(p({ title: 'T', authors: 'A', createdAt: '' }))).toBe('A. T')
  })
  it('无作者：以 (年份). 标题 开头', () => {
    expect(formatCitation(p({ title: 'T', url: 'https://x', createdAt: '2023-01-01' }))).toBe('(2023). T. https://x')
  })
  it('无 url / 无来源：尾段省略', () => {
    expect(formatCitation(p({ title: 'T', authors: 'A', createdAt: '2023-01-01' }))).toBe('A (2023). T')
  })
  it('字段全部缺失不崩：仅剩标题', () => {
    expect(formatCitation(p({ title: 'T' }))).toBe('T')
  })
  it('极端缺字段（undefined）也不崩，返回空串', () => {
    const bare = { id: 'x', title: undefined, authors: undefined, arxivId: null, url: undefined, status: 'done', rating: null, note: null, createdAt: undefined } as unknown as Paper
    expect(formatCitation(bare)).toBe('')
  })
})

describe('toBibTeX', () => {
  it('完整字段输出：title/author/year/url 各行 + 行尾逗号', () => {
    const paper = p({ title: '论文标题', authors: '张三, 李四', source: 'Nature', url: 'https://example.com/a', createdAt: '2024-05-01T10:00:00.000Z' })
    expect(toBibTeX(paper)).toBe('@misc{zhang2024论文标题,\n  title = {论文标题},\n  author = {张三, 李四},\n  year = {2024},\n  url = {https://example.com/a},\n}')
  })
  it('key：中文姓氏转拼音 + 年份 + 标题首词（无空格）', () => {
    expect(toBibTeX(p({ title: '深度学习导论', authors: '张三, 李四', createdAt: '2024-01-01' }))).toMatch(/^@misc\{zhang2024深度学习导论,/)
  })
  it('key：西文作者取末词为姓，标题首词去标点并小写', () => {
    expect(toBibTeX(p({ title: 'Attention Is All You Need', authors: 'Ashish Vaswani', createdAt: '2017-06-12T00:00:00.000Z' }))).toMatch(/^@misc\{vaswani2017attention,/)
  })
  it('key：未收录姓氏原样保留', () => {
    expect(toBibTeX(p({ title: '研究', authors: '欧阳锋', createdAt: '2020-01-01' }))).toMatch(/^@misc\{欧2020研究,/)
  })
  it('字段缺失的行整行省略（无 url/year）', () => {
    expect(toBibTeX(p({ title: '标题', authors: '王五', createdAt: 'not-a-date' }))).toBe('@misc{wang标题,\n  title = {标题},\n  author = {王五},\n}')
  })
  it('仅剩 title 时输出 title 一行，key 取标题首词', () => {
    expect(toBibTeX(p({ title: 'T Only' }))).toBe('@misc{t,\n  title = {T Only},\n}')
  })
  it('完全无字段不崩，key 兜底为 item', () => {
    const bare = { id: 'x', title: undefined, authors: undefined, arxivId: null, url: undefined, status: 'done', rating: null, note: null, createdAt: undefined } as unknown as Paper
    expect(toBibTeX(bare)).toBe('@misc{item,\n}')
  })
})
