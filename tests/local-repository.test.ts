import { describe, it, expect, beforeEach } from 'vitest'
import { LocalRepository } from '../src/lib/db/local-repository'

describe('LocalRepository', () => {
  let repo: LocalRepository
  beforeEach(() => { localStorage.clear(); repo = new LocalRepository() })

  it('创建任务并读取', async () => {
    const t = await repo.createTask({ title: '完成作业' })
    expect(t.id).toBeTruthy()
    expect(t.status).toBe('todo')
    expect((await repo.listTasks())[0].title).toBe('完成作业')
  })

  it('完成任务自动记录 completedAt', async () => {
    const t = await repo.createTask({ title: 'x' })
    const done = await repo.updateTask(t.id, { status: 'done' })
    expect(done.completedAt).toBeTruthy()
  })

  it('打卡 upsert 按 habitId+date 覆盖', async () => {
    await repo.setHabitLog('h1', '2026-08-04', 1)
    await repo.setHabitLog('h1', '2026-08-04', 2)
    const logs = await repo.listHabitLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0].count).toBe(2)
  })

  it('upsertReview 同日期只留一条', async () => {
    await repo.upsertReview('2026-08-04', { mood: 4 })
    await repo.upsertReview('2026-08-04', { summary: '很好' })
    const rs = await repo.listReviews()
    expect(rs).toHaveLength(1)
    expect(rs[0].summary).toBe('很好')
  })
})
