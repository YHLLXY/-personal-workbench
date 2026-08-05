import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase-client'
import { genId, type WorkbenchRepository, type Task, type TaskInput, type Habit, type HabitLog, type FocusSession, type Exam, type ExamInput, type Note, type Paper, type HealthLog, type HealthLogInput, type Review, type Folder, type FolderInput, type BackupTables } from './types'

/** Supabase 行 -> 领域对象 的映射（snake_case -> camelCase） */
type Row = Record<string, unknown>

function taskFromRow(r: Row): Task {
  return { id: String(r.id), title: String(r.title), focus: Boolean(r.focus), priority: r.priority as Task['priority'], status: r.status as Task['status'], dueDate: r.due_date as string | null, tags: (r.tags as string[]) ?? [], sort: Number(r.sort ?? 0), completedAt: r.completed_at ? new Date(String(r.completed_at)).toISOString() : null, createdAt: String(r.created_at) }
}
function habitFromRow(r: Row): Habit { return { id: String(r.id), name: String(r.name), icon: String(r.icon), color: String(r.color), targetPerDay: Number(r.target_per_day), active: Boolean(r.active), createdAt: String(r.created_at) } }
function logFromRow(r: Row): HabitLog { return { id: String(r.id), habitId: String(r.habit_id), logDate: String(r.log_date), count: Number(r.count) } }
function focusFromRow(r: Row): FocusSession { return { id: String(r.id), startAt: String(r.start_at), minutes: Number(r.minutes), note: r.note as string | null } }
function examFromRow(r: Row): Exam { return { id: String(r.id), title: String(r.title), examDate: String(r.exam_date), subject: r.subject as string | null, note: r.note as string | null, createdAt: String(r.created_at) } }
function noteFromRow(r: Row): Note { return { id: String(r.id), content: String(r.content), tag: r.tag as string | null, archived: Boolean(r.archived), createdAt: String(r.created_at), updatedAt: String(r.updated_at) } }
function paperFromRow(r: Row): Paper {
  return {
    id: String(r.id), title: String(r.title), authors: String(r.authors),
    arxivId: r.arxiv_id as string | null, url: r.url as string | null,
    status: r.status as Paper['status'], rating: r.rating as number | null,
    note: r.note as string | null, createdAt: String(r.created_at),
    type: (r.type as Paper['type']) ?? 'paper',
    folderId: r.folder_id as string | null,
    tags: (r.tags as string[]) ?? [],
    content: r.content as string | null,
    summary: r.summary as string | null,
    keywords: (r.keywords as string[]) ?? [],
    source: r.source as string | null,
  }
}
function folderFromRow(r: Row): Folder {
  return { id: String(r.id), name: String(r.name), parentId: r.parent_id as string | null, sort: Number(r.sort ?? 0) }
}
function healthFromRow(r: Row): HealthLog { return { id: String(r.id), logDate: String(r.log_date), type: r.type as HealthLog['type'], value: Number(r.value) } }
function reviewFromRow(r: Row): Review { return { id: String(r.id), reviewDate: String(r.review_date), mood: Number(r.mood), summary: String(r.summary), planTomorrow: String(r.plan_tomorrow), updatedAt: String(r.updated_at) } }

function taskToRow(t: Task) { return { id: t.id, title: t.title, focus: t.focus, priority: t.priority, status: t.status, due_date: t.dueDate, tags: t.tags, sort: t.sort, completed_at: t.completedAt, created_at: t.createdAt } }
function habitToRow(h: Habit) { return { id: h.id, name: h.name, icon: h.icon, color: h.color, target_per_day: h.targetPerDay, active: h.active, created_at: h.createdAt } }
function logToRow(l: HabitLog) { return { id: l.id, habit_id: l.habitId, log_date: l.logDate, count: l.count } }
function focusToRow(s: FocusSession) { return { id: s.id, start_at: s.startAt, minutes: s.minutes, note: s.note } }
function examToRow(e: Exam) { return { id: e.id, title: e.title, exam_date: e.examDate, subject: e.subject, note: e.note, created_at: e.createdAt } }
function noteToRow(n: Note) { return { id: n.id, content: n.content, tag: n.tag, archived: n.archived, created_at: n.createdAt, updated_at: n.updatedAt } }
function paperToRow(p: Paper) { return { id: p.id, title: p.title, authors: p.authors, arxiv_id: p.arxivId, url: p.url, status: p.status, rating: p.rating, note: p.note, created_at: p.createdAt, type: p.type ?? 'paper', folder_id: p.folderId ?? null, tags: p.tags ?? [], content: p.content ?? null, summary: p.summary ?? null, keywords: p.keywords ?? [], source: p.source ?? null } }
function folderToRow(f: Folder) { return { id: f.id, name: f.name, parent_id: f.parentId, sort: f.sort } }
function healthToRow(l: HealthLog) { return { id: l.id, log_date: l.logDate, type: l.type, value: l.value } }
function reviewToRow(r: Review) { return { id: r.id, review_date: r.reviewDate, mood: r.mood, summary: r.summary, plan_tomorrow: r.planTomorrow, updated_at: r.updatedAt } }

