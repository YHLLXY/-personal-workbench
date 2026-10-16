/**
 * 定时提醒通知函数（单文件）
 *
 * ⚠️ 必须保持单文件：Vercel 函数环境（Node 原生 TS 运行）不支持跨文件相对导入
 * （2026-08-05 线上 FUNCTION_INVOCATION_FAILED 排障结论）。禁止 import src/ 任何文件。
 * 入口经 vercel.json rewrites 汇入（?entry= 区分）：
 *   POST /api/cron-notify      服务端定时（Bearer CRON_SECRET，service role 免 RLS）
 *   GET  /api/check-reminders  用户打开应用兜底（Bearer JWT，RLS 限定本人）
 *   POST /api/test-notify      设置页测试发送（Bearer JWT）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { timingSafeEqual } from 'crypto'

// Vercel 函数为 Node 环境，但 tsconfig.app.json（DOM lib）无 process 类型——此声明仅过 tsc
declare const process: { env: Record<string, string | undefined> }

// ========== 提醒生成引擎（纯函数，可测试） ==========

export type ReminderKind = 'due' | 'exam-3d' | 'exam-1d' | 'exam-1h' | 'goal-3d' | 'goal-due'
export interface TaskLike { id: string; userId: string; title: string; status: string; dueDate: string | null; dueTime: string | null }
export interface ExamLike { id: string; userId: string; title: string; examDate: string; examTime: string | null }
export interface ReminderSpec { userId: string; refType: 'task' | 'exam' | 'goal'; refId: string; kind: ReminderKind; scheduledAt: string; title: string }

/** Asia/Shanghai 固定 +8 偏移（无夏令时） */
export const TZ_MS = 8 * 60 * 60 * 1000

/** 'YYYY-MM-DD'（+ 可选 'HH:mm'）→ 上海时刻的 UTC 毫秒数；格式非法返回 NaN */
export function shanghaiMs(date: string, time?: string | null): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Number.NaN
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time && /^\d{2}:\d{2}$/.test(time) ? time.split(':').map(Number) : [0, 0]
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0) - TZ_MS
}

