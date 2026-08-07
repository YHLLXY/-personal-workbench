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

// Vercel 函数为 Node 环境，但 tsconfig.app.json（DOM lib）无 process 类型——此声明仅过 tsc
declare const process: { env: Record<string, string | undefined> }

// ========== 提醒生成引擎（纯函数，可测试） ==========

export type ReminderKind = 'due' | 'exam-3d' | 'exam-1d' | 'exam-1h'
export interface TaskLike { id: string; title: string; status: string; dueDate: string | null; dueTime: string | null }
export interface ExamLike { id: string; title: string; examDate: string; examTime: string | null }
export interface ReminderSpec { refType: 'task' | 'exam'; refId: string; kind: ReminderKind; scheduledAt: string; title: string }

/** Asia/Shanghai 固定 +8 偏移（无夏令时） */
export const TZ_MS = 8 * 60 * 60 * 1000

/** 'YYYY-MM-DD'（+ 可选 'HH:mm'）→ 上海时刻的 UTC 毫秒数 */
export function shanghaiMs(date: string, time?: string | null): number {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time && /^\d{2}:\d{2}$/.test(time) ? time.split(':').map(Number) : [0, 0]
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1, hh ?? 0, mm ?? 0) - TZ_MS
}

/** 按上海时区取「今天」YYYY-MM-DD */
export function todayShanghai(now: Date): string {
  const d = new Date(now.getTime() + TZ_MS)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
}

/** 计算应存在的全部提醒节点（跳过：任务已完成、任务无 dueTime、考试已过） */
export function computeReminders(tasks: TaskLike[], exams: ExamLike[], now: Date): ReminderSpec[] {
  const out: ReminderSpec[] = []
  const today = todayShanghai(now)
  for (const t of tasks) {
    if (t.status === 'done' || !t.dueDate || !t.dueTime) continue
    out.push({ refType: 'task', refId: t.id, kind: 'due', scheduledAt: new Date(shanghaiMs(t.dueDate, t.dueTime)).toISOString(), title: t.title })
  }
  for (const e of exams) {
    if (e.examDate < today) continue // 考试已过
    const base = shanghaiMs(e.examDate)
    out.push({ refType: 'exam', refId: e.id, kind: 'exam-3d', scheduledAt: new Date(base - 3 * 86400_000 + TZ_MS).toISOString(), title: e.title }) // 考前3天 08:00
    out.push({ refType: 'exam', refId: e.id, kind: 'exam-1d', scheduledAt: new Date(base - 1 * 86400_000 + TZ_MS).toISOString(), title: e.title }) // 考前1天 08:00
    if (e.examTime) out.push({ refType: 'exam', refId: e.id, kind: 'exam-1h', scheduledAt: new Date(shanghaiMs(e.examDate, e.examTime) - 3600_000).toISOString(), title: e.title }) // 考前1小时
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

// ========== 核心流程：生成 + 幂等写入 + 到期统计（发送在 sendDue，Task 3） ==========

async function runCheck(sb: SupabaseClient, now: Date): Promise<{ created: number; due: number }> {
  const [tasksRes, examsRes, remindersRes] = await Promise.all([
    sb.from('wb_tasks').select('id,title,status,due_date,due_time'),
    sb.from('wb_exams').select('id,title,exam_date,exam_time'),
    sb.from('wb_reminders').select('ref_type,ref_id,kind'),
  ])
  if (tasksRes.error) throw tasksRes.error
  if (examsRes.error) throw examsRes.error
  if (remindersRes.error) throw remindersRes.error
  const tasks: TaskLike[] = (tasksRes.data ?? []).map(r => ({ id: String(r.id), title: String(r.title), status: String(r.status), dueDate: r.due_date as string | null, dueTime: r.due_time as string | null }))
  const exams: ExamLike[] = (examsRes.data ?? []).map(r => ({ id: String(r.id), title: String(r.title), examDate: String(r.exam_date), examTime: r.exam_time as string | null }))
  const specs = computeReminders(tasks, exams, now)
  const existing = (remindersRes.data ?? []).map(r => ({ refType: String(r.ref_type), refId: String(r.ref_id), kind: String(r.kind) }))
  const fresh = diffReminders(existing, specs)
  if (fresh.length > 0) {
    const { error } = await sb.from('wb_reminders').insert(fresh.map(s => ({ id: genId(), ref_type: s.refType, ref_id: s.refId, kind: s.kind, scheduled_at: s.scheduledAt })))
    if (error) throw error
  }
  return { created: fresh.length, due: specs.filter(s => isDueNow(s, now)).length }
}

// ========== 函数入口 ==========

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const entry = req.query.entry as string | undefined
    if (entry === 'cron') {
      if (req.headers.authorization !== `Bearer ${env('CRON_SECRET')}`) return res.status(401).json({ error: 'unauthorized' })
      const result = await runCheck(adminClient(), new Date())
      return res.json({ ok: true, ...result })
    }
    if (entry === 'check') {
      const sb = await authUser(req)
      if (!sb) return res.status(401).json({ error: 'unauthorized' })
      const result = await runCheck(sb, new Date())
      const { data } = await sb.from('wb_reminders').select('*').order('scheduled_at', { ascending: false })
      return res.json({ ok: true, ...result, reminders: data ?? [], vapidPublicKey: process.env.VITE_VAPID_PUBLIC_KEY ?? null })
    }
    if (entry === 'test') {
      // Task 3 实现：设置页测试发送
      return res.status(501).json({ error: 'not implemented' })
    }
    return res.status(404).json({ error: 'not found' })
  } catch (err) {
    console.error('reminders handler error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'internal error' })
  }
}
