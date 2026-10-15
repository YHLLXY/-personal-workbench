import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
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
    // v1.27：日报 Tab 默认打开，会读这张表
    listDailyReports: vi.fn(async () => []),
  },
  isCloudMode: false,
}))

const { repository } = await import('../src/lib/db')
const { loadHot } = await import('../src/lib/hot')
const mockedLoadHot = vi.mocked(loadHot)

describe('Hot 页面', () => {
  beforeEach(() => {
    vi.clearAllMocks(); mockedLoadHot.mockClear()
    // clearAllMocks 会清掉 mockResolvedValueOnce 之外的所有实现，这里恢复默认「没有日报」
    vi.mocked(repository.listDailyReports).mockResolvedValue([] as never)
  })

  // hot 页接入了「存速记」mutation（useNoteMutations），需要 QueryClient 上下文
  function renderHot() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    return render(<QueryClientProvider client={qc}><Hot /></QueryClientProvider>)
  }

  /** v1.27.1：默认 Tab 要等日报查询落地才定，所以先等 Tab 出现再切 */
  async function goList() {
    await waitFor(() => expect(screen.getByRole('tab', { name: '热榜' })).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: '热榜' }))
  }

  it('没有日报时默认落在「热榜」Tab，而不是打开一个空页面（v1.27.1）', async () => {
    renderHot()
    await waitFor(() => expect(screen.getByRole('tab', { name: '热榜' }).getAttribute('aria-selected')).toBe('true'))
    expect(screen.getByRole('tab', { name: '日报' }).getAttribute('aria-selected')).toBe('false')
  })

  it('有日报时默认落在「日报」Tab', async () => {
    vi.mocked(repository.listDailyReports).mockResolvedValueOnce([{
      id: 'd1', reportDate: '2026-10-15', title: '今日简报标题', overview: '总述',
      sections: [], itemCount: 1, sourceCount: 1, model: 'x', generatedAt: '2026-10-15T00:00:00.000Z',
    }] as never)
    renderHot()
    await waitFor(() => expect(screen.getByRole('tab', { name: '日报' }).getAttribute('aria-selected')).toBe('true'))
    expect(screen.getByText('今日简报标题')).toBeTruthy()
  })

  it('点「日报」Tab 能看到空态（没有日报时不藏起来，而是说清原因）', async () => {
    renderHot()
    await waitFor(() => expect(screen.getByRole('tab', { name: '日报' })).toBeTruthy())
    fireEvent.click(screen.getByRole('tab', { name: '日报' }))
    await waitFor(() => expect(screen.getByText('还没有日报')).toBeTruthy())
  })

  it('渲染列表、来源名与分类标签', async () => {
    renderHot(); await goList()
    await waitFor(() => expect(screen.getByText('LLM 新论文')).toBeTruthy())
    expect(screen.getByText('arXiv cs.AI')).toBeTruthy()
    expect(screen.getByText('学术')).toBeTruthy()
  })

  it('显示「更新于」时间', async () => {
    renderHot(); await goList()
    await waitFor(() => expect(screen.getByText(/更新于 09:30/)).toBeTruthy())
  })

  it('主题 tab：点「考研」只显示匹配条目', async () => {
    renderHot(); await goList()
    await waitFor(() => expect(screen.getByText('考研经验分享')).toBeTruthy())
    fireEvent.click(screen.getByText('考研'))
    expect(screen.queryByText('LLM 新论文')).toBeNull()
    expect(screen.getByText('考研经验分享')).toBeTruthy()
  })

  it('管理源对话框：打开回填订阅、添加主题 chip、保存调用 saveSubscriptions', async () => {
    renderHot(); await goList()
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