/** 按上海时区取「今天」YYYY-MM-DD */
export function todayShanghai(now: Date): string {
  const d = new Date(now.getTime() + TZ_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

interface GoalLike { id: string; userId: string; title: string; status: string; deadline: string | null }

/** 计算应存在的全部提醒节点（跳过：任务已完成、任务无 dueTime、考试已过、目标已归档、日期格式非法） */
export function computeReminders(tasks: TaskLike[], exams: ExamLike[], goals: GoalLike[], now: Date): ReminderSpec[] {
  const out: ReminderSpec[] = []
  const today = todayShanghai(now)
  for (const t of tasks) {
    if (t.status === 'done' || !t.dueDate || !t.dueTime) continue
    const ms = shanghaiMs(t.dueDate, t.dueTime)
    if (!Number.isFinite(ms)) continue // 坏格式日期跳过，避免 toISOString 抛 RangeError
    out.push({ userId: t.userId, refType: 'task', refId: t.id, kind: 'due', scheduledAt: new Date(ms).toISOString(), title: t.title })
  }
  for (const e of exams) {
    if (e.examDate < today) continue // 考试已过
    const base = shanghaiMs(e.examDate)
    if (!Number.isFinite(base)) continue // 坏格式日期跳过
    // 考试节点是早晨 08:00 快照时刻：已过时刻的节点不生成（如临近考试才建提醒，补发过去节点只会造成「还有 3 天」噪音）；任务 due 节点保持补发语义不变
    const d3 = new Date(base - 3 * 86400_000 + TZ_MS) // 考前3天 08:00
    const d1 = new Date(base - 1 * 86400_000 + TZ_MS) // 考前1天 08:00
    if (d3.getTime() > now.getTime()) out.push({ userId: e.userId, refType: 'exam', refId: e.id, kind: 'exam-3d', scheduledAt: d3.toISOString(), title: e.title })
    if (d1.getTime() > now.getTime()) out.push({ userId: e.userId, refType: 'exam', refId: e.id, kind: 'exam-1d', scheduledAt: d1.toISOString(), title: e.title })
    if (e.examTime) {
      const h1 = new Date(shanghaiMs(e.examDate, e.examTime) - 3600_000) // 考前1小时
      if (h1.getTime() > now.getTime()) out.push({ userId: e.userId, refType: 'exam', refId: e.id, kind: 'exam-1h', scheduledAt: h1.toISOString(), title: e.title })
    }
  }
  for (const g of goals) {
    if (g.status === 'done' || !g.deadline) continue
    const base = shanghaiMs(g.deadline)
    if (!Number.isFinite(base)) continue
    const d3 = new Date(base - 3 * 86400_000 + TZ_MS) // 截止前3天 08:00
    const due = new Date(base + TZ_MS)                // 截止当天 08:00
    if (d3.getTime() > now.getTime()) out.push({ userId: g.userId, refType: 'goal', refId: g.id, kind: 'goal-3d', scheduledAt: d3.toISOString(), title: g.title })
    if (due.getTime() > now.getTime()) out.push({ userId: g.userId, refType: 'goal', refId: g.id, kind: 'goal-due', scheduledAt: due.toISOString(), title: g.title })
  }
  return out
}

/**
 * 引用对象是否「活着」——决定提醒行该不该继续存在。
 * 提醒是**派生数据**（v1.31 重构）：任务完成/删除、考试已过、目标归档/删除 → 行必须消失，
 * 而不是像旧实现那样只 skipped 不发送、永久滞留在列表里等人点「忽略」。
 * 与 computeReminders 的差别：这里只看「对象活不活」，不看「节点时刻过没过」——
 * 考试当天 3 天前/1 天前的节点虽然不再生成，但那条已发出的通知记录要留到考试结束。
 */
export function liveRefKeys(tasks: TaskLike[], exams: ExamLike[], goals: GoalLike[], now: Date): Set<string> {
  const today = todayShanghai(now)
  const live = new Set<string>()
  for (const t of tasks) if (t.status !== 'done') live.add(`task:${t.id}`)
  for (const e of exams) if (e.examDate >= today) live.add(`exam:${e.id}`)
  for (const g of goals) if (g.status !== 'done' && g.deadline) live.add(`goal:${g.id}`)
  return live
}

export interface ExistingReminder { id: string; refType: string; refId: string; kind: string; scheduledAt: string }
export interface ReminderTimeChange { id: string; scheduledAt: string; /** true = 新时刻在未来 → 清空 sent_at 重新计时 */ resetDelivery: boolean }
export interface ReminderPlan { create: ReminderSpec[]; update: ReminderTimeChange[]; remove: string[] }

/**
 * 增 / 改 / 删 三向对齐（替换 v1.31 之前的「只增不删不改」版 diffReminders）。
 * 旧版按 (refType, refId, kind) 去重且**不比较 scheduledAt** —— 后果是把任务的提醒时间从 09:00 改到 18:00
 * 永远不会生效（key 没变 → 判定「已存在」→ 库里还是 09:00）。这是本轮修掉的核心缺陷之一。
 */
export function planReminders(existing: ExistingReminder[], computed: ReminderSpec[], live: Set<string>, now: Date): ReminderPlan {
  const plan: ReminderPlan = { create: [], update: [], remove: [] }
  const prevByKey = new Map(existing.map(r => [`${r.refType}:${r.refId}:${r.kind}`, r]))
  for (const spec of computed) {
    const prev = prevByKey.get(`${spec.refType}:${spec.refId}:${spec.kind}`)
    if (!prev) { plan.create.push(spec); continue }
    if (prev.scheduledAt !== spec.scheduledAt) {
      plan.update.push({ id: prev.id, scheduledAt: spec.scheduledAt, resetDelivery: new Date(spec.scheduledAt).getTime() > now.getTime() })
    }
  }
  for (const r of existing) if (!live.has(`${r.refType}:${r.refId}`)) plan.remove.push(r.id)
  return plan
}

/** 到期判断：scheduledAt <= now */
export function isDueNow(spec: { scheduledAt: string }, now: Date): boolean {
  return new Date(spec.scheduledAt).getTime() <= now.getTime()
}

/** 提醒文案（服务端发送用；前端有独立轻量版，不 import 本文件） */
export function reminderText(kind: ReminderKind, title: string, date: string, time: string | null): string {
  switch (kind) {
    case 'due': return `任务「${title}」到点了，记得处理`
    case 'exam-3d': return `考试「${title}」还有 3 天（${date}）`
    case 'exam-1d': return `考试「${title}」就在明天（${date}）`
    case 'exam-1h': return `考试「${title}」1 小时后开始（${date} ${time ?? ''}）`
    case 'goal-3d': return `学习目标「${title}」还剩 3 天（${date}），每天推进一点`
    case 'goal-due': return `学习目标「${title}」今天截止（${date}），记得收尾`
  }
}

/** PostgREST 行 → 前端 Reminder（camelCase） */
function reminderRowToClient(r: Record<string, unknown>) {
  return { id: String(r.id), refType: r.ref_type as 'task' | 'exam' | 'goal', refId: String(r.ref_id), kind: r.kind as ReminderKind, scheduledAt: String(r.scheduled_at), sentAt: r.sent_at ? String(r.sent_at) : null, createdAt: String(r.created_at) }
}

// ========== 工具 ==========

function genId(): string { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}` }
function env(k: string): string {
  const v = process.env[k]
  if (!v) throw new Error(`missing env ${k}`)
  return v
}

// ========== Supabase 客户端 ==========

/** 服务端定时：service role 绕过 RLS，可操作全部用户数据 */
function adminClient(): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
}
/** 用户请求：anon + 用户 JWT，RLS 限定本人 */
function userClient(token: string): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false }, global: { headers: { authorization: `Bearer ${token}` } } })
}
/** 校验请求头 JWT → 用户级 client；无效返回 null */
async function authUser(req: VercelRequest): Promise<SupabaseClient | null> {
  const token = (req.headers.authorization ?? '').replace(/^Bearer /i, '')
  if (!token) return null
  const anon = createClient(env('VITE_SUPABASE_URL'), env('VITE_SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
  const { data } = await anon.auth.getUser(token)
  if (!data.user) return null
  return userClient(token)
}

// ========== 核心流程：生成 + 幂等写入 + 到期统计 + 发送 ==========

async function runCheck(sb: SupabaseClient, now: Date): Promise<{ created: number; updated: number; removed: number; due: number; sent: number; skipped: number }> {
  const [tasksRes, examsRes, goalsRes, remindersRes] = await Promise.all([
    sb.from('wb_tasks').select('id,user_id,title,status,due_date,due_time'),
    sb.from('wb_exams').select('id,user_id,title,exam_date,exam_time'),
    sb.from('wb_study_goals').select('id,user_id,title,status,deadline'),
    sb.from('wb_reminders').select('id,ref_type,ref_id,kind,scheduled_at'),
  ])
  if (tasksRes.error) throw tasksRes.error
  if (examsRes.error) throw examsRes.error
  if (goalsRes.error) throw goalsRes.error
  if (remindersRes.error) throw remindersRes.error
  const tasks: TaskLike[] = (tasksRes.data ?? []).map(r => ({ id: String(r.id), userId: String(r.user_id), title: String(r.title), status: String(r.status), dueDate: r.due_date as string | null, dueTime: r.due_time as string | null }))
  const exams: ExamLike[] = (examsRes.data ?? []).map(r => ({ id: String(r.id), userId: String(r.user_id), title: String(r.title), examDate: String(r.exam_date), examTime: r.exam_time as string | null }))
  const goals: GoalLike[] = (goalsRes.data ?? []).map(r => ({ id: String(r.id), userId: String(r.user_id), title: String(r.title), status: String(r.status), deadline: r.deadline as string | null }))
  const specs = computeReminders(tasks, exams, goals, now)
  const existing: ExistingReminder[] = (remindersRes.data ?? []).map(r => ({ id: String(r.id), refType: String(r.ref_type), refId: String(r.ref_id), kind: String(r.kind), scheduledAt: String(r.scheduled_at) }))
  const plan = planReminders(existing, specs, liveRefKeys(tasks, exams, goals, now), now)

  // 删：引用对象已终结（任务完成/删除、考试已过、目标归档/删除）的孤儿行
  if (plan.remove.length > 0) {
    const { error } = await sb.from('wb_reminders').delete().in('id', plan.remove)
    if (error) throw error
  }
  // 改：节点时刻变了（用户改了 dueDate/dueTime/deadline）。逐条 update——每行的新时刻不同，无法批量
  for (const u of plan.update) {
    const { error } = await sb.from('wb_reminders')
      .update(u.resetDelivery ? { scheduled_at: u.scheduledAt, sent_at: null } : { scheduled_at: u.scheduledAt })
      .eq('id', u.id)
    if (error) throw error
  }
  if (plan.create.length > 0) {
    // upsert + ignoreDuplicates：并发 cron/check 同时算出相同新增时，慢的一方不再撞 unique 约束。
    // scheduled_at 已过的节点直接写 sent_at = now：**不补发**——否则首次接云端 / 撤销完成 / 从「将来」转回来
    // 会把几十条历史提醒一次性炸出来（提醒是给未来时刻设的，已经过期的只该以「已逾期」出现在提醒中心）。
    const { error } = await sb.from('wb_reminders').upsert(plan.create.map(s => ({
      id: genId(), user_id: s.userId, ref_type: s.refType, ref_id: s.refId, kind: s.kind, scheduled_at: s.scheduledAt,
      sent_at: new Date(s.scheduledAt).getTime() <= now.getTime() ? now.toISOString() : null,
    })), { onConflict: 'user_id,ref_type,ref_id,kind', ignoreDuplicates: true })
    if (error) throw error
  }
  const dueCount = specs.filter(s => isDueNow(s, now)).length
  const sentResult = await sendDue(sb, tasks, exams, goals, now)
  return { created: plan.create.length, updated: plan.update.length, removed: plan.remove.length, due: dueCount, ...sentResult }
}

// ========== 发送通道 ==========

/** VAPID 惰性初始化（幂等）：发送前确保已配置；顶层 init 在测试环境（import 先于 env 赋值）不会触发 */
let vapidInitialized = false
function ensureVapid(): void {
  if (vapidInitialized) return
  vapidInitialized = true
  const pub = process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) {
    try { webpush.setVapidDetails('mailto:workbench@example.com', pub, priv) } catch { /* env 未配置时跳过（发送时失败静默） */ }
  }
}

/** 到期未发 → 逐条发送（Web Push + Server酱/Telegram）；真实送达才标记 sent_at（无通道/全失败保留 NULL 待补发）；410/404 删除过期订阅 */
/** HTML 模式转义：提醒正文里出现 < > & 会让 Telegram 解析失败（400 Bad Request） */
function tgEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

/** 发一条 Telegram 消息。失败抛错（description 原样带出，供 UI 显示配置错误）。
 *  ⚠️ api.telegram.org 在中国大陆被墙，但本函数运行在 Vercel（服务端出网），
 *  与 Server酱 走同一条路径——浏览器直连不通不影响这里。 */
async function sendTelegram(botToken: string, chatId: string, text: string): Promise<void> {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: tgEscape(text), parse_mode: 'HTML', disable_web_page_preview: true }),
    signal: AbortSignal.timeout(8000),
  })
  const j = (await r.json().catch(() => null)) as { ok?: boolean; description?: string } | null
  if (!r.ok || !j?.ok) throw new Error(j?.description ?? `HTTP ${r.status}`)
}

/** 校验 Bot Token（getMe）。设置页在落库前先调它，避免把错 Token 写进数据库。 */
async function telegramGetMe(botToken: string): Promise<string> {
  const r = await fetch(`https://api.telegram.org/bot${botToken}/getMe`, { signal: AbortSignal.timeout(8000) })
  const j = (await r.json().catch(() => null)) as { ok?: boolean; description?: string; result?: { username?: string } } | null
  if (!r.ok || !j?.ok) throw new Error(j?.description ?? `HTTP ${r.status}`)
  return j.result?.username ?? 'bot'
}

async function sendDue(sb: SupabaseClient, tasks: TaskLike[], exams: ExamLike[], goals: GoalLike[], now: Date): Promise<{ sent: number; skipped: number }> {
  ensureVapid()
  const [dueRes, subsRes, configsRes] = await Promise.all([
    sb.from('wb_reminders').select('*').lte('scheduled_at', now.toISOString()).is('sent_at', null),
    sb.from('wb_push_subscriptions').select('*'),
    sb.from('wb_channel_configs').select('*'),
  ])
  if (dueRes.error) throw dueRes.error
  if (subsRes.error) throw subsRes.error
  if (configsRes.error) throw configsRes.error
  const tasksById = new Map(tasks.map(t => [t.id, t]))
  const examsById = new Map(exams.map(e => [e.id, e]))
  const goalsById = new Map(goals.map(g => [g.id, g]))
  const subsByUser = new Map<string, string[]>()
  for (const s of subsRes.data ?? []) {
    const uid = String(s.user_id)
    const list = subsByUser.get(uid) ?? []
    list.push(JSON.stringify({ endpoint: String(s.endpoint), keys: { p256dh: String(s.keys_p256dh), auth: String(s.keys_auth) } }))
    subsByUser.set(uid, list)
  }
  const chanByUser = new Map<string, string>()
  const tgByUser = new Map<string, { token: string; chatId: string }>()
  for (const c of configsRes.data ?? []) {
    const uid = String(c.user_id)
    if (c.serverchan_key) chanByUser.set(uid, String(c.serverchan_key))
    if (c.telegram_bot_token && c.telegram_chat_id) tgByUser.set(uid, { token: String(c.telegram_bot_token), chatId: String(c.telegram_chat_id) })
  }

  let sent = 0
  let skipped = 0
  for (const row of dueRes.data ?? []) {
    const uid = String(row.user_id)
    const kind = row.kind as ReminderKind
    const refType = row.ref_type as 'task' | 'exam' | 'goal'
    const ref = refType === 'task' ? tasksById.get(String(row.ref_id)) : refType === 'goal' ? goalsById.get(String(row.ref_id)) : examsById.get(String(row.ref_id))
    // 已完成/已删除的引用对象由 runCheck 的 plan.remove 直接删行，这里理论上取不到；
    // 保留兜底只为「拿不到引用就没法拼文案」，不再有「留着行等恢复」的语义（v1.31）
    if (!ref) { skipped++; continue }
    // refType 决定 ref 来自哪个 map，故按 refType 分支后安全断言具体类型
    const date = refType === 'task' ? String((ref as TaskLike).dueDate) : refType === 'goal' ? String((ref as GoalLike).deadline) : String((ref as ExamLike).examDate)
    const time = refType === 'task' ? String((ref as TaskLike).dueTime) : ''
    const text = reminderText(kind, ref.title, date, time)
    const payload = JSON.stringify({ title: '个人工作台提醒', body: text, url: '/reminders' })

    let delivered = 0
    const subs = (subsByUser.get(uid) ?? []).map(s => JSON.parse(s) as { endpoint: string; keys: { p256dh: string; auth: string } })
    for (const sub of subs) {
      try {
        await webpush.sendNotification(sub, payload)
        sent++
        delivered++
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode
        if (code === 410 || code === 404) {
          // 过期订阅：删除
          try { await sb.from('wb_push_subscriptions').delete().eq('endpoint', sub.endpoint) } catch { /* 静默 */ }
        } else skipped++
      }
    }
    const scKey = chanByUser.get(uid)
    if (scKey) {
      try {
        // Server酱成功返回 {"code":0}；错误为 HTTP 200 + 非 0 code，不能只看 fetch 是否 resolve
        const r = await fetch(`https://sctapi.ftqq.com/${scKey}.send`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: `title=${encodeURIComponent('个人工作台提醒')}&desp=${encodeURIComponent(text)}`,
          signal: AbortSignal.timeout(5000),
        })
        const j = (await r.json().catch(() => null)) as { code?: number } | null
        if (r.ok && j?.code === 0) { sent++; delivered++ } else skipped++
      } catch { skipped++ }
    }
    const tg = tgByUser.get(uid)
    if (tg) {
      try { await sendTelegram(tg.token, tg.chatId, text); sent++; delivered++ } catch { skipped++ }
    }
    // 真实送达才标记 sent_at；无通道/全部失败时保留 NULL，下次 cron/check 会补发
    if (delivered > 0) await sb.from('wb_reminders').update({ sent_at: now.toISOString() }).eq('id', String(row.id))
  }
  return { sent, skipped }
}

