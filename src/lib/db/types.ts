export interface Task {
  id: string
  title: string
  focus: boolean
  priority: 'high' | 'medium' | 'low'
  status: 'todo' | 'doing' | 'done' | 'someday'
  dueDate: string | null   // YYYY-MM-DD
  dueTime: string | null  // HH:mm 可选，到期提醒时间
  focusDate: string | null // YYYY-MM-DD，焦点绑定日期（今日焦点只在其绑定日显示）
  tags: string[]
  sort: number
  completedAt: string | null
  createdAt: string        // ISO
}
export interface TaskInput { title: string; focus?: boolean; priority?: Task['priority']; status?: Task['status']; dueDate?: string | null; dueTime?: string | null; focusDate?: string | null; tags?: string[] }

export interface Habit { id: string; name: string; icon: string; color: string; targetPerDay: number; active: boolean; createdAt: string }
export interface HabitLog { id: string; habitId: string; logDate: string; count: number }

export interface FocusSession { id: string; startAt: string; minutes: number; note: string | null }

export interface Exam {
  id: string
  title: string
  examDate: string
  examTime: string | null  // HH:mm 可选（考前 1 小时提醒必需）
  subject: string | null
  note: string | null
  createdAt: string
}
export interface ExamInput { title: string; examDate: string; examTime?: string | null; subject?: string | null; note?: string | null }

export interface Note { id: string; content: string; tags: string[]; archived: boolean; pinned: boolean; createdAt: string; updatedAt: string }

export interface Paper {
  id: string; title: string; authors: string; arxivId: string | null; url: string | null; status: 'want' | 'reading' | 'done'; rating: number | null; note: string | null; createdAt: string
  // v1.1 资料库扩展（可选——兼容旧数据与旧调用）
  type?: 'paper' | 'note'
  folderId?: string | null
  tags?: string[]
  content?: string | null
  finishedAt?: string | null  // 状态改为「读完」时由仓储层写入
  summary?: string | null
  keywords?: string[]
  source?: string | null
}

export interface Folder { id: string; name: string; parentId: string | null; sort: number }
export interface FolderInput { name: string; parentId?: string | null }

export interface HealthLog { id: string; logDate: string; type: 'weight' | 'sleep' | 'exercise'; value: number }
export interface HealthLogInput { logDate: string; type: HealthLog['type']; value: number }

export interface Review {
  id: string
  reviewDate: string
  mood: number
  achievements: string
  reflection: string
  gratitude: string
  learnings: string
  summary: string
  planTomorrow: string
  score: number | null  // 今日评分 1-10，可留空
  updatedAt: string
}

/** 学习目标：进度条 + 截止日 + 完成归档（v1.5 学习管理增强） */
export interface StudyGoal {
  id: string
  title: string
  target: number      // 目标量（默认 100）
  progress: number    // 当前进度
  deadline: string | null  // YYYY-MM-DD
  status: 'active' | 'done'
  note: string | null
  completedAt: string | null  // 归档时间（仓储层维护，恢复时清空）
}
export interface StudyGoalInput { title: string; target?: number; deadline?: string | null; note?: string | null }

/** 今日热点订阅配置：空 sourceIds = 订阅全部源 */
export interface Subscriptions { sourceIds: string[]; topics: string[] }

/** 自我提升行动（v1.7）：元数据 + 关联打卡习惯；steps/targets 为 JSON 数组字符串 */
export interface GrowthAction {
  id: string
  no: number
  title: string
  emoji: string
  category: string
  why: string
  steps: string[]
  targets: string[]
  verify: string
  habitId: string | null
  status: 'active' | 'paused' | 'done'
  sort: number
  createdAt: string
}
export interface GrowthActionInput {
  no: number
  title: string
  emoji: string
  category: string
  why: string
  steps: string[]
  targets: string[]
  verify: string
  habitId?: string | null
}

export type ReminderKind = 'due' | 'exam-3d' | 'exam-1d' | 'exam-1h' | 'goal-3d' | 'goal-due'
export interface Reminder {
  id: string
  refType: 'task' | 'exam' | 'goal'
  refId: string
  kind: ReminderKind
  scheduledAt: string   // UTC ISO
  sentAt: string | null
  dismissedAt: string | null
  createdAt: string
}
export interface PushSubscriptionRow { id: string; endpoint: string; keysP256dh: string; keysAuth: string; userAgent: string | null; createdAt: string }
export interface ChannelConfigs { serverchanKey: string | null }

