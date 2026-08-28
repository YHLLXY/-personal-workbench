import type { SupabaseClient } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase-client'
import { genId, localDateOfISO, type WorkbenchRepository, type Task, type TaskInput, type Habit, type HabitLog, type FocusSession, type Exam, type ExamInput, type Note, type Paper, type HealthLog, type HealthLogInput, type Review, type StudyGoal, type StudyGoalInput, type Folder, type FolderInput, type BackupTables, type Subscriptions, type Reminder, type PushSubscriptionRow, type ChannelConfigs, type ReminderKind, type GrowthAction, type GrowthActionInput } from './types'
import { assertNoCycle } from './folder-tree'

/** Supabase 行 -> 领域对象 的映射（snake_case -> camelCase） */
type Row = Record<string, unknown>

function taskFromRow(r: Row): Task {
  const t: Task = { id: String(r.id), title: String(r.title), focus: Boolean(r.focus), priority: r.priority as Task['priority'], status: r.status as Task['status'], dueDate: r.due_date as string | null, dueTime: r.due_time as string | null, focusDate: (r.focus_date as string | null) ?? null, tags: (r.tags as string[]) ?? [], sort: Number(r.sort ?? 0), completedAt: r.completed_at ? new Date(String(r.completed_at)).toISOString() : null, createdAt: String(r.created_at) }
  // 惰性迁移：老数据 focus=true 但无 focus_date → 绑定到创建日（本地时区），焦点任务不再永久显示（勿用 SQL 回填）
  if (t.focus && !t.focusDate) t.focusDate = localDateOfISO(t.createdAt)
  return t
}
function habitFromRow(r: Row): Habit { return { id: String(r.id), name: String(r.name), icon: String(r.icon), color: String(r.color), targetPerDay: Number(r.target_per_day), active: Boolean(r.active), createdAt: String(r.created_at) } }
function logFromRow(r: Row): HabitLog { return { id: String(r.id), habitId: String(r.habit_id), logDate: String(r.log_date), count: Number(r.count) } }
function focusFromRow(r: Row): FocusSession { return { id: String(r.id), startAt: String(r.start_at), minutes: Number(r.minutes), note: r.note as string | null } }
function examFromRow(r: Row): Exam { return { id: String(r.id), title: String(r.title), examDate: String(r.exam_date), examTime: r.exam_time as string | null, subject: r.subject as string | null, note: r.note as string | null, createdAt: String(r.created_at) } }
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
function goalFromRow(r: Row): StudyGoal {
  return { id: String(r.id), title: String(r.title), target: Number(r.target ?? 100), progress: Number(r.progress ?? 0), deadline: r.deadline as string | null, status: r.status as StudyGoal['status'] ?? 'active', note: r.note as string | null }
}
function folderFromRow(r: Row): Folder {
  return { id: String(r.id), name: String(r.name), parentId: r.parent_id as string | null, sort: Number(r.sort ?? 0) }
}
function healthFromRow(r: Row): HealthLog { return { id: String(r.id), logDate: String(r.log_date), type: r.type as HealthLog['type'], value: Number(r.value) } }
function reviewFromRow(r: Row): Review {
  // 新字段 ?? '' 兜底：迁移 005 之前的老行没有这些列值，读取不崩溃
  return {
    id: String(r.id), reviewDate: String(r.review_date), mood: Number(r.mood),
    achievements: String(r.achievements ?? ''), reflection: String(r.reflection ?? ''),
    gratitude: String(r.gratitude ?? ''), learnings: String(r.learnings ?? ''),
    summary: String(r.summary), planTomorrow: String(r.plan_tomorrow),
    score: r.score == null ? null : Number(r.score),
    updatedAt: String(r.updated_at),
  }
}
function growthFromRow(r: Row): GrowthAction {
  // steps/targets 存 JSON 数组字符串（text），解析失败按空数组兜底
  const parseList = (raw: unknown): string[] => { try { const v = JSON.parse(String(raw ?? '[]')); return Array.isArray(v) ? v.map(String) : [] } catch { return [] } }
  return {
    id: String(r.id), no: Number(r.no), title: String(r.title), emoji: String(r.emoji), category: String(r.category),
    why: String(r.why ?? ''), steps: parseList(r.steps), targets: parseList(r.targets), verify: String(r.verify ?? ''),
    habitId: r.habit_id ? String(r.habit_id) : null, status: (r.status as GrowthAction['status']) ?? 'active',
    sort: Number(r.sort ?? 0), createdAt: String(r.created_at),
  }
}
function reminderFromRow(r: Row): Reminder {
  return { id: String(r.id), refType: r.ref_type as Reminder['refType'], refId: String(r.ref_id), kind: r.kind as ReminderKind, scheduledAt: String(r.scheduled_at), sentAt: r.sent_at ? String(r.sent_at) : null, dismissedAt: r.dismissed_at ? String(r.dismissed_at) : null, createdAt: String(r.created_at) }
}
function pushSubFromRow(r: Row): PushSubscriptionRow {
  return { id: String(r.id), endpoint: String(r.endpoint), keysP256dh: String(r.keys_p256dh), keysAuth: String(r.keys_auth), userAgent: r.user_agent as string | null, createdAt: String(r.created_at) }
}

