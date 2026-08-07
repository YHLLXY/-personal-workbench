import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const { createExamMock } = vi.hoisted(() => ({ createExamMock: vi.fn(async (input: unknown) => ({ id: 'x', ...(input as object) })) }))

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: { createExam: createExamMock },
} as never))
vi.mock('../src/modules/study/api', () => ({
  useExamMutations: () => ({
    create: { mutate: vi.fn((input: unknown, opts?: { onSuccess?: () => void }) => { createExamMock(input); opts?.onSuccess?.() }) },
    update: { mutate: vi.fn() },
  }),
}))

import { ExamDialog } from '../src/modules/study/exam-dialog'
import { repository } from '@/lib/db'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
describe('ExamDialog 考试时间', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })
  it('填写考试时间后提交 → createExam 载荷含 examTime', async () => {
    render(
      <QueryClientProvider client={qc}>
        <ExamDialog open onOpenChange={() => {}} editing={null} />
      </QueryClientProvider>,
    )
    fireEvent.change(screen.getByLabelText('名称'), { target: { value: '四级' } })
    fireEvent.change(screen.getByLabelText('日期'), { target: { value: '2026-08-10' } })
    fireEvent.change(screen.getByLabelText(/考试时间/), { target: { value: '09:00' } })
    fireEvent.click(screen.getByRole('button', { name: '添加' }))
    await waitFor(() => expect(repository.createExam).toHaveBeenCalledWith(expect.objectContaining({ examTime: '09:00' })))
  })
})
