import { describe, it, expect } from 'vitest'
import { applyTaskPatch, type Task } from '../src/lib/db/types'

function t(partial: Partial<Task>): Task { return { id: 'x', title: 't', focus: false, priority: 'medium', status: 'todo', dueDate: null, dueTime: null, focusDate: null, tags: [], sort: 0, completedAt: null, createdAt: '', ...partial } }

describe('applyTaskPatch（乐观更新与仓储层共用的 completedAt 派生规则）', () => {
  it('status→done：立即派生完成时间（修复：乐观对象缺 completedAt，已完成区当帧收容不了任务，空帧闪没）', () => {
    const next = applyTaskPatch(t({}), { status: 'done' })
    expect(next.status).toBe('done')
    expect(next.completedAt).not.toBeNull()
    expect(Number.isNaN(new Date(next.completedAt!).getTime())).toBe(false)
  })
  it('status→todo：清空完成时间（撤销完成当帧回到待办口径）', () => {
    const next = applyTaskPatch(t({ status: 'done', completedAt: '2026-08-28T01:00:00.000Z' }), { status: 'todo' })
    expect(next.status).toBe('todo')
    expect(next.completedAt).toBeNull()
  })
  it('不带 status 的 patch（如加星标）：不触碰完成时间，原值保留', () => {
    const done = t({ status: 'done', completedAt: '2026-08-28T01:00:00.000Z' })
    expect(applyTaskPatch(done, { focus: true }).completedAt).toBe(done.completedAt)
    expect(applyTaskPatch(t({}), { focus: true }).completedAt).toBeNull()
  })
  it('显式 patch.completedAt 且无 status：采纳显式值（与仓储层原规则一致）', () => {
    expect(applyTaskPatch(t({}), { completedAt: '2026-08-27T00:00:00.000Z' }).completedAt).toBe('2026-08-27T00:00:00.000Z')
  })
  it('其余字段正常合并，且不修改原对象（纯函数）', () => {
    const cur = t({ title: 'a', dueDate: '2026-08-28' })
    const next = applyTaskPatch(cur, { title: 'b' })
    expect(next.title).toBe('b')
    expect(next.dueDate).toBe('2026-08-28')
    expect(cur.title).toBe('a')
  })
})
