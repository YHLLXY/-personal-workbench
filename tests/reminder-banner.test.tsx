import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
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
    // 回归：正文用前景色（曾误用 primary-foreground 白字落在浅底上不可读）
    expect(screen.getByText(/到点了，记得处理/)).toHaveClass('text-foreground')
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

// --- 前台系统通知测试（jsdom 无 Notification，stub 一个） ---
class MockNotification {
  static permission: NotificationPermission = 'granted'
  static instances: Array<{ title: string; options: NotificationOptions }> = []
  constructor(title: string, options: NotificationOptions) { MockNotification.instances.push({ title, options }) }
  close() {}
  onclick: (() => void) | null = null
}

describe('ReminderBanner 前台通知去重', () => {
  beforeEach(() => {
    MockNotification.instances = []
    MockNotification.permission = 'granted'
    vi.stubGlobal('Notification', MockNotification)
    qc.clear()
    vi.clearAllMocks()
  })
  afterEach(() => { vi.unstubAllGlobals() })

  it('授权 + 到期未发 → 弹一次；数据刷新（新数组引用，同一提醒仍在）→ 不重复', async () => {
    renderBanner()
    await waitFor(() => expect(MockNotification.instances.length).toBe(1))
    expect(MockNotification.instances[0].title).toBe('个人工作台提醒')
    // 模拟 focus refetch：重新拉取产生新的数组引用（仍含同一到期提醒）→ 不重复弹
    vi.mocked(repository.listReminders).mockResolvedValueOnce([
      { id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: PAST, sentAt: null, dismissedAt: null, createdAt: PAST, note: 'fresh-read' } as never,
    ])
    qc.invalidateQueries()
    await waitFor(() => expect(repository.listReminders).toHaveBeenCalledTimes(2))
    // 等 refetch 数据提交、effect 执行窗口关闭后再断言通知数
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(MockNotification.instances.length).toBe(1)
  })

  it('未授权 → 不弹', async () => {
    MockNotification.permission = 'denied'
    renderBanner()
    await waitFor(() => expect(repository.listReminders).toHaveBeenCalled())
    expect(MockNotification.instances.length).toBe(0)
  })
})