/** 表名映射（备份表 -> Supabase 表） */
const TABLES: Record<keyof BackupTables, string> = {
  tasks: 'wb_tasks', habits: 'wb_habits', habitLogs: 'wb_habit_logs', focusSessions: 'wb_focus_sessions',
  exams: 'wb_exams', notes: 'wb_notes', papers: 'wb_papers', folders: 'wb_folders',
  healthLogs: 'wb_health_logs', reviews: 'wb_reviews',
}

const toRows: { [K in keyof BackupTables]: (rows: BackupTables[K]) => Record<string, unknown>[] } = {
  tasks: rs => rs.map(taskToRow), habits: rs => rs.map(habitToRow), habitLogs: rs => rs.map(logToRow),
  focusSessions: rs => rs.map(focusToRow), exams: rs => rs.map(examToRow), notes: rs => rs.map(noteToRow),
  papers: rs => rs.map(paperToRow), folders: rs => rs.map(folderToRow), healthLogs: rs => rs.map(healthToRow),
  reviews: rs => rs.map(reviewToRow),
}

function toSnake<K extends keyof BackupTables>(key: K, rows: BackupTables[K]): Record<string, unknown>[] {
  return toRows[key](rows)
}

export class SupabaseRepository implements WorkbenchRepository {
  private sb: SupabaseClient
  constructor() {
    this.sb = getSupabaseClient()
  }
  get client() { return this.sb }

  async listTasks() { const { data, error } = await this.sb.from('wb_tasks').select('*').order('sort', { ascending: false }); if (error) throw error; return (data ?? []).map(taskFromRow) }
  async createTask(input: TaskInput) {
    const { data, error } = await this.sb.from('wb_tasks').insert({ id: genId(), title: input.title, focus: input.focus ?? false, priority: input.priority ?? 'medium', status: input.status ?? 'todo', due_date: input.dueDate ?? null, tags: input.tags ?? [], sort: Date.now() }).select().single()
    if (error) throw error; return taskFromRow(data)
  }
  async updateTask(id: string, p: Partial<Task>) {
    // 注意：去掉冗余的 p.status !== 'done'（TS2367：第一分支已排除 'done'，后续比较类型无重叠；与 local-repository 逻辑一致）
    const { data, error } = await this.sb.from('wb_tasks').update({ title: p.title, focus: p.focus, priority: p.priority, status: p.status, due_date: p.dueDate, tags: p.tags, sort: p.sort, completed_at: p.status === 'done' ? new Date().toISOString() : p.status !== undefined ? null : p.completedAt }).eq('id', id).select().single()
    if (error) throw error; return taskFromRow(data)
  }
  async deleteTask(id: string) { const { error } = await this.sb.from('wb_tasks').delete().eq('id', id); if (error) throw error }

