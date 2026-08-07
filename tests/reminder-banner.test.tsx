import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// scheduledAt 一律用确定性的过去时间（避免测试在到期时刻之前运行时横幅不渲染）
const PAST = '2026-08-01T01:30:00.000Z'

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listReminders: vi.fn(async () => [
      { id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: PAST, sentAt: null, dismissedAt: null, createdAt: PAST },
    ]),
    listTasks: vi.fn(async () => [{ id: 't1', title: '交报告', focus: false, priority: 'medium', status: 'todo', dueDate: '2026-08-01', dueTime: '09:30', tags: [], sort: 1, completedAt: null, createdAt: '2026-07-01T00:00:00.000Z' }]),
    listExams: vi.fn(async () => []),
  } as never,
}))

import ReminderBanner from '../src/modules/reminders/reminder-banner'
import { repository } from '@/lib/db'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function renderBanner() {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReminderBanner />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ReminderBanner', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })

  it('有未读到期提醒时显示横幅、提醒文案与数量，点击跳提醒中心', async () => {
    renderBanner()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
    expect(screen.getByText(/到点了，记得处理/)).toBeTruthy()
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/reminders')
  })

  it('无未读提醒时不渲染', async () => {
    vi.mocked(repository.listReminders).mockResolvedValueOnce([
      { id: 'r2', refType: 'task', refId: 't1', kind: 'due', scheduledAt: PAST, sentAt: null, dismissedAt: '2026-08-01T02:00:00.000Z', createdAt: PAST } as never,
    ])
    renderBanner()
    await waitFor(() => expect(repository.listReminders).toHaveBeenCalled())
    expect(screen.queryByText(/交报告/)).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })
})
