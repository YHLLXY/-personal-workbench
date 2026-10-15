import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByText(/每天 07:30 由服务端自动抓取/)).toBeTruthy()
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

  it('来源为空的条目照常渲染，不出现空链接', async () => {
    vi.mocked(repository.listDailyReports).mockResolvedValueOnce([report])
    renderDigest()
    await waitFor(() => expect(screen.getByText('国内大模型调用量进前五')).toBeTruthy())
    expect(screen.queryByText('纽约时报')).not.toBeNull()
    expect(screen.getAllByRole('link').filter(a => a.getAttribute('href') === '')).toHaveLength(0)
  })
})
