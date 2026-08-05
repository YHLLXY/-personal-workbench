import { describe, it, expect } from 'vitest'
import { parseImportText, parseImportMarkdown } from '../src/lib/parse-import'

describe('parseImportText', () => {
  it('解析标准 JSON 导出（提取器格式）', () => {
    const json = JSON.stringify({
      version: 1, type: 'note', title: 'AI 科普', source_url: 'https://example.com/v',
      platform: 'douyin',
      summary: { title: 'AI 科普', key_points: ['点一'], quotes: ['金句'], structure: ['开篇'] },
      keywords: ['AI', '科普'], content: '大家好，今天聊聊。', segments: [],
    })
    const r = parseImportText(json)
    expect(r.title).toBe('AI 科普')
    expect(r.sourceUrl).toBe('https://example.com/v')
    expect(r.platform).toBe('douyin')
    expect(r.content).toBe('大家好，今天聊聊。')
    expect(r.keywords).toEqual(['AI', '科普'])
    expect(r.summaryJson).toContain('key_points')
  })

  it('非 JSON 文本按纯文本处理', () => {
    const r = parseImportText('大家好，这是一段文案。')
    expect(r.title).toBe('')
    expect(r.content).toBe('大家好，这是一段文案。')
    expect(r.summaryJson).toBeNull()
  })

  it('解析失败（JSON 语法错误）不抛异常，降级为纯文本', () => {
    const r = parseImportText('{"title": 坏掉的 json')
    expect(r.content.length).toBeGreaterThan(0)
    expect(r.summaryJson).toBeNull()
  })
})

describe('parseImportMarkdown', () => {
  it('解析带 frontmatter 的笔记（title/source/tags + 正文）', () => {
    const md = '---\ntitle: "视频笔记"\nsource: "https://example.com"\ntags:\n  - 视频文案\n---\n\n# 视频笔记\n\n大家好，今天聊聊。'
    const r = parseImportMarkdown(md)
    expect(r.title).toBe('视频笔记')
    expect(r.sourceUrl).toBe('https://example.com')
    expect(r.content).toContain('大家好，今天聊聊。')
  })

  it('无 frontmatter 时正文全量作为 content', () => {
    const r = parseImportMarkdown('纯正文，没有头。')
    expect(r.title).toBe('')
    expect(r.content).toBe('纯正文，没有头。')
  })
})
