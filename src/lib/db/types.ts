/** 重复规则（v1.24）：简单枚举而非 RRULE——freq+interval+weekdays 覆盖 Todoist every/every! 全部主路径 */
export interface TaskRepeat {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number              // 每 N 天/周/月，≥1
  weekdays?: number[]           // freq='weekly' 时 0-6（周日=0）多选；interval>1 时仅单选（UI 约束）
  anchor: 'due' | 'complete'    // 按计划日推 / 按完成日推（Todoist every / every!）
}
export interface ChecklistItem { id: string; text: string; done: boolean }

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
  repeat?: TaskRepeat | null   // v1.24 重复规则；null/缺省 = 不重复（旧数据天然缺省，非兼容层）
  checklist?: ChecklistItem[]  // v1.24 清单；缺省 = 无清单
  note?: string | null         // v1.25 备注；缺省 = 无备注（卡片标题下方灰字展示，line-clamp-2）
  goalId?: string | null        // v1.36 学习目标归属（迁移 020）；缺省 = 与目标无关的普通任务
  progressAmount?: number | null // v1.36 完成时推进多少目标进度（迁移 020）；缺省 = 按 1 计
}
export interface TaskInput { title: string; focus?: boolean; priority?: Task['priority']; status?: Task['status']; dueDate?: string | null; dueTime?: string | null; focusDate?: string | null; tags?: string[]; repeat?: TaskRepeat | null; checklist?: ChecklistItem[]; note?: string | null; goalId?: string | null; progressAmount?: number | null }

export interface Habit { id: string; name: string; icon: string; color: string; targetPerDay: number; active: boolean; createdAt: string }
export interface HabitLog { id: string; habitId: string; logDate: string; count: number }

export interface FocusSession {
  id: string; startAt: string; minutes: number; note: string | null
  /** v1.36：专注归属的任务（迁移 020）。自由专注为 null；不复从 note 猜任务 */
  taskId?: string | null
}

/**
 * 每日计划项（v1.35，迁移 019）：某一天「计划了哪些任务」的事实快照。
 *
 * 一条任务在某一天的唯一身份是 (planDate, taskId)。计划、完成、改期、删除都只在这一行上留痕，
 * 而不是回头读任务当前状态——后者必然被今天的改期改写历史（v1.34 复盘统计的根因，见 D-16）。
 * 行级（而不是一个 JSON 数组）：收尾会并发改 5 条，JSON 是"读-改-写"且必然丢更新，行级 upsert 天然幂等。
 */
export interface PlanItem {
  planDate: string          // YYYY-MM-DD，这一项计划在哪一天
  taskId: string
  title: string             // 计划时的标题快照（任务改名或删除后历史仍可读）
  goalId: string | null     // 计划时的目标归属（v1.36 起才有值）
  amount: number | null     // 计划时从 Task.progressAmount 快照的推进量（v1.36 起才有值）
  doneAt: string | null     // 完成事实（ISO）；撤销写回 null
  movedTo: string | null    // 改期目标日；撤销改期清空
  createdAt: string
}
/** 计划项写入载荷：**只写传入的字段**（undefined = 不动已有值），所以完成一条已物化的计划项不会误清 movedTo */
export interface PlanItemInput {
  planDate: string
  taskId: string
  title?: string
  goalId?: string | null
  amount?: number | null
  doneAt?: string | null
  movedTo?: string | null
}

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
  /** v1.36：属于哪场考试（迁移 020）。考试删了置 null，目标本身保留 */
  examId?: string | null
}
export interface StudyGoalInput { title: string; target?: number; deadline?: string | null; note?: string | null; examId?: string | null }

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
  sentAt: string | null // 真实送达时刻（null = 待发送；无通道/全失败时保留 null 待下次补发）
  createdAt: string
}
export interface PushSubscriptionRow { id: string; endpoint: string; keysP256dh: string; keysAuth: string; userAgent: string | null; createdAt: string }

/** AI 日报（迁移 015 的 wb_daily_reports）。**由服务端 /api/digest 写入，前端只读**。 */
export interface DailyReportSource { name: string; url: string }
export interface DailyReportItem { eventId: string; title: string; point: string; sources: DailyReportSource[] }
export interface DailyReportSection { category: string; items: DailyReportItem[] }
export interface DailyReport {
  id: string
  reportDate: string
  title: string
  overview: string
  sections: DailyReportSection[]
  itemCount: number
  sourceCount: number
  model: string | null
  generatedAt: string
}
/** 通知通道配置。telegramBotToken / telegramChatId 为 v1.26 新增（迁移 014）。
 *  ⚠️ saveChannelConfigs 是整行覆盖：调用方必须传**全部字段**，漏传即被清空（旧实现只传 serverchanKey）。 */
