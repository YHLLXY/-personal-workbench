import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/db', () => ({
  isCloudMode: true,
  repository: {
    listPushSubscriptions: vi.fn(async () => []),
    savePushSubscription: vi.fn(async () => {}),
    removePushSubscription: vi.fn(async () => {}),
    getChannelConfigs: vi.fn(async () => ({ serverchanKey: null, telegramBotToken: null, telegramChatId: null })),
    saveChannelConfigs: vi.fn(async () => {}),
  } as never,
}))
vi.mock('@/lib/db/supabase-client', () => ({
  getSupabaseClient: () => ({ auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'jwt-1' } } })) } }),
}))
vi.mock('@/app/auth', () => ({ useAuth: () => ({ user: { email: 'a@b.c' } }) }))

import { NotificationSection } from '../src/modules/me/notifications-section'
import { repository } from '@/lib/db'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
describe('NotificationSection', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })

  it('渲染标题与 Web Push 订阅按钮', async () => {
    render(
      <QueryClientProvider client={qc}>
        <NotificationSection />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('通知设置')).toBeTruthy())
    expect(screen.getByRole('button', { name: /订阅推送/ })).toBeTruthy()
  })

  it('点击订阅 → pushManager.subscribe → savePushSubscription', async () => {
    // 真实 PushSubscription：getKey() 返回 ArrayBuffer，组件用 btoa 转 base64 存储
    // p256dh=[1,2,3,4] → 'AQIDBA=='；auth=[9,8,7] → 'CQgH'
    const p256dh = new Uint8Array([1, 2, 3, 4]).buffer
    const auth = new Uint8Array([9, 8, 7]).buffer
    const sub = {
      endpoint: 'https://push.example/1',
      getKey: vi.fn((name: 'p256dh' | 'auth') => name === 'p256dh' ? p256dh : auth),
      unsubscribe: vi.fn(),
    }
    const subscribe = vi.fn(async () => sub)
    const getSubscription = vi.fn(async () => null)
    // 测试注入：jsdom 无 serviceWorker，defineProperty 挂桩
    Object.defineProperty(globalThis.navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager: { subscribe, getSubscription } }) }, configurable: true })
    render(
      <QueryClientProvider client={qc}>
        <NotificationSection />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /订阅推送/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /订阅推送/ }))
    await waitFor(() => expect(subscribe).toHaveBeenCalled())
    await waitFor(() => expect(repository.savePushSubscription).toHaveBeenCalledWith(expect.objectContaining({ endpoint: 'https://push.example/1', keysP256dh: 'AQIDBA==', keysAuth: 'CQgH' })))
  })

  it('Server酱：输入 SendKey 保存 → saveChannelConfigs（三字段一起写，避免清掉 Telegram）', async () => {
    render(
      <QueryClientProvider client={qc}>
        <NotificationSection />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByLabelText(/Server酱 SendKey/)).toBeTruthy())
    fireEvent.change(screen.getByLabelText(/Server酱 SendKey/), { target: { value: 'SCU123' } })
    // 精确匹配「保存」——加 Telegram 后 /保存/ 会同时命中「保存并测试」（v1.26）
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(repository.saveChannelConfigs).toHaveBeenCalledWith({ serverchanKey: 'SCU123', telegramBotToken: null, telegramChatId: null }))
  })

  it('Telegram：校验通过才落库（v1.26）', async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: true, botUsername: 'my_bot' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(
      <QueryClientProvider client={qc}>
        <NotificationSection />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByLabelText('Telegram Bot Token')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Telegram Bot Token'), { target: { value: '123:ABC' } })
    fireEvent.change(screen.getByLabelText('Telegram Chat ID'), { target: { value: '456' } })
    fireEvent.click(screen.getByRole('button', { name: /保存并测试/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/telegram-test', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(repository.saveChannelConfigs).toHaveBeenCalledWith({ serverchanKey: null, telegramBotToken: '123:ABC', telegramChatId: '456' }))
    vi.unstubAllGlobals()
  })

  it('Telegram：Token 校验失败时不写库（配置错误不落库）', async () => {
    const fetchMock = vi.fn(async () => ({ json: async () => ({ ok: false, step: 'token', error: 'Unauthorized' }) }))
    vi.stubGlobal('fetch', fetchMock)
    render(
      <QueryClientProvider client={qc}>
        <NotificationSection />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByLabelText('Telegram Bot Token')).toBeTruthy())
    fireEvent.change(screen.getByLabelText('Telegram Bot Token'), { target: { value: 'bad' } })
    fireEvent.change(screen.getByLabelText('Telegram Chat ID'), { target: { value: '456' } })
    fireEvent.click(screen.getByRole('button', { name: /保存并测试/ }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalled())
    expect(repository.saveChannelConfigs).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})

describe('NotificationSection 退订', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })

  it('已订阅时点击「关闭推送」→ removePushSubscription + unsubscribe', async () => {
    const unsubscribeFn = vi.fn(async () => {})
    const sub = { endpoint: 'https://push.example/1', keys: { p256dh: 'p', auth: 'a' }, unsubscribe: unsubscribeFn }
    vi.mocked(repository.listPushSubscriptions).mockResolvedValueOnce([{ id: 's1', endpoint: 'https://push.example/1', keysP256dh: 'p', keysAuth: 'a', userAgent: 't', createdAt: '2026-08-01T00:00:00.000Z' }] as never)
    const getSubscription = vi.fn(async () => sub)
    Object.defineProperty(globalThis.navigator, 'serviceWorker', { value: { ready: Promise.resolve({ pushManager: { subscribe: vi.fn(), getSubscription } }) }, configurable: true })
    render(
      <QueryClientProvider client={qc}>
        <NotificationSection />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByRole('button', { name: /关闭推送/ })).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /关闭推送/ }))
    await waitFor(() => expect(repository.removePushSubscription).toHaveBeenCalledWith('https://push.example/1'))
    expect(unsubscribeFn).toHaveBeenCalled()
  })
})