export interface WorkbenchRepository {
  listTasks(): Promise<Task[]>
  createTask(input: TaskInput): Promise<Task>
  updateTask(id: string, patch: Partial<Task>): Promise<Task>
  deleteTask(id: string): Promise<void>

  listHabits(): Promise<Habit[]>
  createHabit(input: { name: string; icon?: string; color?: string; targetPerDay?: number }): Promise<Habit>
  updateHabit(id: string, patch: Partial<Habit>): Promise<Habit>
  deleteHabit(id: string): Promise<void>
  listHabitLogs(): Promise<HabitLog[]>
  setHabitLog(habitId: string, logDate: string, count: number): Promise<void>

  listFocusSessions(): Promise<FocusSession[]>
  createFocusSession(minutes: number, note?: string): Promise<FocusSession>

  listExams(): Promise<Exam[]>
  createExam(input: ExamInput): Promise<Exam>
  updateExam(id: string, patch: Partial<Exam>): Promise<Exam>
  deleteExam(id: string): Promise<void>

  listStudyGoals(): Promise<StudyGoal[]>
  createStudyGoal(input: StudyGoalInput): Promise<StudyGoal>
  updateStudyGoal(id: string, patch: Partial<StudyGoal>): Promise<StudyGoal>
  deleteStudyGoal(id: string): Promise<void>

  listNotes(): Promise<Note[]>
  createNote(content: string, tag?: string | null): Promise<Note>
  updateNote(id: string, patch: Partial<Note>): Promise<Note>
  deleteNote(id: string): Promise<void>

  listPapers(): Promise<Paper[]>
  createPaper(input: Omit<Paper, 'id' | 'createdAt'>): Promise<Paper>
  updatePaper(id: string, patch: Partial<Paper>): Promise<Paper>
  deletePaper(id: string): Promise<void>

  listFolders(): Promise<Folder[]>
  createFolder(input: FolderInput): Promise<Folder>
  updateFolder(id: string, patch: Partial<Pick<Folder, 'name' | 'sort'>>): Promise<Folder>
  deleteFolder(id: string): Promise<void>
  moveFolder(id: string, newParentId: string | null): Promise<Folder>

  listHealthLogs(): Promise<HealthLog[]>
  createHealthLog(input: HealthLogInput): Promise<HealthLog>
  deleteHealthLog(id: string): Promise<void>

  listGrowthActions(): Promise<GrowthAction[]>
  createGrowthAction(input: GrowthActionInput): Promise<GrowthAction>
  updateGrowthAction(id: string, patch: Partial<GrowthAction>): Promise<GrowthAction>
  deleteGrowthAction(id: string): Promise<void>

  listReviews(): Promise<Review[]>
  upsertReview(reviewDate: string, patch: { mood?: number; summary?: string; planTomorrow?: string; achievements?: string; reflection?: string; gratitude?: string; learnings?: string; score?: number | null }): Promise<Review>

  exportAll(): Promise<BackupTables>
  getSubscriptions(): Promise<Subscriptions>
  saveSubscriptions(s: Subscriptions): Promise<void>

  listReminders(): Promise<Reminder[]>
  dismissReminder(id: string): Promise<void>
  restoreReminder(id: string): Promise<void>
  listPushSubscriptions(): Promise<PushSubscriptionRow[]>
  savePushSubscription(input: { endpoint: string; keysP256dh: string; keysAuth: string; userAgent?: string }): Promise<void>
  removePushSubscription(endpoint: string): Promise<void>
  getChannelConfigs(): Promise<ChannelConfigs>
  saveChannelConfigs(c: ChannelConfigs): Promise<void>

  importAll(tables: BackupTables): Promise<void>
}

/** 备份的 12 张表数据（导出/导入闭环的载体） */
export interface BackupTables {
  tasks: Task[]
  habits: Habit[]
  habitLogs: HabitLog[]
  focusSessions: FocusSession[]
  exams: Exam[]
  studyGoals: StudyGoal[]
  notes: Note[]
  papers: Paper[]
  folders: Folder[]
  healthLogs: HealthLog[]
  reviews: Review[]
  growthActions: GrowthAction[]
}

/** 通用 ID 生成 */
export function genId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
export function todayStr(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
/** ISO 时间戳 → 本地日期（YYYY-MM-DD）。startAt/completedAt 存的是 UTC ISO 字符串，不能 slice(0,10) 与本地日期比较 */
export function localDateOfISO(iso: string): string {
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
