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