export interface ChannelConfigs { serverchanKey: string | null; telegramBotToken: string | null; telegramChatId: string | null }

export interface WorkbenchRepository {
  listTasks(): Promise<Task[]>
  createTask(input: TaskInput): Promise<Task>
  /** 每日计划项（v1.35）：只 upsert、不删行——任务删除后历史仍要可读 */
  listPlanItems(): Promise<PlanItem[]>
  upsertPlanItem(input: PlanItemInput): Promise<PlanItem>
  /** 只给"撤销改期"用：改期给目标日补了一条行，撤销时必须把那条抹掉，否则目标日会留下幽灵计划 */
  deletePlanItem(planDate: string, taskId: string): Promise<void>
  updateTask(id: string, patch: Partial<Task>): Promise<Task>
  deleteTask(id: string): Promise<void>
  /** 撤销删除（v1.35）：按原 id 原样写回——"误删 1 次点击恢复"要求 id 不变，否则计划项/专注记录的引用会断 */
  restoreTask(task: Task): Promise<Task>

  listHabits(): Promise<Habit[]>
  createHabit(input: { name: string; icon?: string; color?: string; targetPerDay?: number }): Promise<Habit>
  updateHabit(id: string, patch: Partial<Habit>): Promise<Habit>
  deleteHabit(id: string): Promise<void>
  listHabitLogs(): Promise<HabitLog[]>
  setHabitLog(habitId: string, logDate: string, count: number): Promise<void>

  listFocusSessions(): Promise<FocusSession[]>
  createFocusSession(minutes: number, note?: string, taskId?: string | null): Promise<FocusSession>

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
  listPushSubscriptions(): Promise<PushSubscriptionRow[]>
  savePushSubscription(input: { endpoint: string; keysP256dh: string; keysAuth: string; userAgent?: string }): Promise<void>
  removePushSubscription(endpoint: string): Promise<void>
  getChannelConfigs(): Promise<ChannelConfigs>
  saveChannelConfigs(c: ChannelConfigs): Promise<void>

  /** AI 日报：服务端生成、前端只读。本地模式没有这条链路，恒为空 */
  listDailyReports(limit?: number): Promise<DailyReport[]>
  getDailyReport(reportDate: string): Promise<DailyReport | null>

  importAll(tables: BackupTables): Promise<void>
}

/** 备份的 13 张表数据（导出/导入闭环的载体）。
 *  planItems 是 v1.35 新增的表：旧备份文件里没有它，`validateBackup` 会把缺省补成 []，
 *  所以它**不能**进 backup.ts 的必需表清单（否则所有旧备份都会被判 corrupt）。 */
export interface BackupTables {
  tasks: Task[]
  planItems: PlanItem[]
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

/** 任务 patch 的唯一派生规则：status→done 写完成时间、改回未完成清空、不带 status 时维持/采纳显式 completedAt。
 *  乐观更新与仓储层必须共用此函数——乐观对象要和落库对象完全一致，否则已完成区（todayDone 依赖 completedAt）会先失去任务再等 refetch 收容，出现空帧闪烁（2026-08 反馈） */
export function applyTaskPatch(current: Task, patch: Partial<Task>): Task {
  const completedAt = patch.status === 'done' ? new Date().toISOString()
    : patch.status !== undefined ? null
    : patch.completedAt !== undefined ? patch.completedAt
    : current.completedAt ?? null
  return { ...current, ...patch, completedAt }
}

/** 排序烘焙（v1.24）：优先级档位烘进 sort 高位，公式 1e13*(档位+1)+毫秒时间戳（high=3/medium=2/low=1）。
 *  三处共用必须一致：迁移 011 SQL 回填、local listTasks 惰性归一化、双端 createTask。
 *  背景：v1.24 起 UI 排序语义从「焦点→优先级→时间」改为纯 sort 降序，存量优先级需一次性烘焙才能保持旧序；
 *  1e13 同时是「已烘焙」判定守卫（旧毫秒值 ~1.75e12 < 1e13，烘焙后 ≥ 1.175e13，上限 3.175e13 ≪ 2^53 无损） */
export function bakeTaskSort(priority: Task['priority'], ts: number = Date.now()): number {
  return 1e13 * (priority === 'high' ? 3 : priority === 'medium' ? 2 : 1) + ts
}