/** 测试发送：向本人全部通道发送一条测试通知 */
async function sendTest(sb: SupabaseClient, _now: Date): Promise<{ sent: number }> {
  ensureVapid()
  const { data: subs, error: subsError } = await sb.from('wb_push_subscriptions').select('*')
  const { data: configs, error: configsError } = await sb.from('wb_channel_configs').select('*')
  if (subsError) throw subsError
  if (configsError) throw configsError
  let sent = 0
  const payload = JSON.stringify({ title: '个人工作台提醒', body: '这是一条测试通知，通知功能已就绪 ✅', url: '/settings' })
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: String(s.endpoint), keys: { p256dh: String(s.keys_p256dh), auth: String(s.keys_auth) } }, payload)
      sent++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      if (code === 410 || code === 404) { try { await sb.from('wb_push_subscriptions').delete().eq('endpoint', String(s.endpoint)) } catch { /* 静默 */ } }
    }
  }
  for (const c of configs ?? []) {
    if (!c.serverchan_key) continue
    try {
      // 与 sendDue 相同：仅 HTTP ok 且 code===0 才算送达
      const r = await fetch(`https://sctapi.ftqq.com/${String(c.serverchan_key)}.send`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `title=${encodeURIComponent('个人工作台提醒')}&desp=${encodeURIComponent('这是一条测试通知，通知功能已就绪 ✅')}`,
        signal: AbortSignal.timeout(5000),
      })
      const j = (await r.json().catch(() => null)) as { code?: number } | null
      if (r.ok && j?.code === 0) sent++
    } catch { /* 静默 */ }
  }
  for (const c of configs ?? []) {
    if (!c.telegram_bot_token || !c.telegram_chat_id) continue
    try { await sendTelegram(String(c.telegram_bot_token), String(c.telegram_chat_id), '这是一条测试通知，通知功能已就绪 ✅'); sent++ } catch { /* 静默 */ }
  }
  return { sent }
}

