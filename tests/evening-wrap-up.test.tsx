import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { todayStr } from '../src/lib/db/types'
import { addDays } from '../src/lib/repeat'

const TODAY = todayStr()
const TASKS = [
  { id: 't1', title: '读论文并回执', focus: false, focusDate: null, priority: 'high', status: 'todo', dueDate: TODAY, dueTime: null, tags: [], sort: 3, completedAt: null, createdAt: '2026-11-01T00:00:00.000Z' },
  { id: 't2', title: '写回执', focus: false, focusDate: null, priority: 'medium', status: 'todo', dueDate: TODAY, dueTime: null, tags: [], sort: 2, completedAt: null, createdAt: '2026-11-01T00:00:00.000Z' },
]

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listTasks: vi.fn(async () => TASKS),
    updateTask: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    deleteTask: vi.fn(async () => undefined),
    listPlanItems: vi.fn(async () => []),
    upsertPlanItem: vi.fn(async () => ({}) as never),
    deletePlanItem: vi.fn(async () => undefined),
  } as never,
}))

import { EveningWrapUp } from '../src/modules/overview/evening-wrap-up'
import { repository } from '@/lib/db'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function renderSheet(onOpenChange = vi.fn()) {
  return render(
    <QueryClientProvider client={qc}>
      <EveningWrapUp open onOpenChange={onOpenChange} tasks={TASKS as never} />
    </QueryClientProvider>,
  )
}
/** 某条任务那一行的某个去向按钮 */
function pick(title: string, label: string) {
  const row = screen.getByText(title).closest('div')!
  return [...row.querySelectorAll('button')].find(b => b.textContent === label)!
}

describe('EveningWrapUp 收尾', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })

  it('默认全部「保持」：确认按钮禁用，不会手滑把今天的活全推走', () => {
    renderSheet()
    expect(screen.getByText('将移动 0 项 · 延期 0 项 · 搁置 0 项 · 保持 2 项')).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认' }).hasAttribute('disabled')).toBe(true)
  })

  it('逐条选去向 → 计数实时更新 → 确认只改动过的那几条', async () => {
    renderSheet()
    fireEvent.click(pick('读论文并回执', '明天'))
    fireEvent.click(pick('写回执', '搁置'))
    expect(screen.getByText(/将移动 1 项 · 延期 0 项 · 搁置 1 项 · 保持 0 项/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledTimes(2))
    expect(repository.updateTask).toHaveBeenCalledWith('t1', { dueDate: addDays(TODAY, 1) })
    expect(repository.updateTask).toHaveBeenCalledWith('t2', { status: 'someday', dueDate: null })
  })

  it('延期 = 清空日期进「待安排」（不动 status，任务仍是待办）', async () => {
    renderSheet()
    fireEvent.click(pick('写回执', '延期'))
    fireEvent.click(screen.getByRole('button', { name: '确认' }))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledWith('t2', { dueDate: null }))
  })

  it('「全部设为明天」是二次操作：点了还要按确认才生效', async () => {
    renderSheet()
    fireEvent.click(screen.getByRole('button', { name: '全部设为明天' }))
    expect(screen.getByText(/将移动 2 项 · 延期 0 项 · 搁置 0 项 · 保持 0 项/)).toBeTruthy()
    expect(repository.updateTask).not.toHaveBeenCalled()
  })

  it('取消不写库', () => {
    const onOpenChange = vi.fn()
    renderSheet(onOpenChange)
    fireEvent.click(pick('读论文并回执', '明天'))
    fireEvent.click(screen.getByRole('button', { name: '取消' }))
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(repository.updateTask).not.toHaveBeenCalled()
  })

  it('没有未完成任务时给出空态，确认按钮保持禁用', () => {
    render(
      <QueryClientProvider client={qc}>
        <EveningWrapUp open onOpenChange={vi.fn()} tasks={[]} />
      </QueryClientProvider>,
    )
    expect(screen.getByText(/今天没有未完成的任务/)).toBeTruthy()
    expect(screen.getByRole('button', { name: '确认' }).hasAttribute('disabled')).toBe(true)
  })
})