function taskToRow(t: Task) { return { id: t.id, title: t.title, focus: t.focus, priority: t.priority, status: t.status, due_date: t.dueDate, due_time: t.dueTime, focus_date: t.focusDate, tags: t.tags, sort: t.sort, completed_at: t.completedAt, created_at: t.createdAt } }
function habitToRow(h: Habit) { return { id: h.id, name: h.name, icon: h.icon, color: h.color, target_per_day: h.targetPerDay, active: h.active, created_at: h.createdAt } }
function logToRow(l: HabitLog) { return { id: l.id, habit_id: l.habitId, log_date: l.logDate, count: l.count } }
function focusToRow(s: FocusSession) { return { id: s.id, start_at: s.startAt, minutes: s.minutes, note: s.note } }
function examToRow(e: Exam) { return { id: e.id, title: e.title, exam_date: e.examDate, exam_time: e.examTime, subject: e.subject, note: e.note, created_at: e.createdAt } }
function noteToRow(n: Note) { return { id: n.id, content: n.content, tag: n.tag, archived: n.archived, created_at: n.createdAt, updated_at: n.updatedAt } }
function paperToRow(p: Paper) { return { id: p.id, title: p.title, authors: p.authors, arxiv_id: p.arxivId, url: p.url, status: p.status, rating: p.rating, note: p.note, created_at: p.createdAt, type: p.type ?? 'paper', folder_id: p.folderId ?? null, tags: p.tags ?? [], content: p.content ?? null, summary: p.summary ?? null, keywords: p.keywords ?? [], source: p.source ?? null } }
function goalToRow(g: StudyGoal) { return { id: g.id, title: g.title, target: g.target, progress: g.progress, deadline: g.deadline, status: g.status, note: g.note } }
function folderToRow(f: Folder) { return { id: f.id, name: f.name, parent_id: f.parentId, sort: f.sort } }
function healthToRow(l: HealthLog) { return { id: l.id, log_date: l.logDate, type: l.type, value: l.value } }
function reviewToRow(r: Review) { return { id: r.id, review_date: r.reviewDate, mood: r.mood, achievements: r.achievements, reflection: r.reflection, gratitude: r.gratitude, learnings: r.learnings, summary: r.summary, plan_tomorrow: r.planTomorrow, score: r.score, updated_at: r.updatedAt } }
function growthToRow(g: GrowthAction) { return { id: g.id, no: g.no, title: g.title, emoji: g.emoji, category: g.category, why: g.why, steps: JSON.stringify(g.steps), targets: JSON.stringify(g.targets), verify: g.verify, habit_id: g.habitId, status: g.status, sort: g.sort, created_at: g.createdAt } }

