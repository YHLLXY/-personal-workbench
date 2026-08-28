import type { BackupTables } from './db/types'
import { repository, isCloudMode } from './db'

export const BACKUP_APP = 'personal-workbench'
export const BACKUP_VERSION = 1

/** 备份文件（导出下载 / 导入校验的载体） */
export interface BackupFile {
  app: typeof BACKUP_APP
  version: number
  exportedAt: string
  mode: 'local' | 'cloud'
  tables: BackupTables
}

const TABLE_KEYS = ['tasks', 'habits', 'habitLogs', 'focusSessions', 'exams', 'studyGoals', 'notes', 'papers', 'folders', 'healthLogs', 'reviews', 'growthActions'] as const

export function buildBackup(tables: BackupTables, mode: 'local' | 'cloud'): BackupFile {
  return { app: BACKUP_APP, version: BACKUP_VERSION, exportedAt: new Date().toISOString(), mode, tables }
}

/** 导入前校验：app 防误导入他应用文件；version 可解析；10 张表均为数组 */
export function validateBackup(raw: unknown): { ok: true; tables: BackupTables } | { ok: false; reason: 'not-workbench' | 'corrupt' } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'corrupt' }
  const obj = raw as Record<string, unknown>
  if (obj.app !== BACKUP_APP) return { ok: false, reason: 'not-workbench' }
  if (typeof obj.version !== 'number' || !obj.tables || typeof obj.tables !== 'object') return { ok: false, reason: 'corrupt' }
  const tables = obj.tables as Record<string, unknown>
  for (const k of TABLE_KEYS) if (!Array.isArray(tables[k])) return { ok: false, reason: 'corrupt' }
  return { ok: true, tables: tables as unknown as BackupTables }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** 备份文件名：workbench-backup-YYYYMMDD.json */
export function backupFileName(d: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `workbench-backup-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.json`
}

/** 导出全部 10 张表并触发浏览器下载；失败抛错由调用方提示 */
export async function downloadBackupFile(): Promise<void> {
  const tables = await repository.exportAll()
  const file = buildBackup(tables, isCloudMode ? 'cloud' : 'local')
  const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = backupFileName()
  a.click()
  URL.revokeObjectURL(url)
}
