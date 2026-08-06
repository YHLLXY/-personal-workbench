import { genId, type WorkbenchRepository, type Task, type TaskInput, type Habit, type HabitLog, type FocusSession, type Exam, type ExamInput, type Note, type Paper, type HealthLog, type HealthLogInput, type Review, type Folder, type FolderInput, type BackupTables, type Subscriptions } from './types'

const PREFIX = 'wb:'
function read<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(PREFIX + key) ?? '[]') as T[] } catch { return [] }
}
function write<T>(key: string, rows: T[]) {
  localStorage.setItem(PREFIX + key, JSON.stringify(rows))
}
function insert<T extends { id: string }>(key: string, row: T): T {
  const rows = read<T>(key); rows.unshift(row); write(key, rows); return row
}
function patch<T extends { id: string }>(key: string, id: string, p: Partial<T>): T {
  const rows = read<T>(key); const i = rows.findIndex(r => r.id === id)
  if (i < 0) throw new Error(`not found: ${id}`)
  rows[i] = { ...rows[i], ...p } as T; write(key, rows); return rows[i]
}
function remove(key: string, id: string) { write(key, read<{ id: string }>(key).filter(r => r.id !== id)) }

export class LocalRepository implements WorkbenchRepository {
  async listTasks() { return read<Task>('tasks') }
  async createTask(input: TaskInput) {
    return insert<Task>('tasks', { id: genId(), title: input.title, focus: input.focus ?? false, priority: input.priority ?? 'medium', status: input.status ?? 'todo', dueDate: input.dueDate ?? null, tags: input.tags ?? [], sort: Date.now(), completedAt: null, createdAt: new Date().toISOString() })
  }
  async updateTask(id: string, p: Partial<Task>) {
    const rows = read<Task>('tasks')
    const i = rows.findIndex(r => r.id === id)
    if (i < 0) throw new Error(`not found: ${id}`)
    const completedAt = p.status === 'done'
      ? new Date().toISOString()
      : p.status !== undefined ? null
      : p.completedAt !== undefined ? p.completedAt
      : rows[i].completedAt ?? null
    rows[i] = { ...rows[i], ...p, completedAt }
    write('tasks', rows)
    return rows[i]
  }
  async deleteTask(id: string) { remove('tasks', id) }

  async listHabits() { return read<Habit>('habits') }
  async createHabit(input: { name: string; icon?: string; color?: string; targetPerDay?: number }) {
    return insert<Habit>('habits', { id: genId(), name: input.name, icon: input.icon ?? '✓', color: input.color ?? '#5B8A72', targetPerDay: input.targetPerDay ?? 1, active: true, createdAt: new Date().toISOString() })
  }
  async updateHabit(id: string, p: Partial<Habit>) { return patch<Habit>('habits', id, p) }
  async deleteHabit(id: string) { remove('habits', id); write('habitLogs', read<HabitLog>('habitLogs').filter(l => l.habitId !== id)) }
  async listHabitLogs() { return read<HabitLog>('habitLogs') }
  async setHabitLog(habitId: string, logDate: string, count: number) {
    const rows = read<HabitLog>('habitLogs')
    const i = rows.findIndex(r => r.habitId === habitId && r.logDate === logDate)
    if (i >= 0) { rows[i] = { ...rows[i], count }; write('habitLogs', rows) }
    else insert<HabitLog>('habitLogs', { id: genId(), habitId, logDate, count })
  }

  async listFocusSessions() { return read<FocusSession>('focusSessions') }
  async createFocusSession(minutes: number, note?: string) {
    return insert<FocusSession>('focusSessions', { id: genId(), startAt: new Date().toISOString(), minutes, note: note ?? null })
  }

  async listExams() { return read<Exam>('exams') }
  async createExam(input: ExamInput) { return insert<Exam>('exams', { id: genId(), title: input.title, examDate: input.examDate, subject: input.subject ?? null, note: input.note ?? null, createdAt: new Date().toISOString() }) }
  async updateExam(id: string, p: Partial<Exam>) { return patch<Exam>('exams', id, p) }
  async deleteExam(id: string) { remove('exams', id) }

  async listNotes() { return read<Note>('notes') }
  async createNote(content: string, tag?: string | null) {
    const now = new Date().toISOString()
    return insert<Note>('notes', { id: genId(), content, tag: tag ?? null, archived: false, createdAt: now, updatedAt: now })
  }
  async updateNote(id: string, p: Partial<Note>) {
    return patch<Note>('notes', id, { ...p, updatedAt: new Date().toISOString() })
  }
  async deleteNote(id: string) { remove('notes', id) }

  async listPapers() {
    // 兼容 v1.0 旧数据：新字段补默认值，读取不崩溃
    return read<Paper>('papers').map(p => ({
      type: 'paper' as const, folderId: null, tags: [], keywords: [], content: null, summary: null, source: null,
      ...p,
    }))
  }
  async createPaper(input: Omit<Paper, 'id' | 'createdAt'>) {
    return insert<Paper>('papers', { ...input, type: input.type ?? 'paper', folderId: input.folderId ?? null, tags: input.tags ?? [], keywords: input.keywords ?? [], content: input.content ?? null, summary: input.summary ?? null, source: input.source ?? null, id: genId(), createdAt: new Date().toISOString() })
  }
  async updatePaper(id: string, p: Partial<Paper>) { return patch<Paper>('papers', id, p) }
  async deletePaper(id: string) { remove('papers', id) }

