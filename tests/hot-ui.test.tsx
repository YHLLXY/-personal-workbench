import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Hot from '../src/modules/news/hot'
import type { Subscriptions } from '../src/lib/db/types'

vi.mock('../src/lib/hot', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/lib/hot')>()
  return {
    ...actual,
    loadHot: vi.fn(async () => ({
      items: [
        { title: 'LLM 新论文', source: 'arxiv-ai', url: 'https://x', category: 'academic' },
        { title: '考研经验分享', source: 'v2ex', url: 'https://y', category: 'tech' },
      ],
      sources: [
        { id: 'arxiv-ai', name: 'arXiv cs.AI', category: 'academic' },
        { id: 'v2ex', name: 'V2EX 热门', category: 'tech' },
      ],
      fromCache: false, fetchedAt: new Date(2026, 7, 5, 9, 30).toISOString(), stale: false,
    })),
  }
})

vi.mock('../src/lib/db', () => ({
  repository: {
    getSubscriptions: vi.fn(async (): Promise<Subscriptions> => ({ sourceIds: [], topics: ['考研'] })),
    saveSubscriptions: vi.fn(async () => {}),
  },
  isCloudMode: false,
}))

const { repository } = await import('../src/lib/db')
const { loadHot } = await import('../src/lib/hot')
const mockedLoadHot = vi.mocked(loadHot)

describe('Hot 页面', () => {
  beforeEach(() => { vi.clearAllMocks(); mockedLoadHot.mockClear() })

  it('渲染列表、来源名与分类标签', async () => {
    render(<Hot />)
    await waitFor(() => expect(screen.getByText('LLM 新论文')).toBeTruthy())
    expect(screen.getByText('arXiv cs.AI')).toBeTruthy()
    expect(screen.getByText('学术')).toBeTruthy()
  })

  it('显示「更新于」时间', async () => {
    render(<Hot />)
    await waitFor(() => expect(screen.getByText(/更新于 09:30/)).toBeTruthy())
  })

  it('主题 tab：点「考研」只显示匹配条目', async () => {
    render(<Hot />)
    await waitFor(() => expect(screen.getByText('考研经验分享')).toBeTruthy())
    fireEvent.click(screen.getByText('考研'))
    expect(screen.queryByText('LLM 新论文')).toBeNull()
    expect(screen.getByText('考研经验分享')).toBeTruthy()
  })

  it('管理源对话框：打开回填订阅、添加主题 chip、保存调用 saveSubscriptions', async () => {
    render(<Hot />)
    await waitFor(() => expect(screen.getByText('管理源')).toBeTruthy())
    fireEvent.click(screen.getByText('管理源'))
    await waitFor(() => expect(screen.getAllByText('arXiv cs.AI').length).toBeGreaterThan(1)) // 主列表 + 对话框内的源名
    const input = screen.getByPlaceholderText('添加主题关键词，回车确认')
    fireEvent.change(input, { target: { value: 'LLM' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(screen.getByText('LLM')).toBeTruthy())
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(vi.mocked(repository.saveSubscriptions)).toHaveBeenCalled())
  })
})
