import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { daysBetween, daysLabel, greeting } from '../src/app/daily-summary'
import { todayStr } from '../src/lib/db/types'

// 注意：fixture 日期必须相对「今天」动态生成——硬编码日期会在日期漂移后失效（2026-08-13 曾因此挂掉）
const TODAY = todayStr()
function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listTasks: vi.fn(async () => [
      { id: 't1', title: '写实验报告', focus: false, focusDate: null, priority: 'medium', status: 'todo', dueDate: TODAY, dueTime: '14:00', tags: [], sort: 1, completedAt: null, createdAt: '2026-08-01T00:00:00.000Z' },
      { id: 't2', title: '复习高数', focus: false, focusDate: null, priority: 'low', status: 'done', dueDate: TODAY, dueTime: null, tags: [], sort: 2, completedAt: `${TODAY}T03:00:00.000Z`, createdAt: '2026-08-01T00:00:00.000Z' },
    ]),
    listExams: vi.fn(async () => [
      { id: 'e1', title: '高数期末', examDate: dateOffset(3), examTime: '09:00', subject: null, note: null, createdAt: '2026-08-01T00:00:00.000Z' },
    ]),
    updateTask: vi.fn(async () => ({}) as never),
  } as never,
}))

import DailySummary from '../src/app/daily-summary'
import { CHANGELOG } from '../src/app/changelog'
import { repository } from '@/lib/db'

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function renderSummary() {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <DailySummary />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('daily-summary 纯函数', () => {
  it('daysBetween 计算整天数差', () => {
    expect(daysBetween('2026-08-11', '2026-08-08')).toBe(3)
    expect(daysBetween('2026-08-08', '2026-08-08')).toBe(0)
    expect(daysBetween('2026-08-09', '2026-08-11')).toBe(-2)
  })
  it('daysLabel 文案', () => {
    expect(daysLabel(0)).toBe('今天')
    expect(daysLabel(1)).toBe('明天')
    expect(daysLabel(3)).toBe('3 天后')
  })
  it('greeting 按时段问候', () => {
    expect(greeting(new Date(2026, 7, 8, 9))).toBe('早上好')
    expect(greeting(new Date(2026, 7, 8, 14))).toBe('下午好')
    expect(greeting(new Date(2026, 7, 8, 20))).toBe('晚上好')
  })
})

describe('DailySummary', () => {
  beforeEach(() => {
    qc.clear()
    vi.clearAllMocks()
    sessionStorage.clear()
  })
  afterEach(() => sessionStorage.clear())

  it('有今日任务和考试时弹出概览：进度、未完成列表、考试倒计时、更新日志', async () => {
    renderSummary()
    await waitFor(() => expect(screen.getByText(/写实验报告/)).toBeTruthy())
    expect(screen.getByText(/已完成 1\/2/)).toBeTruthy()
    expect(screen.getByText(/14:00/)).toBeTruthy()
    expect(screen.getByText(/高数期末/)).toBeTruthy()
    expect(screen.getByText(/3 天后/)).toBeTruthy()
    expect(screen.getByText(new RegExp(esc(CHANGELOG[0].version)))).toBeTruthy()
    expect(screen.getByText(new RegExp(esc(CHANGELOG[0].title)))).toBeTruthy()
  })

  it('勾选未完成任务调用 updateTask 标记完成', async () => {
    renderSummary()
    const row = await screen.findByText('写实验报告')
    const checkbox = row.closest('li')!.querySelector('[role="checkbox"]') as HTMLElement
    checkbox.click()
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledWith('t1', { status: 'done' }))
  })

  it('展开可查看全部版本历史', async () => {
    renderSummary()
    await screen.findByText(/写实验报告/)
    screen.getByText('查看全部历史').click()
    await waitFor(() => expect(screen.getByText(/v1\.0\.0/)).toBeTruthy())
  })

  it('今日无任务且无考试时不弹窗', async () => {
    vi.mocked(repository.listTasks).mockResolvedValueOnce([])
    vi.mocked(repository.listExams).mockResolvedValueOnce([])
    renderSummary()
    await waitFor(() => expect(repository.listTasks).toHaveBeenCalled())
    expect(screen.queryByText(/更新日志/)).toBeNull()
  })

  it('sessionStorage 已标记时不重复弹', async () => {
    sessionStorage.setItem('wb:daily-summary-shown', '1')
    renderSummary()
    await waitFor(() => expect(repository.listTasks).toHaveBeenCalled())
    expect(screen.queryByText(/更新日志/)).toBeNull()
  })
})
