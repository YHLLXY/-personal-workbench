import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'

const DAY = 86400000
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (ms: number) => { const d = new Date(ms); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` }
const iso = (ms: number) => new Date(ms).toISOString()
const NOW = Date.now()

// 相对今天构造三档：已逾期（引用对象日期已过）/ 待处理（今天到期）/ 即将到来（还没到点）
const ROWS = [
  { id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: iso(NOW - 2 * DAY), sentAt: iso(NOW - 2 * DAY), createdAt: iso(NOW - 3 * DAY) },
  { id: 'r2', refType: 'task', refId: 't2', kind: 'due', scheduledAt: iso(NOW - 3600_000), sentAt: null, createdAt: iso(NOW - DAY) },
  { id: 'r3', refType: 'exam', refId: 'e1', kind: 'exam-3d', scheduledAt: iso(NOW + 3 * DAY), sentAt: null, createdAt: iso(NOW) },
]
const TASKS = [
  { id: 't1', title: '拖了两天的报告', focus: false, priority: 'high', status: 'todo', dueDate: ymd(NOW - 2 * DAY), dueTime: '09:30', tags: [], sort: 1, completedAt: null, createdAt: iso(NOW - 3 * DAY) },
  { id: 't2', title: '今天要交的表', focus: false, priority: 'medium', status: 'todo', dueDate: ymd(NOW), dueTime: '21:00', tags: [], sort: 2, completedAt: null, createdAt: iso(NOW - DAY) },
]
const EXAMS = [
  { id: 'e1', title: '四级', examDate: ymd(NOW + 4 * DAY), examTime: '09:00', subject: null, note: null, createdAt: iso(NOW) },
]

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listReminders: vi.fn(async () => ROWS),
    listTasks: vi.fn(async () => TASKS),
    listExams: vi.fn(async () => EXAMS),
    listStudyGoals: vi.fn(async () => []),
    updateTask: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
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

  it('按三档分组渲染：已逾期 / 待处理 / 即将到来', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/拖了两天的报告/)).toBeTruthy())
    expect(screen.getByText(/已逾期 1 条/)).toBeTruthy()
    expect(screen.getByText(/待处理 1 条/)).toBeTruthy()
    expect(screen.getByText(/即将到来 1 条/)).toBeTruthy()
    expect(screen.getByText(/今天要交的表/)).toBeTruthy()
    expect(screen.getByText(/四级/)).toBeTruthy()
  })

  it('逾期行底色为红（destructive），待处理行为主色', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/拖了两天的报告/)).toBeTruthy())
    const overdueRow = screen.getByText(/拖了两天的报告/).closest('div[class*="rounded-xl"]')!
    expect(overdueRow.className).toContain('bg-destructive/8')
    const dueRow = screen.getByText(/今天要交的表/).closest('div[class*="rounded-xl"]')!
    expect(dueRow.className).toContain('bg-primary/5')
    expect(dueRow.className).not.toContain('destructive')
  })

  it('v1.31：不再有「忽略 / 全部忽略 / 恢复」入口，出口是去处理那件事', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/拖了两天的报告/)).toBeTruthy())
    expect(screen.queryByRole('button', { name: '忽略' })).toBeNull()
    expect(screen.queryByRole('button', { name: /全部忽略/ })).toBeNull()
    expect(screen.queryByRole('button', { name: /恢复/ })).toBeNull()
    expect(screen.getAllByRole('button', { name: '完成' })).toHaveLength(2)
  })

  it('点「完成」→ 把对应任务标记完成（提醒随后由服务端清理消失）', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/拖了两天的报告/)).toBeTruthy())
    fireEvent.click(screen.getAllByRole('button', { name: '完成' })[0])
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledWith('t1', { status: 'done' }))
  })

  it('逾期任务给「顺延」→ dueDate 改成今天；未逾期的不给', async () => {
    renderPage()
    await waitFor(() => expect(screen.getByText(/拖了两天的报告/)).toBeTruthy())
    // 只有逾期那条有顺延按钮
    expect(screen.getAllByRole('button', { name: /顺延/ })).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: /顺延/ }))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledWith('t1', { dueDate: ymd(Date.now()) }))
  })
})
