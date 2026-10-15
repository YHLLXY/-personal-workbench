import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { formatReportDate, isDigestNotEnabled } from '../src/modules/news/digest-view'
import type { DailyReport } from '../src/lib/db/types'

const report: DailyReport = {
  id: 'd1', reportDate: '2026-10-15', title: 'AI 芯片产能翻番，国内大模型调用量进前五',
  overview: '今天的主线是算力与模型的双向加速。',
  sections: [{
    category: '科技',
    items: [
      { eventId: 'e1', title: 'AI 芯片每 9 个月翻番', point: 'Epoch AI 估算 2028 年底达 2 亿颗。', sources: [{ name: '纽约时报', url: 'https://a.com/1' }, { name: 'telegram', url: 'https://a.com/2' }] },
      { eventId: 'e2', title: '国内大模型调用量进前五', point: 'OpenRouter 榜单前五均为中国模型。', sources: [] },
    ],
  }],
  itemCount: 7, sourceCount: 12, model: 'deepseek-flash', generatedAt: '2026-10-15T00:00:00.000Z',
}

vi.mock('../src/lib/db', () => ({
  isCloudMode: true,
  repository: { listDailyReports: vi.fn(async () => []) },
}))
// 首页卡（只要 1 条）与日报页（要 30 条）共用同一个 repository 方法——
// 缓存键必须把 limit 算进去，否则先挂载的那个决定数据（v1.28.1 修的那个 bug）
vi.mock('../src/lib/db/supabase-client', () => ({ getSupabaseClient: vi.fn() }))

const { repository } = await import('../src/lib/db')
const { DailyDigest } = await import('../src/modules/news/daily-digest')

function renderDigest() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}><DailyDigest /></QueryClientProvider>)
}

describe('formatReportDate', () => {
  it('格式化为「M月D日 周X」', () => {
    expect(formatReportDate('2026-10-15')).toMatch(/^10月15日 周[日一二三四五六]$/)
  })
  it('格式不对时原样返回而不是抛错', () => {
    expect(formatReportDate('')).toBe('')
    expect(formatReportDate('不是日期')).toBe('不是日期')
  })
})

describe('isDigestNotEnabled（区分「功能未启用」与「网络抖动」）', () => {
  it('认得 PostgREST 与 Postgres 两种「表不存在」', () => {
    expect(isDigestNotEnabled({ code: 'PGRST205' })).toBe(true)
    expect(isDigestNotEnabled({ code: '42P01' })).toBe(true)
    expect(isDigestNotEnabled({ message: "Could not find the table 'public.wb_daily_reports' in the schema cache" })).toBe(true)
  })
  it('网络错误 / 空错误不误判成「去跑迁移」', () => {
    expect(isDigestNotEnabled(new Error('Failed to fetch'))).toBe(false)
    expect(isDigestNotEnabled(new Error('JWT expired'))).toBe(false)
    expect(isDigestNotEnabled(null)).toBe(false)
    expect(isDigestNotEnabled(undefined)).toBe(false)
  })
  it('提到别的表不存在时也不算', () => {
    expect(isDigestNotEnabled({ code: '42P01', message: 'relation "public.wb_tasks" does not exist' })).toBe(true) // 有 code 时按 code 认
    expect(isDigestNotEnabled({ message: 'relation "public.wb_tasks" does not exist' })).toBe(false)
  })
})

