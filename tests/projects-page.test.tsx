import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const PROJECTS = [
  { name: '个人工作台', emoji: '🚪', phase: '进行中', stack: ['React 19', 'Supabase'], aliases: ['工作台'], updatedAt: '2026-08-12', summary: '个人效率工作台 Web 应用。' },
  { name: '蔬菜定价优化', emoji: '🥬', phase: '已完成', stack: ['Python'], aliases: ['蔬菜定价'], updatedAt: '2026-07-29', summary: '自动定价与补货优化。' },
]
/** 接口响应（可变：刷新用例要模拟「服务端数据变了 / 没变 / 回退快照」三种） */
let payload: unknown = { updatedAt: '2026-08-18T00:00:00Z', source: 'github', projects: PROJECTS }

vi.stubGlobal('fetch', vi.fn(async (url: unknown) => {
  if (String(url).includes('/api/projects')) return { ok: true, json: async () => payload }
  return { ok: false, json: async () => { throw new Error('nope') } }
}))

import Projects from '../src/modules/projects/projects'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function renderPage() {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <Projects />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Projects 页面', () => {
  beforeEach(() => { qc.clear(); payload = { updatedAt: '2026-08-18T00:00:00Z', source: 'github', projects: PROJECTS } })
  afterEach(() => { payload = { updatedAt: '2026-08-18T00:00:00Z', source: 'github', projects: PROJECTS } })

  it('渲染项目卡片：名称/状态徽章/简介/技术栈/分组标题', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('个人工作台')).toBeTruthy())
    expect(screen.getByText('进行中 · 1 个')).toBeTruthy()
    expect(screen.getByText('已完成 · 1 个')).toBeTruthy()
    expect(screen.getByText('React 19')).toBeTruthy()
    expect(screen.getByText('个人效率工作台 Web 应用。')).toBeTruthy()
    expect(screen.getByText('蔬菜定价优化')).toBeTruthy()
  })

  it('刷新：服务端 updatedAt 没变 → 明说「服务端未更新」并给出生成时刻（v1.34 图三：旧版只有图标转圈）', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('个人工作台')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/服务端未更新 · 生成于 \d{2}:\d{2}/))
  })

  it('刷新：updatedAt 变了 → 「已更新 · N 个项目（生成于 HH:mm）」', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('个人工作台')).toBeTruthy())
    payload = { updatedAt: '2026-08-18T06:30:00Z', source: 'github', projects: PROJECTS }
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toMatch(/已更新 · 2 个项目（生成于 \d{2}:\d{2}）/))
  })

  it('刷新：接口回退快照 → 「网络不可用，当前为离线快照」', async () => {
    payload = { updatedAt: null, source: 'fallback', projects: PROJECTS }
    renderPage()
    await waitFor(() => expect(screen.getByText('个人工作台')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: '刷新' }))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('网络不可用，当前为离线快照'))
  })
})
