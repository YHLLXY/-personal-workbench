import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { createTaskMock, updateTaskMock } = vi.hoisted(() => ({
  createTaskMock: vi.fn(async (input: unknown) => ({ id: 'x', ...(input as object) })),
  updateTaskMock: vi.fn(async (v: unknown) => v),
}))

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: { createTask: createTaskMock, updateTask: updateTaskMock },
} as never))
vi.mock('../src/modules/overview/api', () => ({
  useTaskMutations: () => ({
    create: { mutate: vi.fn((input: unknown, opts?: { onSuccess?: () => void }) => { createTaskMock(input); opts?.onSuccess?.() }) },
    update: { mutate: vi.fn((v: unknown, opts?: { onSuccess?: () => void }) => { updateTaskMock(v); opts?.onSuccess?.() }) },
  }),
}))

import { TaskDialog } from '../src/modules/overview/task-dialog'
import { repository } from '@/lib/db'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
describe('TaskDialog 提醒时间', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })
  it('填写提醒时间后提交 → createTask 载荷含 dueTime', async () => {
    render(
      <QueryClientProvider client={qc}>
        <TaskDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByPlaceholderText('任务内容'), { target: { value: '交报告' } })
    fireEvent.change(screen.getByLabelText(/提醒时间/), { target: { value: '09:30' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => expect(repository.createTask).toHaveBeenCalledWith(expect.objectContaining({ dueTime: '09:30', dueDate: expect.any(String) })))
  })
})

describe('TaskDialog 备注（v1.25）', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })
  it('填写备注提交 → 载荷含 note；清空后新建 → 载荷不含 note 键（条件挂键）', async () => {
    render(
      <QueryClientProvider client={qc}>
        <TaskDialog open onOpenChange={() => {}} />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByPlaceholderText('任务内容'), { target: { value: '带备注任务' } })
    fireEvent.change(screen.getByLabelText(/备注/), { target: { value: '先查资料再动手' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => expect(repository.createTask).toHaveBeenCalledWith(expect.objectContaining({ note: '先查资料再动手' })))

    vi.clearAllMocks()
    fireEvent.change(screen.getByLabelText(/备注/), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => expect(repository.createTask).toHaveBeenCalled())
    const payload = (repository.createTask as ReturnType<typeof vi.fn>).mock.lastCall?.[0] as Record<string, unknown>
    expect(payload).not.toHaveProperty('note') // 空/纯空白备注不发键：云端部署窗口安全 + 防 undefined 抹除已存备注
  })
})

/** v1.31 状态语义：将来 = 无日期收件箱；重复规则不再被静默清空；编辑旧焦点任务不「复活」到今天 */
describe('TaskDialog 状态语义（v1.31）', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })
  const editing = {
    id: 't1', title: '背单词', focus: true, focusDate: '2026-08-01', priority: 'high' as const, status: 'todo' as const,
    dueDate: '2026-08-02', dueTime: '08:00', tags: [], sort: 1, completedAt: null, createdAt: '2026-07-01T00:00:00.000Z',
    repeat: { freq: 'daily' as const, interval: 1, anchor: 'due' as const },
  }
  /** updateTask 最后一次调用的 patch（不用 ?. 取值：lint 的 no-unsafe-optional-chaining 会报） */
  function lastPatch(): Record<string, unknown> {
    const call = (repository.updateTask as ReturnType<typeof vi.fn>).mock.lastCall as unknown[] | undefined
    if (!call) throw new Error('updateTask 未被调用')
    return (call[0] as { patch: Record<string, unknown> }).patch
  }
  function renderEdit() {
    return render(
      <QueryClientProvider client={qc}>
        <TaskDialog open onOpenChange={() => {}} editing={editing as never} />
      </QueryClientProvider>,
    )
  }

  it('选「将来」→ 清空并禁用日期；重复规则**原样保留**（旧版会静默写 repeat: null 且切回来不恢复）', async () => {
    renderEdit()
    fireEvent.click(screen.getByRole('button', { name: '将来' }))
    expect(screen.getByLabelText(/日期/)).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalled())
    const patch = lastPatch()
    expect(patch.status).toBe('someday')
    expect(patch.dueDate).toBeNull()
    expect(patch.dueTime).toBeNull()
    expect(patch.repeat).toEqual({ freq: 'daily', interval: 1, anchor: 'due' })
  })

  it('编辑一个旧的焦点任务 → focusDate 保持原绑定日（旧版无条件写成今天，任务会「复活」到今日区）', async () => {
    renderEdit()
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalled())
    const patch = lastPatch()
    expect(patch.focus).toBe(true)
    expect(patch.focusDate).toBe('2026-08-01')
  })

  it('三态语义写在弹窗里（用户上一轮说「没搞懂」，语义不能只活在代码注释里）', () => {
    renderEdit()
    expect(screen.getByText(/待办：有日期/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '进行中' }))
    expect(screen.getByText(/进行中：正在推进/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '将来' }))
    expect(screen.getByText(/将来：还没排期/)).toBeTruthy()
  })
})