// ========== 函数入口 ==========

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const entry = req.query.entry as string | undefined
    if (entry === 'cron') {
      // 直接读 env 比较：认证失败路径不抛 env 缺失错误，避免向未认证调用者泄漏环境变量名
      const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
      const actual = req.headers.authorization ?? ''
      const ok = expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
      if (!ok) return res.status(401).json({ error: 'unauthorized' })
      const result = await runCheck(adminClient(), new Date())
      return res.json({ ok: true, ...result })
    }
    if (entry === 'check') {
      const sb = await authUser(req)
      if (!sb) return res.status(401).json({ error: 'unauthorized' })
      const result = await runCheck(sb, new Date())
      const { data, error } = await sb.from('wb_reminders').select('*').order('scheduled_at', { ascending: false })
      if (error) throw error // 瞬态失败不再静默返回空列表
      // 行需映射为 camelCase：前端 Reminder 形状消费（countUnread/横幅/列表均读 refType/scheduledAt/dismissedAt）
      return res.json({ ok: true, ...result, reminders: (data ?? []).map(reminderRowToClient), vapidPublicKey: process.env.VITE_VAPID_PUBLIC_KEY ?? null })
    }
    if (entry === 'test') {
      const sb = await authUser(req)
      if (!sb) return res.status(401).json({ error: 'unauthorized' })
      const result = await sendTest(sb, new Date())
      return res.json({ ok: true, ...result })
    }
    if (entry === 'telegram-test') {
      const sb = await authUser(req)
      if (!sb) return res.status(401).json({ error: 'unauthorized' })
      const body = (req.body ?? {}) as { botToken?: string; chatId?: string }
      const botToken = String(body.botToken ?? '').trim()
      const chatId = String(body.chatId ?? '').trim()
      if (!botToken || !chatId) return res.json({ ok: false, step: 'input', error: '请填写 Bot Token 和 Chat ID' })
      // 分两步，好让 UI 明确告诉用户是 Token 错还是 Chat ID 错
      let botUsername = ''
      try { botUsername = await telegramGetMe(botToken) }
      catch (err) { return res.json({ ok: false, step: 'token', error: err instanceof Error ? err.message : 'Token 校验失败' }) }
      try { await sendTelegram(botToken, chatId, '个人工作台已连上 Telegram ✅') }
      catch (err) { return res.json({ ok: false, step: 'chat', error: err instanceof Error ? err.message : '发送失败', botUsername }) }
      return res.json({ ok: true, botUsername })
    }
    return res.status(404).json({ error: 'not found' })
  } catch (err) {
    console.error('reminders handler error', err)
    return res.status(500).json({ error: 'internal error' })
  }
}

// ========== VAPID 初始化（模块顶层执行一次） ==========
try {
  const pub = process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) webpush.setVapidDetails('mailto:workbench@example.com', pub, priv)
} catch { /* env 未配置时跳过（发送时失败静默） */ }
