import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { createTaskMock } = vi.hoisted(() => ({ createTaskMock: vi.fn(async (input: unknown) => ({ id: 'x', ...(input as object) })) }))

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: { createTask: createTaskMock },
} as never))
vi.mock('../src/modules/overview/api', () => ({
  useTaskMutations: () => ({ create: { mutate: vi.fn((input: unknown, opts?: { onSuccess?: () => void }) => { createTaskMock(input); opts?.onSuccess?.() }) } }),
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
