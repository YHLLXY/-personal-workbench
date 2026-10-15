import { describe, it, expect } from 'vitest'
import { reportToMarkdown, formatReportDate, isDigestNotEnabled } from '../src/modules/news/digest-view'
import type { DailyReport } from '../src/lib/db/types'

/** 复制功能的纯函数测试（v1.29）：复制出去的 Markdown 要能直接贴进
 *  Obsidian / 飞书 而不散架，所以格式本身值得钉住。 */
const report: DailyReport = {
  id: 'r1',
  reportDate: '2026-10-15',
  title: '算力与降息同日登场',
  overview: '两条主线交汇。',
  itemCount: 2,
  sourceCount: 1,
  model: 'deepseek-flash',
  generatedAt: '2026-10-15T00:00:00.000Z',
  sections: [
    {
      category: '科技',
      items: [
        { eventId: 'e1', title: '国产大模型登顶', point: '多模态基准首次超过闭源模型。', sources: [{ name: 'HN', url: 'https://a.com/1' }] },
        { eventId: 'e2', title: '自研芯片发布', point: '', sources: [] },
      ],
    },
    { category: '空分类', items: [] },
  ],
}

describe('reportToMarkdown（复制按钮导出的内容）', () => {
  it('标题是一级标题，分类是二级标题', () => {
    const md = reportToMarkdown(report)
    expect(md.startsWith('# 算力与降息同日登场\n')).toBe(true)
    expect(md).toContain('## 科技')
  })

  it('事件标题加粗、要点缩进在它下面', () => {
    const md = reportToMarkdown(report)
    expect(md).toContain('- **国产大模型登顶**')
    expect(md).toContain('  多模态基准首次超过闭源模型。')
  })

  it('来源保留成可点的 Markdown 链接', () => {
    expect(reportToMarkdown(report)).toContain('来源：[HN](https://a.com/1)')
  })

  it('没有要点 / 没有来源的事件不会留下空行或空的「来源：」', () => {
    const md = reportToMarkdown(report)
    expect(md).not.toContain('来源：\n')
    expect(md).not.toMatch(/\n{3,}/)
  })

  it('空分类整段跳过，不出现光秃秃的小标题', () => {
    expect(reportToMarkdown(report)).not.toContain('## 空分类')
  })

  it('元信息带上日期、事件数与来源数', () => {
    expect(reportToMarkdown(report)).toContain('> 10月15日 周四 · 2 条事件 · 1 个来源')
  })

  it('末尾署名模型，方便回查是哪一次生成', () => {
    expect(reportToMarkdown(report)).toContain('由 deepseek-flash 生成')
  })

  it('标题为空时兜底成「今日简报」，不会导出成空标题', () => {
    expect(reportToMarkdown({ ...report, title: '' })).toContain('# 今日简报')
  })

  it('完全没有 sections 时也能导出（不抛错，只有标题与署名）', () => {
    const md = reportToMarkdown({ ...report, sections: [], overview: '', itemCount: 0, sourceCount: 0 })
    expect(md).toContain('# 算力与降息同日登场')
    expect(md).toContain('由 deepseek-flash 生成')
  })

  it('没有模型名时署名退回「AI 生成」', () => {
    expect(reportToMarkdown({ ...report, model: null })).toContain('AI 生成')
  })

  it('末尾有且只有一个换行（贴出去不会多出空行）', () => {
    const md = reportToMarkdown(report)
    expect(md.endsWith('\n')).toBe(true)
    expect(md.endsWith('\n\n')).toBe(false)
  })
})

describe('digest-view 既有纯函数（回归）', () => {
  it('formatReportDate 带周几', () => {
    expect(formatReportDate('2026-10-15')).toBe('10月15日 周四')
  })
  it('格式不对时原样返回，不抛错', () => {
    expect(formatReportDate('随便写的')).toBe('随便写的')
  })
  it('只有「表不存在」才算功能未启用', () => {
    expect(isDigestNotEnabled({ code: 'PGRST205' })).toBe(true)
    expect(isDigestNotEnabled({ code: '42P01' })).toBe(true)
    expect(isDigestNotEnabled({ code: 'PGRST205x' })).toBe(false)
    expect(isDigestNotEnabled(new Error('Failed to fetch'))).toBe(false)
  })
})
