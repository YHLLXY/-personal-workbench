import { describe, it, expect } from 'vitest'
import { buildBackup, validateBackup, formatBytes, backupFileName, BACKUP_APP, BACKUP_VERSION } from '../src/lib/backup'
import type { BackupTables } from '../src/lib/db/types'

const sample: BackupTables = {
  tasks: [{ id: 't1', title: '写完计划', focus: true, focusDate: '2026-08-05', priority: 'high', status: 'done', dueDate: '2026-08-05', dueTime: null, tags: [], sort: 1, completedAt: '2026-08-05T08:00:00.000Z', createdAt: '2026-08-01T00:00:00.000Z' }],
  habits: [{ id: 'h1', name: '喝水', icon: '💧', color: '#5B8A72', targetPerDay: 8, active: true, createdAt: '2026-08-01T00:00:00.000Z' }],
  habitLogs: [{ id: 'l1', habitId: 'h1', logDate: '2026-08-05', count: 3 }],
  focusSessions: [{ id: 'f1', startAt: '2026-08-05T09:00:00.000Z', minutes: 25, note: null }],
  exams: [{ id: 'e1', title: '期末', examDate: '2026-09-01', examTime: null, subject: null, note: null, createdAt: '2026-08-01T00:00:00.000Z' }],
  studyGoals: [{ id: 'g1', title: '背单词', target: 100, progress: 30, deadline: null, status: 'active', note: null, completedAt: null }],
  notes: [{ id: 'n1', content: '灵感', tag: null, archived: false, pinned: false, createdAt: '2026-08-01T00:00:00.000Z', updatedAt: '2026-08-01T00:00:00.000Z' }],
  papers: [{ id: 'p1', title: '论文', authors: 'a', arxivId: null, url: null, status: 'want', rating: null, note: null, createdAt: '2026-08-01T00:00:00.000Z' }],
  folders: [{ id: 'd1', name: '机器学习', parentId: null, sort: 1 }],
  healthLogs: [{ id: 'g1', logDate: '2026-08-05', type: 'sleep', value: 7.5 }],
  reviews: [{ id: 'r1', reviewDate: '2026-08-05', mood: 4, achievements: 'A', reflection: 'R', gratitude: 'G', learnings: 'L', summary: '好', planTomorrow: '继续', score: 7, updatedAt: '2026-08-05T12:00:00.000Z' }],
  growthActions: [{ id: 'ga1', no: 1, title: '睡眠', emoji: '🛏', category: '睡眠', why: 'w', steps: ['a'], targets: ['b'], verify: 'v', habitId: null, status: 'active', sort: 1, createdAt: '2026-08-01T00:00:00.000Z' }],
}

describe('backup', () => {
  it('buildBackup 生成标准格式（含 app/version/exportedAt/mode/tables）', () => {
    const file = buildBackup(sample, 'local')
    expect(file.app).toBe(BACKUP_APP)
    expect(file.version).toBe(BACKUP_VERSION)
    expect(file.mode).toBe('local')
    expect(file.exportedAt).toBeTruthy()
    expect(file.tables).toEqual(sample)
  })

  it('JSON 序列化→反序列化→validateBackup 往返无损', () => {
    const raw = JSON.stringify(buildBackup(sample, 'cloud'))
    const v = validateBackup(JSON.parse(raw))
    expect(v.ok).toBe(true)
    if (v.ok) expect(v.tables).toEqual(sample)
  })

  it('app 不匹配 → not-workbench，不通过', () => {
    const v = validateBackup({ app: 'other-app', version: 1, tables: {} })
    expect(v).toEqual({ ok: false, reason: 'not-workbench' })
  })

  it('损坏 JSON 结构（tables 缺失 / 表不是数组）→ corrupt', () => {
    expect(validateBackup({ app: BACKUP_APP, version: 1 })).toEqual({ ok: false, reason: 'corrupt' })
    expect(validateBackup({ app: BACKUP_APP, version: 1, tables: { tasks: 'oops' } })).toEqual({ ok: false, reason: 'corrupt' })
    expect(validateBackup('not an object')).toEqual({ ok: false, reason: 'corrupt' })
    expect(validateBackup([1, 2, 3])).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('version 非数字 → corrupt', () => {
    expect(validateBackup({ app: BACKUP_APP, version: 'v1', tables: {} })).toEqual({ ok: false, reason: 'corrupt' })
  })

  it('formatBytes 输出 B/KB/MB', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('backupFileName 生成 YYYYMMDD 文件名', () => {
    const d = new Date(2026, 7, 5) // 2026-08-05
    expect(backupFileName(d)).toBe('workbench-backup-20260805.json')
  })
  it('backupFileName 单月单日补零', () => {
    expect(backupFileName(new Date(2026, 0, 1))).toBe('workbench-backup-20260101.json')
  })
})
