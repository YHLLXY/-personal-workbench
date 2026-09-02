import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listTasks: vi.fn(async () => []),
    listFocusSessions: vi.fn(async () => []),
    listHabitLogs: vi.fn(async () => []),
    listReviews: vi.fn(async () => []),
    listNotes: vi.fn(async () => []),
    listPapers: vi.fn(async () => []),
    importAll: vi.fn(async () => {}),
  } as never,
}))
vi.mock('@/app/auth', () => ({
  useAuth: () => ({
    user: { email: '', nickname: '', avatarColor: '#7D8CA3' },
    updateProfile: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }),
}))
vi.mock('@/lib/db/supabase-client', () => ({ getSupabaseClient: vi.fn() }))

import { SettingsPage } from '../src/modules/me/settings'
import { CHANGELOG } from '../src/app/changelog'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })

function renderPage() {
  return render(<QueryClientProvider client={qc}><SettingsPage /></QueryClientProvider>)
}

describe('SettingsPage（本地模式）', () => {
  beforeEach(() => {
    qc.clear()
    vi.clearAllMocks()
    // jsdom 无 matchMedia：主题 system 档与 pwa-install standalone 检测都会探测
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false, addEventListener() {}, removeEventListener() {} }))
  })

  it('五段式渲染：身份卡 / 累计统计 / 通知 / 数据 / 关于，无「我的项目」重复入口', () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: '我的' })).toBeTruthy()
    expect(screen.getByText('💾 本地存储')).toBeTruthy()
    expect(screen.getByText('累计统计')).toBeTruthy()
    expect(screen.getByText('通知设置')).toBeTruthy()
    expect(screen.getByText('数据管理')).toBeTruthy()
    expect(screen.getByText('关于')).toBeTruthy()
    expect(screen.queryByText('我的项目')).toBeNull()
  })

  it('版本号动态读取 CHANGELOG（v1.23 修复硬编码 v1.2），安装行在非 iOS 且无可安装事件时隐藏', () => {
    renderPage()
    expect(screen.getByText('更新日志')).toBeTruthy()
    expect(screen.getAllByText(new RegExp(CHANGELOG[0].version)).length).toBeGreaterThan(0)
    // 老文案「我的工作台 v1.2 ——」不得再出现
    expect(screen.queryByText(/我的工作台 v1\.2 ——/)).toBeNull()
    expect(screen.queryByText('添加到主屏幕')).toBeNull()
  })

  it('编辑资料弹窗：打开后含昵称输入与色板', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '编辑' }))
    await waitFor(() => expect(screen.getByText('编辑资料')).toBeTruthy())
    expect(screen.getByLabelText('昵称')).toBeTruthy()
    expect(screen.getByLabelText('头像颜色 #7D8CA3')).toBeTruthy()
  })

  it('更新日志弹窗列出各版本条目', async () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: '查看更新日志' }))
    await waitFor(() => expect(screen.getByText(CHANGELOG[0].title)).toBeTruthy())
    // 至少能翻到早期版本
    expect(screen.getByText('v1.2')).toBeTruthy()
  })
})
