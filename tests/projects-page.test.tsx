import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const API_DATA = {
  updatedAt: '2026-08-18T00:00:00Z',
  source: 'github',
  projects: [
    { name: '个人工作台', emoji: '🚪', phase: '进行中', stack: ['React 19', 'Supabase'], aliases: ['工作台'], updatedAt: '2026-08-12', summary: '个人效率工作台 Web 应用。' },
    { name: '蔬菜定价优化', emoji: '🥬', phase: '已完成', stack: ['Python'], aliases: ['蔬菜定价'], updatedAt: '2026-07-29', summary: '自动定价与补货优化。' },
  ],
}

vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  if (String(url).includes('/api/projects')) {
    return { ok: true, json: async () => API_DATA }
  }
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
  beforeEach(() => { qc.clear() })

  it('渲染项目卡片：名称/状态徽章/简介/技术栈/分组标题', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText('个人工作台')).toBeTruthy())
    expect(screen.getByText('进行中 · 1 个')).toBeTruthy()
    expect(screen.getByText('已完成 · 1 个')).toBeTruthy()
    expect(screen.getByText('React 19')).toBeTruthy()
    expect(screen.getByText('个人效率工作台 Web 应用。')).toBeTruthy()
    expect(screen.getByText('蔬菜定价优化')).toBeTruthy()
  })
})