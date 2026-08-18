import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { sortProjects, PHASE_ORDER, loadProjects } from '../src/modules/projects/api'
import type { ProjectInfo } from '../src/modules/projects/api'

const PROJECTS: ProjectInfo[] = [
  { name: 'A', emoji: '🚪', phase: '已完成', stack: [], aliases: [], updatedAt: '2026-07-01', summary: 's' },
  { name: 'B', emoji: '🚪', phase: '进行中', stack: [], aliases: [], updatedAt: '2026-08-01', summary: 's' },
  { name: 'C', emoji: '🚪', phase: '进行中', stack: [], aliases: [], updatedAt: '2026-07-15', summary: 's' },
]

describe('sortProjects', () => {
  it('进行中在前，同 phase 按更新时间倒序', () => {
    const sorted = sortProjects(PROJECTS)
    expect(sorted.map(p => p.name)).toEqual(['B', 'C', 'A'])
  })
  it('未知 phase 排最后', () => {
    const sorted = sortProjects([...PROJECTS, { name: 'X', emoji: '🚪', phase: '未知', stack: [], aliases: [], updatedAt: null, summary: '' }])
    expect(sorted[sorted.length - 1].name).toBe('X')
  })
  it('PHASE_ORDER 顺序稳定', () => {
    expect([...PHASE_ORDER]).toEqual(['进行中', '已完成', '已归档', '暂停'])
  })
})

describe('loadProjects 降级链', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()) })
  afterEach(() => { vi.unstubAllGlobals() })

  it('api 成功 → source github', async () => {
    const ok = { ok: true, json: async () => ({ updatedAt: 't', source: 'github', projects: PROJECTS }) }
    vi.mocked(fetch).mockResolvedValue(ok as unknown as Response)
    const r = await loadProjects()
    expect(r.source).toBe('github')
    expect(r.projects).toHaveLength(3)
  })
  it('api 失败 → 静态快照 → source fallback', async () => {
    const fail = { ok: false, json: async () => { throw new Error('x') } }
    const snap = { ok: true, json: async () => ({ projects: [PROJECTS[0]] }) }
    vi.mocked(fetch)
      .mockResolvedValueOnce(fail as unknown as Response)
      .mockResolvedValueOnce(snap as unknown as Response)
    const r = await loadProjects()
    expect(r.source).toBe('fallback')
    expect(r.projects).toHaveLength(1)
    expect(vi.mocked(fetch).mock.calls[1][0]).toBe('/projects-status.json')
  })
  it('api 与快照都失败 → reject', async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: false, json: async () => { throw new Error('x') } } as unknown as Response)
    await expect(loadProjects()).rejects.toThrow()
  })
})