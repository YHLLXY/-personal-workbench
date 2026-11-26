import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { todayStr } from '../src/lib/db/types'
import { addDays } from '../src/lib/repeat'

/**
 * 三段视图（v1.35 / 委托书 4.1-4.2）的接线测试：
 *  - 「明天」段必须看得到刚改到明天的任务（v1.34 改期后当场消失，核对成本 = ∞）
 *  - 「以后」段必须收得住「待安排」（dueDate=null 的待办此前任何视图都不可见，D-18）
 *  - /tasks?day=tomorrow 深链落到明天段（复盘「去待办查看」用）
 */
const T = todayStr()
const TOMORROW = addDays(T, 1)
const FAR = addDays(T, 10)
const base = { focus: false, focusDate: null, priority: 'medium', dueTime: null, tags: [], sort: 1, createdAt: '2026-11-01T00:00:00.000Z' }
const TASKS = [
  { ...base, id: 't1', title: '今天写的报告', status: 'todo', dueDate: T, completedAt: null, sort: 5 },
  { ...base, id: 't2', title: '明天的演讲', status: 'todo', dueDate: TOMORROW, completedAt: null, sort: 4 },
  { ...base, id: 't3', title: '十天后的复盘', status: 'todo', dueDate: FAR, completedAt: null, sort: 3 },
  { ...base, id: 't4', title: '没定日期的事', status: 'todo', dueDate: null, completedAt: null, sort: 2 },
  { ...base, id: 't5', title: '搁置的念头', status: 'someday', dueDate: null, completedAt: null, sort: 1 },
  { ...base, id: 't6', title: '已经做完的', status: 'done', dueDate: T, completedAt: T + 'T09:00:00.000Z', sort: 6 },
]

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listTasks: vi.fn(async () => TASKS),
    updateTask: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    deleteTask: vi.fn(async () => undefined),
    restoreTask: vi.fn(async (t: unknown) => t),
    listPlanItems: vi.fn(async () => []),
    upsertPlanItem: vi.fn(async () => ({}) as never),
    deletePlanItem: vi.fn(async () => undefined),
  } as never,
}))

import TodayTasks from '../src/modules/overview/today-tasks'
import { ConfirmProvider } from '../src/components/confirm-dialog'
import { repository } from '@/lib/db'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function renderPage(path = '/tasks') {
  return render(
    <QueryClientProvider client={qc}>
      <ConfirmProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes><Route path="/tasks" element={<TodayTasks />} /></Routes>
        </MemoryRouter>
      </ConfirmProvider>
    </QueryClientProvider>,
  )
}
const tab = (name: RegExp) => screen.getByRole('tab', { name })

describe('每日计划三段视图', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })

  it('首屏是今天段：计划/完成/剩余 三个数字', async () => {
    renderPage()
    await screen.findByText('今天写的报告')
    expect(screen.getByText(/今天 2 · 完成/)).toBeTruthy()
    // 完成区里那条已完成任务
    expect(screen.getByText('已经做完的')).toBeTruthy()
    expect(tab(/今天 2/).getAttribute('aria-selected')).toBe('true')
  })

  it('切到「明天」段：看到明天到期的任务，而不是"改完就消失"', async () => {
    renderPage()
    await screen.findByText('今天写的报告')
    fireEvent.click(tab(/明天 1/))
    expect(await screen.findByText('明天的演讲')).toBeTruthy()
    expect(screen.queryByText('今天写的报告')).toBeNull()
  })

  it('「以后」段收得住待安排与将来（修 D-18：dueDate=null 的待办不再隐形）', async () => {
    renderPage()
    await screen.findByText('今天写的报告')
    fireEvent.click(tab(/以后 3/))
    expect(await screen.findByText('没定日期的事')).toBeTruthy()
    expect(screen.getByText('搁置的念头')).toBeTruthy()
    expect(screen.getByText('十天后的复盘')).toBeTruthy()
    expect(screen.getByText(/没有日期的待办/)).toBeTruthy()
  })

  it('/tasks?day=tomorrow 深链直接落到明天段（复盘「去待办查看」）', async () => {
    renderPage('/tasks?day=tomorrow')
    expect(await screen.findByText('明天的演讲')).toBeTruthy()
    expect(tab(/明天/).getAttribute('aria-selected')).toBe('true')
  })

  it('从明天段「移回今天」= 操作面板里改期到今天，并给出回执', async () => {
    renderPage('/tasks?day=tomorrow')
    await screen.findByText('明天的演讲')
    // 卡片上只有一个操作入口（⋯）→ 底部面板 → 改期「今天」
    fireEvent.click(screen.getByLabelText('更多操作'))
    fireEvent.click(await screen.findByRole('button', { name: '今天' }))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledWith('t2', { dueDate: T }))
  })

  it('卡片上只剩 3 个可点区：勾选框 / 标题 / ⋯（任务卡 v2）', async () => {
    renderPage()
    await screen.findByText('今天写的报告')
    const card = screen.getByText('今天写的报告').closest('[data-flip-id]') as HTMLElement
    const buttons = [...card.querySelectorAll('button')]
    // 勾选 + 标题 + ⋯（今天段多一个拖拽把手，其余一律收进面板）
    expect(buttons.length).toBeLessThanOrEqual(4)
    expect(buttons.filter(b => b.getAttribute('aria-label') === '完成')).toHaveLength(1)
    expect(buttons.filter(b => b.getAttribute('aria-label') === '更多操作')).toHaveLength(1)
  })

  it('删除走二次确认（不再一点就没）', async () => {
    renderPage()
    await screen.findByText('今天写的报告')
    const card = screen.getByText('今天写的报告').closest('[data-flip-id]') as HTMLElement
    fireEvent.click(card.querySelector('[aria-label="更多操作"]') as HTMLElement)
    fireEvent.click(await screen.findByRole('button', { name: /删除这条任务/ }))
    // 确认弹窗出现，且此时还没有真的删
    expect(await screen.findByText('删除「今天写的报告」？')).toBeTruthy()
    expect(repository.deleteTask).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: '删除' }))
    await waitFor(() => expect(repository.deleteTask).toHaveBeenCalledWith('t1'))
  })
})
