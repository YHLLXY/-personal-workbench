import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listReminders: vi.fn(async () => [
      { id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: '2026-08-08T01:30:00.000Z', sentAt: null, dismissedAt: null, createdAt: '2026-08-08T00:00:00.000Z' },
      { id: 'r2', refType: 'exam', refId: 'e1', kind: 'exam-1d', scheduledAt: '2026-08-08T00:00:00.000Z', sentAt: '2026-08-08T00:05:00.000Z', dismissedAt: null, createdAt: '2026-08-08T00:00:00.000Z' },
    ]),
    dismissReminder: vi.fn(async () => {}),
    restoreReminder: vi.fn(async () => {}),
    listTasks: vi.fn(async () => [{ id: 't1', title: '交报告', focus: false, priority: 'medium', status: 'todo', dueDate: '2026-08-08', dueTime: '09:30', tags: [], sort: 1, completedAt: null, createdAt: '2026-08-01T00:00:00.000Z' }]),
    listExams: vi.fn(async () => [{ id: 'e1', title: '四级', examDate: '2026-08-10', examTime: '09:00', subject: null, note: null, createdAt: '2026-08-01T00:00:00.000Z' }]),
    listStudyGoals: vi.fn(async () => []),
  } as never,
}))

import RemindersCenter from '../src/modules/reminders/reminders-center'
import { repository } from '@/lib/db'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function renderPage() {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RemindersCenter />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('RemindersCenter', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })

  it('渲染提醒列表：到期未发送标记醒目，已发送显示时间', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
    expect(screen.getByText(/到点了/)).toBeTruthy()
    expect(screen.getByText(/四级/)).toBeTruthy()
  })

  it('点击忽略 → 调 dismissReminder', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
    // 精确匹配行内「忽略」按钮（页头另有「全部忽略」，两条未读取第一条；role 的 name 默认全等匹配）
    fireEvent.click(screen.getAllByRole('button', { name: '忽略' })[0])
    await waitFor(() => expect(repository.dismissReminder).toHaveBeenCalledWith('r1'))
  })

  it('全部忽略：确认后批量调 dismissReminder', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderPage()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '全部忽略' }))
    await waitFor(() => expect(repository.dismissReminder).toHaveBeenCalledTimes(2))
  })

  it('已忽略的提醒显示「恢复」操作', async () => {
    vi.mocked(repository.listReminders).mockResolvedValueOnce([
      { id: 'r3', refType: 'task', refId: 't1', kind: 'due', scheduledAt: '2026-08-08T01:30:00.000Z', sentAt: null, dismissedAt: '2026-08-08T02:00:00.000Z', createdAt: '2026-08-08T00:00:00.000Z' } as never,
    ])
    renderPage()
    await waitFor(() => expect(screen.getByRole('button', { name: /恢复/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /恢复/ }))
    await waitFor(() => expect(repository.restoreReminder).toHaveBeenCalledWith('r3'))
  })
})
