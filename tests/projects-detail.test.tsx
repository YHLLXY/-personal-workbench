import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes } from 'react-router-dom'

const LIST_DATA = {
  updatedAt: '2026-08-28T00:00:00Z',
  source: 'github',
  projects: [
    { name: '个人工作台', dir: '个人工作台', emoji: '🧭', phase: '进行中', stack: ['React 19'], aliases: ['工作台'], updatedAt: '2026-08-12', summary: '个人效率工作台。' },
  ],
}

const DETAIL_DATA = {
  dir: '个人工作台',
  name: '个人工作台',
  html: '<h2>项目简介</h2><p>个人效率工作台 Web 应用。</p>',
  markdown: null,
  rendered: true,
  gatewayPath: '30-项目/个人工作台/个人工作台 - 门户口.md',
  files: [
    { name: '个人工作台 - 门户口.md', path: '30-项目/个人工作台/个人工作台 - 门户口.md' },
    { name: '开发日志.md', path: '30-项目/个人工作台/开发日志.md' },
  ],
}

/** 模拟服务端鉴权：置 true 时 detail 接口返回 401（测试环境无真实会话，默认放行走成功链路） */
let detailUnauthorized = false

vi.stubGlobal('fetch', vi.fn(async (url: string) => {
  const u = String(url)
  if (u.includes('entry=detail')) {
    if (detailUnauthorized) return { ok: false, status: 401, json: async () => ({ error: 'unauthorized' }) }
    return { ok: true, json: async () => DETAIL_DATA }
  }
  if (u.includes('/api/projects')) return { ok: true, json: async () => LIST_DATA }
  return { ok: false, json: async () => { throw new Error('nope') } }
}))

import ProjectDetailPage from '../src/modules/projects/project-detail'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
function renderDetail() {
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/projects/个人工作台']}>
        <Routes>
          <Route path="/projects/:name" element={<ProjectDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ProjectDetail 详情页', () => {
  beforeEach(() => { qc.clear(); detailUnauthorized = false })

  it('渲染头部信息（列表缓存）与门户口正文 HTML', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('项目简介')).toBeTruthy())
    expect(screen.getByText('个人效率工作台 Web 应用。')).toBeTruthy()
    expect(screen.getByText('进行中')).toBeTruthy()
    expect(screen.getByText('React 19')).toBeTruthy()
  })

  it('渲染目录内文档清单与编辑/查看入口', async () => {
    renderDetail()
    await waitFor(() => expect(screen.getByText('目录内文档 · 2 个')).toBeTruthy())
    expect(screen.getByText('开发日志.md')).toBeTruthy()
    const editBtn = screen.getByText('编辑门户口').closest('a')
    expect(editBtn).toBeTruthy()
    expect((editBtn as HTMLAnchorElement).href).toContain('github.dev/YHLLXY/Konwledge-home/blob/main/30-%E9%A1%B9%E7%9B%AE')
  })

  it('401（未登录）时正文区降级为提示 + GitHub 兜底链接', async () => {
    detailUnauthorized = true
    renderDetail()
    await waitFor(() => expect(screen.getByText('详情需登录后查看（云端模式登录并保持联网）')).toBeTruthy())
    expect(screen.getByText('在 GitHub 查看')).toBeTruthy()
  })
})