  async listFolders() { return read<Folder>('folders') }
  async createFolder(input: FolderInput) {
    return insert<Folder>('folders', { id: genId(), name: input.name, parentId: input.parentId ?? null, sort: Date.now() })
  }
  async updateFolder(id: string, p: Partial<Pick<Folder, 'name' | 'sort'>>) { return patch<Folder>('folders', id, p) }
  async deleteFolder(id: string) {
    // 防误删：资料移入未分类，子文件夹一并删除（级联子树）
    const folders = read<Folder>('folders')
    const children = new Set([id])
    let grew = true
    while (grew) {
      grew = false
      for (const f of folders) if (children.has(f.parentId ?? '') && !children.has(f.id)) { children.add(f.id); grew = true }
    }
    write('folders', folders.filter(f => !children.has(f.id)))
    // 该文件夹子树下的资料全部移到未分类
    const papers = read<Paper>('papers')
    for (const p of papers) if (p.folderId && children.has(p.folderId)) p.folderId = null
    write('papers', papers)
  }
  async moveFolder(id: string, newParentId: string | null) {
    if (newParentId === id) throw new Error('不能移动到自身')
    return patch<Folder>('folders', id, { parentId: newParentId })
  }

  async listHealthLogs() { return read<HealthLog>('healthLogs') }
  async createHealthLog(input: HealthLogInput) { return insert<HealthLog>('healthLogs', { id: genId(), ...input }) }
  async deleteHealthLog(id: string) { remove('healthLogs', id) }

  async listReviews() { return read<Review>('reviews') }
  async upsertReview(reviewDate: string, patch: { mood?: number; summary?: string; planTomorrow?: string }) {
    const rows = read<Review>('reviews')
    const i = rows.findIndex(r => r.reviewDate === reviewDate)
    if (i >= 0) { rows[i] = { ...rows[i], ...patch, updatedAt: new Date().toISOString() }; write('reviews', rows); return rows[i] }
    const r: Review = { id: genId(), reviewDate, mood: patch.mood ?? 3, summary: patch.summary ?? '', planTomorrow: patch.planTomorrow ?? '', updatedAt: new Date().toISOString() }
    return insert<Review>('reviews', r)
  }

  async exportAll() {
    const [tasks, habits, habitLogs, focusSessions, exams, notes, papers, folders, healthLogs, reviews] = await Promise.all([
      this.listTasks(), this.listHabits(), this.listHabitLogs(), this.listFocusSessions(), this.listExams(),
      this.listNotes(), this.listPapers(), this.listFolders(), this.listHealthLogs(), this.listReviews(),
    ])
    return { tasks, habits, habitLogs, focusSessions, exams, notes, papers, folders, healthLogs, reviews }
  }

  async importAll(tables: BackupTables) {
    // 快照旧数据（仅 wb: 前缀，不动其他应用 key）
    const snapshot = new Map<string, string>()
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (k && k.startsWith(PREFIX)) snapshot.set(k, localStorage.getItem(k) ?? '')
    }
    try {
      const entries: Array<[string, unknown[]]> = [
        ['tasks', tables.tasks], ['habits', tables.habits], ['habitLogs', tables.habitLogs],
        ['focusSessions', tables.focusSessions], ['exams', tables.exams], ['notes', tables.notes],
        ['papers', tables.papers], ['folders', tables.folders], ['healthLogs', tables.healthLogs],
        ['reviews', tables.reviews],
      ]
      for (const [key, rows] of entries) localStorage.setItem(PREFIX + key, JSON.stringify(rows))
    } catch (err) {
      // 回滚：清除全部 wb: 前缀 key，恢复快照（恢复失败仅记录，不掩盖原始错误）
      try {
        const toRemove: string[] = []
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i)
          if (k && k.startsWith(PREFIX)) toRemove.push(k)
        }
        for (const k of toRemove) localStorage.removeItem(k)
        for (const [k, v] of snapshot) localStorage.setItem(k, v)
      } catch (restoreErr) {
        console.error('导入失败后快照恢复失败', restoreErr)
      }
      throw err
    }
  }

  async getSubscriptions(): Promise<Subscriptions> {
    try {
      const raw = localStorage.getItem('wb:subscriptions')
      if (!raw) return { sourceIds: [], topics: [] }
      const p = JSON.parse(raw) as Partial<Subscriptions>
      return {
        sourceIds: Array.isArray(p.sourceIds) ? p.sourceIds : [],
        topics: Array.isArray(p.topics) ? p.topics : [],
      }
    } catch { return { sourceIds: [], topics: [] } }
  }
  async saveSubscriptions(s: Subscriptions) {
    localStorage.setItem('wb:subscriptions', JSON.stringify(s))
  }
}