  async listHabits() { const { data, error } = await this.sb.from('wb_habits').select('*').order('created_at'); if (error) throw error; return (data ?? []).map(habitFromRow) }
  async createHabit(input: { name: string; icon?: string; color?: string; targetPerDay?: number }) {
    const { data, error } = await this.sb.from('wb_habits').insert({ id: genId(), name: input.name, icon: input.icon ?? '✓', color: input.color ?? '#5B8A72', target_per_day: input.targetPerDay ?? 1 }).select().single()
    if (error) throw error; return habitFromRow(data)
  }
  async updateHabit(id: string, p: Partial<Habit>) {
    const { data, error } = await this.sb.from('wb_habits').update({ name: p.name, icon: p.icon, color: p.color, target_per_day: p.targetPerDay, active: p.active }).eq('id', id).select().single()
    if (error) throw error; return habitFromRow(data)
  }
  async deleteHabit(id: string) { const { error } = await this.sb.from('wb_habits').delete().eq('id', id); if (error) throw error }
  async listHabitLogs() { const { data, error } = await this.sb.from('wb_habit_logs').select('*'); if (error) throw error; return (data ?? []).map(logFromRow) }
  async setHabitLog(habitId: string, logDate: string, count: number) {
    // 注意：迁移中 id 无默认值，insert 载荷必须带 id（质量审阅发现 I-2 修正）
    const { error } = await this.sb.from('wb_habit_logs').upsert({ id: genId(), habit_id: habitId, log_date: logDate, count }, { onConflict: 'habit_id,log_date' })
    if (error) throw error
  }

  async listFocusSessions() { const { data, error } = await this.sb.from('wb_focus_sessions').select('*').order('start_at', { ascending: false }); if (error) throw error; return (data ?? []).map(focusFromRow) }
  async createFocusSession(minutes: number, note?: string) {
    const { data, error } = await this.sb.from('wb_focus_sessions').insert({ id: genId(), minutes, note: note ?? null }).select().single()
    if (error) throw error; return focusFromRow(data)
  }

  async listExams() { const { data, error } = await this.sb.from('wb_exams').select('*').order('exam_date'); if (error) throw error; return (data ?? []).map(examFromRow) }
  async createExam(input: ExamInput) { const { data, error } = await this.sb.from('wb_exams').insert({ id: genId(), title: input.title, exam_date: input.examDate, subject: input.subject ?? null, note: input.note ?? null }).select().single(); if (error) throw error; return examFromRow(data) }
  async updateExam(id: string, p: Partial<Exam>) { const { data, error } = await this.sb.from('wb_exams').update({ title: p.title, exam_date: p.examDate, subject: p.subject, note: p.note }).eq('id', id).select().single(); if (error) throw error; return examFromRow(data) }
  async deleteExam(id: string) { const { error } = await this.sb.from('wb_exams').delete().eq('id', id); if (error) throw error }

  async listNotes() { const { data, error } = await this.sb.from('wb_notes').select('*').order('updated_at', { ascending: false }); if (error) throw error; return (data ?? []).map(noteFromRow) }
  async createNote(content: string, tag?: string | null) { const { data, error } = await this.sb.from('wb_notes').insert({ id: genId(), content, tag: tag ?? null }).select().single(); if (error) throw error; return noteFromRow(data) }
  async updateNote(id: string, p: Partial<Note>) { const { data, error } = await this.sb.from('wb_notes').update({ content: p.content, tag: p.tag, archived: p.archived }).eq('id', id).select().single(); if (error) throw error; return noteFromRow(data) }
  async deleteNote(id: string) { const { error } = await this.sb.from('wb_notes').delete().eq('id', id); if (error) throw error }

  async listPapers() { const { data, error } = await this.sb.from('wb_papers').select('*').order('created_at', { ascending: false }); if (error) throw error; return (data ?? []).map(paperFromRow) }
  async createPaper(input: Omit<Paper, 'id' | 'createdAt'>) {
    // 注意：wb_papers 列名为 arxiv_id（snake_case），不能直接展开 input（含 camelCase 的 arxivId 会触发 PGRST204）
    const { data, error } = await this.sb.from('wb_papers').insert({
      title: input.title, authors: input.authors, arxiv_id: input.arxivId, url: input.url,
      status: input.status, rating: input.rating, note: input.note,
      type: input.type ?? 'paper', folder_id: input.folderId ?? null,
      tags: input.tags ?? [], content: input.content ?? null,
      summary: input.summary ?? null, keywords: input.keywords ?? [], source: input.source ?? null,
      id: genId(),
    }).select().single()
    if (error) throw error; return paperFromRow(data)
  }
  async updatePaper(id: string, p: Partial<Paper>) {
    const { data, error } = await this.sb.from('wb_papers').update({
      title: p.title, authors: p.authors, arxiv_id: p.arxivId, url: p.url,
      status: p.status, rating: p.rating, note: p.note,
      type: p.type, folder_id: p.folderId, tags: p.tags, content: p.content,
      summary: p.summary, keywords: p.keywords, source: p.source,
    }).eq('id', id).select().single(); if (error) throw error; return paperFromRow(data)
  }
  async deletePaper(id: string) { const { error } = await this.sb.from('wb_papers').delete().eq('id', id); if (error) throw error }

