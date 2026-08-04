import { genId, type WorkbenchRepository, type Task, type TaskInput, type Habit, type HabitLog, type FocusSession, type Exam, type ExamInput, type Note, type Paper, type HealthLog, type HealthLogInput, type Review } from './types'

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
    const completedAt = p.status === undefined ? p.completedAt : p.status === 'done' ? new Date().toISOString() : null
    return patch<Task>('tasks', id, { ...p, completedAt })
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

  async listPapers() { return read<Paper>('papers') }
  async createPaper(input: Omit<Paper, 'id' | 'createdAt'>) { return insert<Paper>('papers', { ...input, id: genId(), createdAt: new Date().toISOString() }) }
  async updatePaper(id: string, p: Partial<Paper>) { return patch<Paper>('papers', id, p) }
  async deletePaper(id: string) { remove('papers', id) }

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
}
