import { describe, it, expect } from 'vitest'
import { completionPatch, isDoneForToday, reopenPatch } from '../src/lib/task-rules'
import type { Task } from '../src/lib/db/types'

const TODAY = '2026-09-06'
const REPEAT = { freq: 'daily' as const, interval: 1, anchor: 'due' as const }
const NOW = new Date('2026-09-06T10:00:00.000Z')

function task(over: Partial<Task> = {}): Task {
  return { id: 't1', title: '背单词', focus: false, priority: 'medium', status: 'todo', dueDate: TODAY, dueTime: '09:30', focusDate: null, tags: [], sort: 1, completedAt: null, createdAt: '2026-09-01T00:00:00.000Z', ...over }
}

describe('completionPatch / reopenPatch（v1.34：两个完成入口共用同一条规则）', () => {
  it('普通任务：status → done；撤销还原**原状态**（doing 任务不会掉回 todo）', () => {
    expect(completionPatch(task(), TODAY, NOW)).toEqual({ patch: { status: 'done' }, undo: { status: 'todo' } })
    expect(completionPatch(task({ status: 'doing' }), TODAY, NOW).undo).toEqual({ status: 'doing' })
    expect(completionPatch(task(), TODAY, NOW).nextDue).toBeUndefined()
  })

  it('重复任务：绝不写 status=done（那会终结整条序列），同一行滚到下一期', () => {
    const plan = completionPatch(task({ repeat: REPEAT }), TODAY, NOW)
    expect(plan.patch.status).toBeUndefined()
    expect(plan.patch.completedAt).toBe(NOW.toISOString())
    expect(plan.patch.dueDate).toBe('2026-09-07')
    expect(plan.nextDue).toBe('2026-09-07')
    // 撤销用闭包里的原 dueDate（精确），不是 prevOccurrence 倒推
    expect(plan.undo).toEqual({ completedAt: null, dueDate: TODAY })
  })

  it('reopenPatch：普通任务回 todo；重复任务退到上一槽位', () => {
    expect(reopenPatch(task({ status: 'done' }), TODAY)).toEqual({ status: 'todo' })
    expect(reopenPatch(task({ repeat: REPEAT }), TODAY)).toEqual({ completedAt: null, dueDate: '2026-09-05' })
  })

  it('isDoneForToday：重复任务看 completedAt 是否今天（status 仍是 todo）', () => {
    expect(isDoneForToday(task({ repeat: REPEAT, completedAt: '2026-09-06T02:00:00.000Z' }), TODAY)).toBe(true)
    expect(isDoneForToday(task({ repeat: REPEAT, completedAt: '2026-09-05T02:00:00.000Z' }), TODAY)).toBe(false)
    expect(isDoneForToday(task({ status: 'done' }), TODAY)).toBe(true)
  })
})
