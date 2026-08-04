import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import type { ReactNode } from 'react'

vi.mock('../src/lib/db', () => ({ isCloudMode: true, repository: {} }))
const mocks = vi.hoisted(() => ({ authState: { user: null as { email: string } | null, loading: false } }))
vi.mock('../src/app/auth', () => ({ AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>, useAuth: () => mocks.authState }))

import { Guard } from '../src/App'

describe('Guard', () => {
  function renderGuard(children: ReactNode) {
    return render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Guard>{children}</Guard>} />
          <Route path="/login" element={<div>login page</div>} />
        </Routes>
      </MemoryRouter>
    )
  }

  it('云端模式未登录重定向到 /login', () => {
    renderGuard(<div>protected</div>)
    expect(screen.getByText('login page')).toBeInTheDocument()
  })

  it('云端模式已登录放行', () => {
    mocks.authState = { user: { email: 'a@b.c' }, loading: false }
    renderGuard(<div>protected</div>)
    expect(screen.getByText('protected')).toBeInTheDocument()
  })

  it('加载中显示 loading', () => {
    mocks.authState = { user: null, loading: true }
    renderGuard(<div>protected</div>)
    expect(screen.getByText('加载中…')).toBeInTheDocument()
  })
})