describe('DailyDigest（v1.27）', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('渲染标题 / 总述 / 分组 / 条目要点 / 来源链接', async () => {
    vi.mocked(repository.listDailyReports).mockResolvedValueOnce([report])
    renderDigest()
    await waitFor(() => expect(screen.getByText(report.title)).toBeTruthy())
    expect(screen.getByText(report.overview)).toBeTruthy()
    expect(screen.getByText('科技')).toBeTruthy()
    expect(screen.getByText('AI 芯片每 9 个月翻番')).toBeTruthy()
    expect(screen.getByText('Epoch AI 估算 2028 年底达 2 亿颗。')).toBeTruthy()
    // 来源做成链接：这正是事件聚簇的价值——「这件事有 N 家媒体在说」
    expect(screen.getByText('纽约时报').closest('a')?.getAttribute('href')).toBe('https://a.com/1')
    expect(screen.getByText(/7 条事件 · 12 个来源/)).toBeTruthy()
  })

  it('没有日报时给出空态，并提示云端模式', async () => {
    renderDigest()
    await waitFor(() => expect(screen.getByText('还没有日报')).toBeTruthy())
    expect(screen.getByText(/每天 06:00 由服务端自动抓取/)).toBeTruthy()
  })

  it('表不存在（迁移 015 未执行）时，说的是「功能还没启用」而不是「每天会自动生成」', async () => {
    vi.mocked(repository.listDailyReports).mockRejectedValueOnce(
      Object.assign(new Error("Could not find the table 'public.wb_daily_reports' in the schema cache"), { code: 'PGRST205' }),
    )
    renderDigest()
    await waitFor(() => expect(screen.getByText('日报功能还没启用')).toBeTruthy())
    expect(screen.getByText(/先在 Supabase 执行迁移 015/)).toBeTruthy()
    expect(screen.queryByText('还没有日报')).toBeNull()
  })

  it('网络错误不误判成「没有日报」：走普通空态而不是让用户去跑迁移', async () => {
    vi.mocked(repository.listDailyReports).mockRejectedValueOnce(new Error('Failed to fetch'))
    renderDigest()
    await waitFor(() => expect(screen.getByText('还没有日报')).toBeTruthy())
    expect(screen.queryByText('日报功能还没启用')).toBeNull()
  })

  it('不同 limit 不共用缓存：首页卡先取过 1 条，日报页仍会取满 30 条', async () => {
    const { useDailyReports } = await import('../src/modules/news/api')
    function HomeCardProbe() { useDailyReports(1); return null }
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const first = render(<QueryClientProvider client={qc}><HomeCardProbe /></QueryClientProvider>)
    await waitFor(() => expect(repository.listDailyReports).toHaveBeenCalledWith(1))
    first.unmount()

    // 同一个 QueryClient（模拟从首页点进「今日热点」）——若不重新请求，说明缓存键撞了
    vi.mocked(repository.listDailyReports).mockResolvedValue([report] as never)
    render(<QueryClientProvider client={qc}><DailyDigest /></QueryClientProvider>)
    await waitFor(() => expect(repository.listDailyReports).toHaveBeenCalledWith(30))
    await waitFor(() => expect(screen.getByText(report.title)).toBeTruthy())
  })

  it('来源为空的条目照常渲染，不出现空链接', async () => {
    vi.mocked(repository.listDailyReports).mockResolvedValueOnce([report])
    renderDigest()
    await waitFor(() => expect(screen.getByText('国内大模型调用量进前五')).toBeTruthy())
    expect(screen.queryByText('纽约时报')).not.toBeNull()
    expect(screen.getAllByRole('link').filter(a => a.getAttribute('href') === '')).toHaveLength(0)
  })

  it('「复制」把日报导出成 Markdown 写进剪贴板（v1.29）', async () => {
    // 导出格式由纯函数 reportToMarkdown 决定，这里只验「按钮 → 剪贴板」这一段接线。
    const writeText = vi.fn(async (_text: string) => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    vi.mocked(repository.listDailyReports).mockResolvedValueOnce([report])
    renderDigest()
    await waitFor(() => expect(screen.getByText(report.title)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '复制日报为 Markdown' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    const md = writeText.mock.calls[0][0]
    expect(md).toContain('# ' + report.title)
    expect(md).toContain('- **AI 芯片每 9 个月翻番**')
    expect(md).toContain('[纽约时报](https://a.com/1)')
  })

})