/** 表名映射（备份表 -> Supabase 表） */
const TABLES: Record<keyof BackupTables, string> = {
  tasks: 'wb_tasks', habits: 'wb_habits', habitLogs: 'wb_habit_logs', focusSessions: 'wb_focus_sessions',
  exams: 'wb_exams', studyGoals: 'wb_study_goals', notes: 'wb_notes', papers: 'wb_papers', folders: 'wb_folders',
  healthLogs: 'wb_health_logs', reviews: 'wb_reviews', growthActions: 'wb_growth_actions',
}

const toRows: { [K in keyof BackupTables]: (rows: BackupTables[K]) => Record<string, unknown>[] } = {
  tasks: rs => rs.map(taskToRow), habits: rs => rs.map(habitToRow), habitLogs: rs => rs.map(logToRow),
  focusSessions: rs => rs.map(focusToRow), exams: rs => rs.map(examToRow), studyGoals: rs => rs.map(goalToRow),
  notes: rs => rs.map(noteToRow), papers: rs => rs.map(paperToRow), folders: rs => rs.map(folderToRow),
  healthLogs: rs => rs.map(healthToRow), reviews: rs => rs.map(reviewToRow), growthActions: rs => rs.map(growthToRow),
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
    const { data, error } = await this.sb.from('wb_tasks').insert({ id: genId(), title: input.title, focus: input.focus ?? false, priority: input.priority ?? 'medium', status: input.status ?? 'todo', due_date: input.dueDate ?? null, due_time: input.dueTime ?? null, focus_date: input.focusDate ?? null, tags: input.tags ?? [], sort: Date.now() }).select().single()
    if (error) throw error; return taskFromRow(data)
  }
  async updateTask(id: string, p: Partial<Task>) {
    // 注意：去掉冗余的 p.status !== 'done'（TS2367：第一分支已排除 'done'，后续比较类型无重叠；与 local-repository 逻辑一致）
    const { data, error } = await this.sb.from('wb_tasks').update({ title: p.title, focus: p.focus, priority: p.priority, status: p.status, due_date: p.dueDate, due_time: p.dueTime, focus_date: p.focusDate, tags: p.tags, sort: p.sort, completed_at: p.status === 'done' ? new Date().toISOString() : p.status !== undefined ? null : p.completedAt }).eq('id', id).select().single()
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
  async deleteHabit(id: string) {
    const { error } = await this.sb.from('wb_habits').delete().eq('id', id)
    if (error) throw error
    // 联动：自我提升行动解除与已删习惯的关联（避免悬空 habitId）
    const { error: gaErr } = await this.sb.from('wb_growth_actions').update({ habit_id: null }).eq('habit_id', id)
    if (gaErr) throw gaErr
  }
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
  async createExam(input: ExamInput) { const { data, error } = await this.sb.from('wb_exams').insert({ id: genId(), title: input.title, exam_date: input.examDate, exam_time: input.examTime ?? null, subject: input.subject ?? null, note: input.note ?? null }).select().single(); if (error) throw error; return examFromRow(data) }
  async updateExam(id: string, p: Partial<Exam>) { const { data, error } = await this.sb.from('wb_exams').update({ title: p.title, exam_date: p.examDate, exam_time: p.examTime, subject: p.subject, note: p.note }).eq('id', id).select().single(); if (error) throw error; return examFromRow(data) }
  async deleteExam(id: string) { const { error } = await this.sb.from('wb_exams').delete().eq('id', id); if (error) throw error }

  async listStudyGoals() { const { data, error } = await this.sb.from('wb_study_goals').select('*').order('created_at'); if (error) throw error; return (data ?? []).map(goalFromRow) }
  async createStudyGoal(input: StudyGoalInput) {
    const { data, error } = await this.sb.from('wb_study_goals').insert({ id: genId(), title: input.title, target: input.target ?? 100, progress: 0, deadline: input.deadline ?? null, status: 'active', note: input.note ?? null }).select().single()
    if (error) throw error; return goalFromRow(data)
  }
  async updateStudyGoal(id: string, p: Partial<StudyGoal>) {
    const { data, error } = await this.sb.from('wb_study_goals').update({ title: p.title, target: p.target, progress: p.progress, deadline: p.deadline, status: p.status, note: p.note }).eq('id', id).select().single()
    if (error) throw error; return goalFromRow(data)
  }
  async deleteStudyGoal(id: string) { const { error } = await this.sb.from('wb_study_goals').delete().eq('id', id); if (error) throw error }

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
    const { data: allFolders, error: fetchErr } = await this.sb.from('wb_folders').select('id, parent_id')
    if (fetchErr) throw fetchErr
    const folders = (allFolders ?? []).map(f => ({ id: String(f.id), parentId: f.parent_id as string | null, name: '', sort: 0 })) as Folder[]
    assertNoCycle(folders, id, newParentId)
    const { data, error } = await this.sb.from('wb_folders').update({ parent_id: newParentId }).eq('id', id).select().single()
    if (error) throw error; return folderFromRow(data)
  }

  async listHealthLogs() { const { data, error } = await this.sb.from('wb_health_logs').select('*').order('log_date', { ascending: false }); if (error) throw error; return (data ?? []).map(healthFromRow) }
  async createHealthLog(input: HealthLogInput) { const { data, error } = await this.sb.from('wb_health_logs').insert({ id: genId(), log_date: input.logDate, type: input.type, value: input.value }).select().single(); if (error) throw error; return healthFromRow(data) }
  async deleteHealthLog(id: string) { const { error } = await this.sb.from('wb_health_logs').delete().eq('id', id); if (error) throw error }

  async listReviews() { const { data, error } = await this.sb.from('wb_reviews').select('*'); if (error) throw error; return (data ?? []).map(reviewFromRow) }
  async upsertReview(reviewDate: string, patch: { mood?: number; summary?: string; planTomorrow?: string; achievements?: string; reflection?: string; gratitude?: string; learnings?: string; score?: number | null }) {
    // 注意：迁移中 id 无默认值，insert 载荷必须带 id（质量审阅发现 I-2 修正）
    // 注意：载荷必须 snake_case（plan_tomorrow）——直接展开 patch 会把 planTomorrow 当列名触发 PGRST204 保存失败（2026-08-08 线上排障）
    const { data, error } = await this.sb.from('wb_reviews').upsert({ id: genId(), review_date: reviewDate, mood: patch.mood, achievements: patch.achievements, reflection: patch.reflection, gratitude: patch.gratitude, learnings: patch.learnings, summary: patch.summary, plan_tomorrow: patch.planTomorrow, score: patch.score ?? null }, { onConflict: 'user_id,review_date' }).select().single()
    if (error) throw error; return reviewFromRow(data)
  }

  async listGrowthActions() { const { data, error } = await this.sb.from('wb_growth_actions').select('*').order('sort'); if (error) throw error; return (data ?? []).map(growthFromRow) }
  async createGrowthAction(input: GrowthActionInput) {
    const { data, error } = await this.sb.from('wb_growth_actions').insert({
      id: genId(), no: input.no, title: input.title, emoji: input.emoji, category: input.category,
      why: input.why, steps: JSON.stringify(input.steps), targets: JSON.stringify(input.targets),
      verify: input.verify, habit_id: input.habitId ?? null, status: 'active', sort: input.no,
    }).select().single()
    if (error) throw error; return growthFromRow(data)
  }
  async updateGrowthAction(id: string, p: Partial<GrowthAction>) {
    const { data, error } = await this.sb.from('wb_growth_actions').update({
      title: p.title, emoji: p.emoji, category: p.category, why: p.why,
      steps: p.steps !== undefined ? JSON.stringify(p.steps) : undefined,
      targets: p.targets !== undefined ? JSON.stringify(p.targets) : undefined,
      verify: p.verify, habit_id: p.habitId, status: p.status, sort: p.sort,
    }).eq('id', id).select().single()
    if (error) throw error; return growthFromRow(data)
  }
  async deleteGrowthAction(id: string) { const { error } = await this.sb.from('wb_growth_actions').delete().eq('id', id); if (error) throw error }

  async exportAll() {
    const [tasks, habits, habitLogs, focusSessions, exams, studyGoals, notes, papers, folders, healthLogs, reviews, growthActions] = await Promise.all([
      this.listTasks(), this.listHabits(), this.listHabitLogs(), this.listFocusSessions(), this.listExams(),
      this.listStudyGoals(), this.listNotes(), this.listPapers(), this.listFolders(), this.listHealthLogs(), this.listReviews(), this.listGrowthActions(),
    ])
    return { tasks, habits, habitLogs, focusSessions, exams, studyGoals, notes, papers, folders, healthLogs, reviews, growthActions }
  }

  async importAll(tables: BackupTables) {
    // 逐表独立 try：失败表报错，其余表保持已写入（幂等可重入）
    const errors: string[] = []
    await Promise.all((Object.keys(TABLES) as (keyof BackupTables)[]).map(async key => {
      // ?? [] 守卫：旧备份文件没有 studyGoals 等新 key 时按空表处理，不抛错
      const rows = toSnake(key, tables[key] ?? [])
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

  async getSubscriptions(): Promise<Subscriptions> {
    const { data, error } = await this.sb.from('wb_subscriptions').select('*').maybeSingle()
    if (error) throw error
    if (!data) return { sourceIds: [], topics: [] }
    return { sourceIds: (data.source_ids as string[]) ?? [], topics: (data.topics as string[]) ?? [] }
  }
  async saveSubscriptions(s: Subscriptions) {
    // upsert 需带 user_id 才能命中 onConflict（主键 user_id）；RLS insert with check 放行本人
    const { data: user } = await this.sb.auth.getUser()
    const { error } = await this.sb.from('wb_subscriptions')
      .upsert({ user_id: user.user?.id ?? '', source_ids: s.sourceIds, topics: s.topics, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) throw error
  }

  async listReminders() { const { data, error } = await this.sb.from('wb_reminders').select('*').order('scheduled_at', { ascending: false }); if (error) throw error; return (data ?? []).map(reminderFromRow) }
  async dismissReminder(id: string) { const { error } = await this.sb.from('wb_reminders').update({ dismissed_at: new Date().toISOString() }).eq('id', id); if (error) throw error }
  async restoreReminder(id: string) { const { error } = await this.sb.from('wb_reminders').update({ dismissed_at: null }).eq('id', id); if (error) throw error }
  async listPushSubscriptions() { const { data, error } = await this.sb.from('wb_push_subscriptions').select('*'); if (error) throw error; return (data ?? []).map(pushSubFromRow) }
  async savePushSubscription(input: { endpoint: string; keysP256dh: string; keysAuth: string; userAgent?: string }) {
    const { error } = await this.sb.from('wb_push_subscriptions')
      .upsert({ id: genId(), endpoint: input.endpoint, keys_p256dh: input.keysP256dh, keys_auth: input.keysAuth, user_agent: input.userAgent ?? null }, { onConflict: 'user_id,endpoint' })
    if (error) throw error
  }
  async removePushSubscription(endpoint: string) { const { error } = await this.sb.from('wb_push_subscriptions').delete().eq('endpoint', endpoint); if (error) throw error }
  async getChannelConfigs(): Promise<ChannelConfigs> {
    const { data, error } = await this.sb.from('wb_channel_configs').select('*').maybeSingle()
    if (error) throw error
    if (!data) return { serverchanKey: null }
    return { serverchanKey: (data.serverchan_key as string | null) ?? null }
  }
  async saveChannelConfigs(c: ChannelConfigs) {
    const { data: user } = await this.sb.auth.getUser()
    const { error } = await this.sb.from('wb_channel_configs')
      .upsert({ user_id: user.user?.id ?? '', serverchan_key: c.serverchanKey ?? null, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
    if (error) throw error
  }
}