  async listFolders() { const { data, error } = await this.sb.from('wb_folders').select('*').order('sort'); if (error) throw error; return (data ?? []).map(folderFromRow) }
  async createFolder(input: FolderInput) {
    const { data, error } = await this.sb.from('wb_folders').insert({ id: genId(), name: input.name, parent_id: input.parentId ?? null }).select().single()
    if (error) throw error; return folderFromRow(data)
  }
  async updateFolder(id: string, p: Partial<Pick<Folder, 'name' | 'sort'>>) {
    const { data, error } = await this.sb.from('wb_folders').update({ name: p.name, sort: p.sort }).eq('id', id).select().single()
    if (error) throw error; return folderFromRow(data)
  }
  async deleteFolder(id: string) {
    const { error: delErr } = await this.sb.from('wb_folders').delete().eq('id', id)
    if (delErr) throw delErr
    const { error: upErr } = await this.sb.from('wb_papers').update({ folder_id: null }).eq('folder_id', id)
    if (upErr) throw upErr
  }
  async moveFolder(id: string, newParentId: string | null) {
    const { data, error } = await this.sb.from('wb_folders').update({ parent_id: newParentId }).eq('id', id).select().single()
    if (error) throw error; return folderFromRow(data)
  }

  async listHealthLogs() { const { data, error } = await this.sb.from('wb_health_logs').select('*').order('log_date', { ascending: false }); if (error) throw error; return (data ?? []).map(healthFromRow) }
  async createHealthLog(input: HealthLogInput) { const { data, error } = await this.sb.from('wb_health_logs').insert({ id: genId(), log_date: input.logDate, type: input.type, value: input.value }).select().single(); if (error) throw error; return healthFromRow(data) }
  async deleteHealthLog(id: string) { const { error } = await this.sb.from('wb_health_logs').delete().eq('id', id); if (error) throw error }

  async listReviews() { const { data, error } = await this.sb.from('wb_reviews').select('*'); if (error) throw error; return (data ?? []).map(reviewFromRow) }
  async upsertReview(reviewDate: string, patch: { mood?: number; summary?: string; planTomorrow?: string }) {
    // 注意：迁移中 id 无默认值，insert 载荷必须带 id（质量审阅发现 I-2 修正）
    const { data, error } = await this.sb.from('wb_reviews').upsert({ id: genId(), review_date: reviewDate, ...patch }, { onConflict: 'user_id,review_date' }).select().single()
    if (error) throw error; return reviewFromRow(data)
  }

  async exportAll() {
    const [tasks, habits, habitLogs, focusSessions, exams, notes, papers, folders, healthLogs, reviews] = await Promise.all([
      this.listTasks(), this.listHabits(), this.listHabitLogs(), this.listFocusSessions(), this.listExams(),
      this.listNotes(), this.listPapers(), this.listFolders(), this.listHealthLogs(), this.listReviews(),
    ])
    return { tasks, habits, habitLogs, focusSessions, exams, notes, papers, folders, healthLogs, reviews }
  }

  async importAll(tables: BackupTables) {
    // 逐表独立 try：失败表报错，其余表保持已写入（幂等可重入）
    const errors: string[] = []
    await Promise.all((Object.keys(TABLES) as (keyof BackupTables)[]).map(async key => {
      const rows = toSnake(key, tables[key])
      try {
        // RLS 已限定 user_id = auth.uid()，delete().neq('id','') 安全清空本用户全部行
        const { error: delErr } = await this.sb.from(TABLES[key]).delete().neq('id', '')
        if (delErr) throw new Error(`清空失败: ${delErr.message}`)
      } catch (err) {
        errors.push(`${key}（清空）: ${err instanceof Error ? err.message : String(err)}`)
        return
      }
      if (rows.length === 0) return
      try {
        const { error: upErr } = await this.sb.from(TABLES[key]).upsert(rows)
        if (upErr) throw new Error(`写入失败: ${upErr.message}`)
      } catch (err) {
        errors.push(`${key}（写入）: ${err instanceof Error ? err.message : String(err)}`)
      }
    }))
    if (errors.length > 0) throw new Error(`部分表导入失败：${errors.join('；')}`)
  }
}
