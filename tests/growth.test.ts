import { describe, it, expect, beforeEach } from 'vitest'
import { LocalRepository } from '../src/lib/db/local-repository'
import { GROWTH_PRESETS, buildImportPlan } from '../src/modules/growth/api'
import type { GrowthAction } from '../src/lib/db/types'

function fakeAction(no: number): GrowthAction {
  return { id: `a${no}`, no, title: `行动${no}`, emoji: '📈', category: '学业', why: 'x', steps: ['a'], targets: ['b'], verify: 'c', habitId: null, status: 'active', sort: no, createdAt: new Date().toISOString() }
}

describe('GROWTH_PRESETS 完整性', () => {
  it('恰好 10 条且 no 1-10 连续无重复', () => {
    expect(GROWTH_PRESETS).toHaveLength(10)
    expect(GROWTH_PRESETS.map(p => p.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
  })

  it('每条必填字段非空：title/why/verify 有内容，steps/targets ≥2 项', () => {
    for (const p of GROWTH_PRESETS) {
      expect(p.title.length).toBeGreaterThan(4)
      expect(p.why.length).toBeGreaterThan(20)
      expect(p.verify.length).toBeGreaterThan(5)
      expect(p.steps.length).toBeGreaterThanOrEqual(2)
      expect(p.targets.length).toBeGreaterThanOrEqual(2)
      expect(p.emoji).toBeTruthy()
      expect(p.category).toBeTruthy()
    }
  })

  it('steps 与 targets 无空字符串', () => {
    for (const p of GROWTH_PRESETS) {
      for (const s of p.steps) expect(s.trim().length).toBeGreaterThan(0)
      for (const t of p.targets) expect(t.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('buildImportPlan 幂等', () => {
  it('空列表 → 全部 10 条', () => {
    expect(buildImportPlan([])).toHaveLength(10)
  })
  it('已有 1/2 号 → 只补 3-10', () => {
    const plan = buildImportPlan([fakeAction(1), fakeAction(2)])
    expect(plan.map(p => p.no)).toEqual([3, 4, 5, 6, 7, 8, 9, 10])
  })
  it('全部存在 → 空', () => {
    expect(buildImportPlan([1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(fakeAction))).toHaveLength(0)
  })
})

describe('GrowthAction CRUD（local）', () => {
  let repo: LocalRepository
  beforeEach(() => { localStorage.clear(); repo = new LocalRepository() })

  it('创建并读取（steps/targets 数组往返一致）', async () => {
    await repo.createGrowthAction({ no: 1, title: '睡眠', emoji: '🛏', category: '睡眠', why: '因为', steps: ['a', 'b'], targets: ['x', 'y'], verify: '打卡' })
    const list = await repo.listGrowthActions()
    expect(list).toHaveLength(1)
    expect(list[0].steps).toEqual(['a', 'b'])
    expect(list[0].targets).toEqual(['x', 'y'])
    expect(list[0].status).toBe('active')
    expect(list[0].sort).toBe(1)
  })

  it('更新状态与字段', async () => {
    const g = await repo.createGrowthAction({ no: 2, title: '数学', emoji: '📐', category: '学业', why: 'w', steps: ['a'], targets: ['b'], verify: 'v' })
    const updated = await repo.updateGrowthAction(g.id, { status: 'done', why: '新的理由' })
    expect(updated.status).toBe('done')
    expect(updated.why).toBe('新的理由')
  })

  it('删除', async () => {
    const g = await repo.createGrowthAction({ no: 3, title: '表达', emoji: '🎤', category: '表达', why: 'w', steps: ['a'], targets: ['b'], verify: 'v' })
    await repo.deleteGrowthAction(g.id)
    expect(await repo.listGrowthActions()).toHaveLength(0)
  })

  it('deleteHabit 联动解除 growthActions.habitId（防悬空）', async () => {
    const habit = await repo.createHabit({ name: '睡眠打卡' })
    await repo.createGrowthAction({ no: 1, title: '睡眠', emoji: '🛏', category: '睡眠', why: 'w', steps: ['a'], targets: ['b'], verify: 'v', habitId: habit.id })
    await repo.deleteHabit(habit.id)
    const list = await repo.listGrowthActions()
    expect(list[0].habitId).toBeNull()
    expect(list[0].status).toBe('active')
  })

  it('旧数据（缺新字段）读取时补默认值', async () => {
    localStorage.setItem('wb:growthActions', JSON.stringify([{ id: 'old', no: 1, title: '旧', emoji: '🛏', category: '睡眠', sort: 1 }]))
    const g = (await repo.listGrowthActions())[0]
    expect(g.why).toBe('')
    expect(g.steps).toEqual([])
    expect(g.habitId).toBeNull()
    expect(g.status).toBe('active')
  })
})

describe('备份闭环含 growthActions', () => {
  beforeEach(() => { localStorage.clear() })

  it('exportAll 包含 growthActions，importAll 恢复', async () => {
    const repo = new LocalRepository()
    await repo.createGrowthAction({ no: 1, title: '睡眠', emoji: '🛏', category: '睡眠', why: 'w', steps: ['a', 'b'], targets: ['c'], verify: 'v' })
    const backup = await repo.exportAll()
    expect(backup.growthActions).toHaveLength(1)
    localStorage.clear()
    const repo2 = new LocalRepository()
    await repo2.importAll(backup)
    const list = await repo2.listGrowthActions()
    expect(list).toHaveLength(1)
    expect(list[0].steps).toEqual(['a', 'b'])
  })

  it('旧备份文件缺 growthActions 时导入不抛错（?? [] 守卫）', async () => {
    const repo = new LocalRepository()
    const oldBackup = await repo.exportAll()
    delete (oldBackup as Partial<typeof oldBackup>).growthActions
    await expect(repo.importAll(oldBackup)).resolves.toBeUndefined()
  })
})