import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

// scheduledAt 一律用确定性的过去时间（避免测试在到期时刻之前运行时横幅不渲染）
const PAST = '2026-08-01T01:30:00.000Z'
const FUTURE = '2099-01-01T00:00:00.000Z'

const task = (id: string, title: string) => ({
  id, title, focus: false, priority: 'medium', status: 'todo', dueDate: '2026-08-01', dueTime: '09:30',
  tags: [], sort: 1, completedAt: null, createdAt: '2026-07-01T00:00:00.000Z',
})

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listReminders: vi.fn(async () => [
      { id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: PAST, sentAt: null, createdAt: PAST },
    ]),
    listTasks: vi.fn(async () => [task('t1', '交报告')]),
    listExams: vi.fn(async () => []),
    listStudyGoals: vi.fn(async () => []),
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

  it('有到期提醒时显示横幅、提醒文案与数量，点击跳提醒中心', async () => {
    renderBanner()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
    expect(screen.getByText(/到点了，记得处理/)).toBeTruthy()
    // 回归：正文用前景色（曾误用 primary-foreground 白字落在浅底上不可读）
    expect(screen.getByText(/到点了，记得处理/)).toHaveClass('text-foreground')
    expect(screen.getByText('1')).toBeTruthy()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/reminders')
  })

  it('没有到期提醒时不渲染（全部未到期）', async () => {
    vi.mocked(repository.listReminders).mockResolvedValueOnce([
      { id: 'r2', refType: 'task', refId: 't1', kind: 'due', scheduledAt: FUTURE, sentAt: null, createdAt: PAST } as never,
    ])
    renderBanner()
    await waitFor(() => expect(repository.listReminders).toHaveBeenCalled())
    expect(screen.queryByText(/交报告/)).toBeNull()
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('正文取**最早到期**的那条，未到期的不参与（v1.31 回归：旧版取 scheduledAt 倒序第一条 = 最不紧急）', async () => {
    vi.mocked(repository.listTasks).mockResolvedValueOnce([
      task('t1', '拖最久的'), task('t2', '刚过期的'), task('t3', '下周才到'),
    ] as never)
    vi.mocked(repository.listReminders).mockResolvedValueOnce([
      { id: 'rFuture', refType: 'task', refId: 't3', kind: 'due', scheduledAt: FUTURE, sentAt: null, createdAt: PAST },
      { id: 'rLate', refType: 'task', refId: 't2', kind: 'due', scheduledAt: '2026-08-05T01:30:00.000Z', sentAt: null, createdAt: PAST },
      { id: 'rEarly', refType: 'task', refId: 't1', kind: 'due', scheduledAt: PAST, sentAt: null, createdAt: PAST },
    ] as never)
    renderBanner()
    await waitFor(() => expect(screen.getByText(/拖最久的/)).toBeTruthy())
    expect(screen.queryByText(/下周才到/)).toBeNull()
    expect(screen.getByText('2')).toBeTruthy() // 角标只数已到期的两条
  })
})

// --- 前台系统通知测试（jsdom 无 Notification / serviceWorker，按真机语义 stub） ---
// 权限载体：组件只读取 Notification.permission。new Notification 构造器在真机上（Chrome SW 控制下、
// iOS 全系）必抛 Illegal constructor —— v1.23 全站崩溃根因，禁止再回到构造器通道。
class MockNotification {
  static permission: NotificationPermission = 'granted'
}

/** 按真机语义替换 navigator.serviceWorker（ready 可解析为 reg、可 reject、可整体为 undefined） */
function stubServiceWorker(value: unknown) {
  Object.defineProperty(globalThis.navigator, 'serviceWorker', { value, configurable: true })
}

describe('ReminderBanner 前台通知去重', () => {
  const showNotification = vi.fn()
  beforeEach(() => {
    MockNotification.permission = 'granted'
    vi.stubGlobal('Notification', MockNotification)
    stubServiceWorker({ ready: Promise.resolve({ showNotification }) })
    qc.clear()
    vi.clearAllMocks()
  })
  afterEach(() => { vi.unstubAllGlobals(); stubServiceWorker(undefined) })

  it('授权 + 到期未发 → 走 SW 通道弹一次，正文是提醒原文；数据刷新不重复弹', async () => {
    renderBanner()
    await waitFor(() => expect(showNotification).toHaveBeenCalledTimes(1))
    expect(showNotification.mock.calls[0][0]).toBe('个人工作台提醒')
    // v1.31：单条通知直接给正文，不再是一句没有信息量的「N 条提醒待处理」
    expect(String((showNotification.mock.calls[0][1] as { body: string }).body)).toContain('交报告')
    // 模拟 focus refetch：重新拉取产生新的数组引用（仍含同一到期提醒）→ 不重复弹
    vi.mocked(repository.listReminders).mockResolvedValueOnce([
      { id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: PAST, sentAt: null, createdAt: PAST, note: 'fresh-read' } as never,
    ])
    qc.invalidateQueries()
    await waitFor(() => expect(repository.listReminders).toHaveBeenCalledTimes(2))
    await act(async () => { await new Promise(r => setTimeout(r, 0)) })
    expect(showNotification).toHaveBeenCalledTimes(1)
  })

  it('未授权 → 不弹', async () => {
    MockNotification.permission = 'denied'
    renderBanner()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
    expect(showNotification).not.toHaveBeenCalled()
  })
})

describe('ReminderBanner 通知通道防崩回归（v1.23 全站崩溃根因）', () => {
  beforeEach(() => {
    MockNotification.permission = 'granted'
    vi.stubGlobal('Notification', MockNotification)
    qc.clear()
    vi.clearAllMocks()
  })
  afterEach(() => { vi.unstubAllGlobals(); stubServiceWorker(undefined) })

  it('serviceWorker.ready reject（dev 无 SW / 注册失败）→ 组件不崩、横幅正常渲染', async () => {
    // 用 getter 延迟创建 rejected promise：若在此处就构造，reject 会先于组件 effect 里的 .catch 生效，
    // 被 Node 判为 unhandledrejection（噪音，且与被测行为无关）
    stubServiceWorker({ get ready() { return Promise.reject(new Error('no sw')) } })
    renderBanner()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
    expect(screen.getByText('1')).toBeTruthy()
  })

  it('showNotification 抛同步错误 → 不冒泡到 ErrorBoundary', async () => {
    stubServiceWorker({
      ready: Promise.resolve({ showNotification: () => { throw new TypeError('Illegal constructor') } }),
    })
    renderBanner()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
  })

  it('navigator.serviceWorker 不存在（dev 未注册）→ 静默跳过，横幅正常渲染', async () => {
    stubServiceWorker(undefined)
    renderBanner()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
    expect(screen.getByText('1')).toBeTruthy()
  })
})
