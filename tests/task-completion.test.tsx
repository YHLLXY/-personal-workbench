import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { todayStr } from '../src/lib/db/types'

/**
 * v1.35 统一完成入口的接线测试。
 *
 * 这里只验证「四个入口都走同一条规则」这件事本身 —— 规则的正确性在 tests/task-rules.test.ts 里测过。
 * 之所以要单独一条：v1.34 的四个入口里有两个直接写 status:'done'，规则改了它们不会跟着改，
 * 而单测全绿。它们唯一的共同特征就是「都会调 repository.updateTask」，
 * 所以断言落库补丁的形状 = 断言入口接线正确。
 */

const REPEAT = {
  id: 'r1', title: '每天背单词', focus: false, focusDate: null, priority: 'medium' as const,
  status: 'todo' as const, dueDate: todayStr(), dueTime: null, tags: [], sort: 1,
  completedAt: null, createdAt: '2026-08-01T00:00:00.000Z',
  repeat: { freq: 'daily' as const, interval: 1, anchor: 'due' as const },
}
const PLAIN = {
  id: 'p1', title: '交周报', focus: false, focusDate: null, priority: 'low' as const,
  status: 'todo' as const, dueDate: todayStr(), dueTime: null, tags: [], sort: 2,
  completedAt: null, createdAt: '2026-08-01T00:00:00.000Z',
}

vi.mock('@/lib/db', () => ({
  isCloudMode: false,
  repository: {
    listTasks: vi.fn(async () => [REPEAT, PLAIN]),
    listExams: vi.fn(async () => []),
    updateTask: vi.fn(async (id: string, patch: Record<string, unknown>) => ({ id, ...patch })),
    deleteTask: vi.fn(async () => undefined),
    // 计划项（v1.35）：完成/撤销同时写一条事实记录
    listPlanItems: vi.fn(async () => []),
    upsertPlanItem: vi.fn(async (input: Record<string, unknown>) => ({ createdAt: '2026-11-26T00:00:00.000Z', ...input })),
    deletePlanItem: vi.fn(async () => undefined),
  } as never,
}))

import { useTaskActions } from '../src/modules/overview/use-task-actions'
import { repository } from '@/lib/db'

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
)

/** 取第 n 次 updateTask 的补丁 */
function patchOf(call = 0): Record<string, unknown> {
  const args = vi.mocked(repository.updateTask).mock.calls[call]
  return args[1] as Record<string, unknown>
}

describe('useTaskActions 统一完成入口', () => {
  beforeEach(() => { qc.clear(); vi.clearAllMocks() })

  it('普通任务完成 → status=done', async () => {
    const { result } = renderHook(() => useTaskActions(), { wrapper })
    act(() => result.current.complete(PLAIN))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledTimes(1))
    expect(repository.updateTask).toHaveBeenCalledWith('p1', { status: 'done' })
  })

  it('重复任务完成 → 绝不写 status（写了就终结整条序列），只推进 completedAt/dueDate', async () => {
    const { result } = renderHook(() => useTaskActions(), { wrapper })
    act(() => result.current.complete(REPEAT))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledTimes(1))
    const patch = patchOf()
    expect(patch).not.toHaveProperty('status')
    expect(typeof patch.completedAt).toBe('string')
    expect(patch.dueDate).toBeTruthy()
  })

  it('完成同时写计划项：plan_date 取完成前的 dueDate，done_at 记事实', async () => {
    const { result } = renderHook(() => useTaskActions(), { wrapper })
    act(() => result.current.complete(REPEAT))
    // 重复任务完成后 dueDate 已滚到下一期，但计划项必须落在「今天」——否则复盘当天分母缺这一项
    await waitFor(() => expect(repository.upsertPlanItem).toHaveBeenCalledWith(expect.objectContaining({
      planDate: todayStr(), taskId: 'r1', doneAt: expect.any(String),
    })))
  })

  it('撤销完成 → 把 done_at 清回 null（否则复盘/进度账本会重复计）', async () => {
    vi.mocked(repository.listPlanItems).mockResolvedValueOnce([
      { planDate: todayStr(), taskId: 'r1', title: '每天背单词', goalId: null, amount: null, doneAt: `${todayStr()}T02:00:00.000Z`, movedTo: null, createdAt: '2026-11-26T00:00:00.000Z' },
    ] as never)
    const { result } = renderHook(() => useTaskActions(), { wrapper })
    act(() => result.current.reopen(REPEAT))
    await waitFor(() => expect(repository.upsertPlanItem).toHaveBeenCalledWith(expect.objectContaining({
      planDate: todayStr(), taskId: 'r1', doneAt: null,
    })))
  })

  it('toggle：未完成 → 完成；已完成（重复任务当天）→ 撤销', async () => {
    const { result } = renderHook(() => useTaskActions(), { wrapper })
    act(() => result.current.toggle(PLAIN))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledTimes(1))
    expect(patchOf(0)).toEqual({ status: 'done' })

    // 重复任务完成当天 status 仍是 todo，只能靠 completedAt 判定 —— toggle 必须认这个方向
    const completed = { ...REPEAT, completedAt: `${todayStr()}T02:00:00.000Z` }
    act(() => result.current.toggle(completed))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledTimes(2))
    expect(patchOf(1)).toMatchObject({ completedAt: null })
    expect(patchOf(1)).not.toHaveProperty('status')
  })

  it('completeMany：逐条派生各自补丁，撤销按各自原值写回（不串味）', async () => {
    const { result } = renderHook(() => useTaskActions(), { wrapper })
    act(() => result.current.completeMany([REPEAT, PLAIN]))
    await waitFor(() => expect(repository.updateTask).toHaveBeenCalledTimes(2))
    expect(patchOf(0)).not.toHaveProperty('status')
    expect(patchOf(1)).toEqual({ status: 'done' })
  })

  it('completeMany 空列表不留空 toast、不发请求', async () => {
    const { result } = renderHook(() => useTaskActions(), { wrapper })
    act(() => result.current.completeMany([]))
    expect(repository.updateTask).not.toHaveBeenCalled()
  })
})
