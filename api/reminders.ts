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

// Vercel 函数为 Node 环境，但 tsconfig.app.json（DOM lib）无 process 类型——此声明仅过 tsc
declare const process: { env: Record<string, string | undefined> }

// ========== 提醒生成引擎（纯函数，可测试） ==========

export type ReminderKind = 'due' | 'exam-3d' | 'exam-1d' | 'exam-1h'
export interface TaskLike { id: string; userId: string; title: string; status: string; dueDate: string | null; dueTime: string | null }
export interface ExamLike { id: string; userId: string; title: string; examDate: string; examTime: string | null }
export interface ReminderSpec { userId: string; refType: 'task' | 'exam'; refId: string; kind: ReminderKind; scheduledAt: string; title: string }

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

/** 计算应存在的全部提醒节点（跳过：任务已完成、任务无 dueTime、考试已过、日期格式非法） */
export function computeReminders(tasks: TaskLike[], exams: ExamLike[], now: Date): ReminderSpec[] {
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
  return out
}

/** 与已有记录求差：返回需要新增的节点（(refType, refId, kind) 幂等去重） */
export function diffReminders(existing: Array<{ refType: string; refId: string; kind: string }>, computed: ReminderSpec[]): ReminderSpec[] {
  const seen = new Set(existing.map(r => `${r.refType}:${r.refId}:${r.kind}`))
  return computed.filter(s => !seen.has(`${s.refType}:${s.refId}:${s.kind}`))
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
  }
}

/** PostgREST 行 → 前端 Reminder（camelCase） */
function reminderRowToClient(r: Record<string, unknown>) {
  return { id: String(r.id), refType: r.ref_type as 'task' | 'exam', refId: String(r.ref_id), kind: r.kind as ReminderKind, scheduledAt: String(r.scheduled_at), sentAt: r.sent_at ? String(r.sent_at) : null, dismissedAt: r.dismissed_at ? String(r.dismissed_at) : null, createdAt: String(r.created_at) }
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

async function runCheck(sb: SupabaseClient, now: Date): Promise<{ created: number; due: number; sent: number; skipped: number }> {
  const [tasksRes, examsRes, remindersRes] = await Promise.all([
    sb.from('wb_tasks').select('id,user_id,title,status,due_date,due_time'),
    sb.from('wb_exams').select('id,user_id,title,exam_date,exam_time'),
    sb.from('wb_reminders').select('ref_type,ref_id,kind'),
  ])
  if (tasksRes.error) throw tasksRes.error
  if (examsRes.error) throw examsRes.error
  if (remindersRes.error) throw remindersRes.error
  const tasks: TaskLike[] = (tasksRes.data ?? []).map(r => ({ id: String(r.id), userId: String(r.user_id), title: String(r.title), status: String(r.status), dueDate: r.due_date as string | null, dueTime: r.due_time as string | null }))
  const exams: ExamLike[] = (examsRes.data ?? []).map(r => ({ id: String(r.id), userId: String(r.user_id), title: String(r.title), examDate: String(r.exam_date), examTime: r.exam_time as string | null }))
  const specs = computeReminders(tasks, exams, now)
  const existing = (remindersRes.data ?? []).map(r => ({ refType: String(r.ref_type), refId: String(r.ref_id), kind: String(r.kind) }))
  const fresh = diffReminders(existing, specs)
  if (fresh.length > 0) {
    // upsert + ignoreDuplicates：并发 cron/check 同时 diff 出相同 fresh 时，慢的一方不再撞 unique 约束
    const { error } = await sb.from('wb_reminders').upsert(fresh.map(s => ({ id: genId(), user_id: s.userId, ref_type: s.refType, ref_id: s.refId, kind: s.kind, scheduled_at: s.scheduledAt })), { onConflict: 'user_id,ref_type,ref_id,kind', ignoreDuplicates: true })
    if (error) throw error
  }
  const dueCount = specs.filter(s => isDueNow(s, now)).length
  const sentResult = await sendDue(sb, tasks, exams, now)
  return { created: fresh.length, due: dueCount, ...sentResult }
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

/** 到期未发未忽略 → 逐条发送（Web Push + Server酱）；真实送达才标记 sent_at（无通道/全失败保留 NULL 待补发）；410/404 删除过期订阅 */
async function sendDue(sb: SupabaseClient, tasks: TaskLike[], exams: ExamLike[], now: Date): Promise<{ sent: number; skipped: number }> {
  ensureVapid()
  const [dueRes, subsRes, configsRes] = await Promise.all([
    sb.from('wb_reminders').select('*').lte('scheduled_at', now.toISOString()).is('sent_at', null).is('dismissed_at', null),
    sb.from('wb_push_subscriptions').select('*'),
    sb.from('wb_channel_configs').select('*'),
  ])
  if (dueRes.error) throw dueRes.error
  if (subsRes.error) throw subsRes.error
  if (configsRes.error) throw configsRes.error
  const tasksById = new Map(tasks.map(t => [t.id, t]))
  const examsById = new Map(exams.map(e => [e.id, e]))
  const subsByUser = new Map<string, string[]>()
  for (const s of subsRes.data ?? []) {
    const uid = String(s.user_id)
    const list = subsByUser.get(uid) ?? []
    list.push(JSON.stringify({ endpoint: String(s.endpoint), keys: { p256dh: String(s.keys_p256dh), auth: String(s.keys_auth) } }))
    subsByUser.set(uid, list)
  }
  const chanByUser = new Map<string, string>()
  for (const c of configsRes.data ?? []) if (c.serverchan_key) chanByUser.set(String(c.user_id), String(c.serverchan_key))

  let sent = 0
  let skipped = 0
  for (const row of dueRes.data ?? []) {
    const uid = String(row.user_id)
    const kind = row.kind as ReminderKind
    const refType = row.ref_type as 'task' | 'exam'
    const ref = refType === 'task' ? tasksById.get(String(row.ref_id)) : examsById.get(String(row.ref_id))
    // 已完成任务 / 已删除引用：跳过（不发送，保留行——任务恢复后可继续提醒）
    if (!ref) { skipped++; continue }
    if (refType === 'task' && (ref as TaskLike).status === 'done') { skipped++; continue }
    // refType 决定 ref 来自哪个 map，故按 refType 分支后安全断言具体类型
    const date = refType === 'task' ? String((ref as TaskLike).dueDate) : String((ref as ExamLike).examDate)
    const time = refType === 'task' ? String((ref as TaskLike).dueTime) : String((ref as ExamLike).examTime)
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
  return { sent }
}

// ========== 函数入口 ==========

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const entry = req.query.entry as string | undefined
    if (entry === 'cron') {
      // 直接读 env 比较：认证失败路径不抛 env 缺失错误，避免向未认证调用者泄漏环境变量名
      if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET ?? ''}`) return res.status(401).json({ error: 'unauthorized' })
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
    return res.status(404).json({ error: 'not found' })
  } catch (err) {
    console.error('reminders handler error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'internal error' })
  }
}

// ========== VAPID 初始化（模块顶层执行一次） ==========
try {
  const pub = process.env.VITE_VAPID_PUBLIC_KEY
  const priv = process.env.VAPID_PRIVATE_KEY
  if (pub && priv) webpush.setVapidDetails('mailto:workbench@example.com', pub, priv)
} catch { /* env 未配置时跳过（发送时失败静默） */ }
