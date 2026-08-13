/**
 * 认证辅助函数（单文件）
 *
 * ⚠️ 必须保持单文件：Vercel 函数环境（Node 原生 TS 运行）不支持跨文件相对导入
 * （2026-08-05 线上 FUNCTION_INVOCATION_FAILED 排障结论）。禁止 import src/ 任何文件。
 * 入口经 vercel.json rewrites 汇入（?entry= 区分）：
 *   POST /api/resolve-phone  手机号 → 邮箱（service role 查 wb_login_aliases + auth.users，登录前调用无会话）
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Vercel 函数为 Node 环境，但 tsconfig.app.json（DOM lib）无 process 类型——此声明仅过 tsc
declare const process: { env: Record<string, string | undefined> }

// ========== 工具 ==========

function env(k: string): string {
  const v = process.env[k]
  if (!v) throw new Error(`missing env ${k}`)
  return v
}

/** 手机号规范化：去空格/连字符、剥离可选 +86 前缀（与前端 auth-page.tsx normalizePhone 同规则） */
function normalizePhone(raw: string): string {
  let p = String(raw ?? '').replace(/[\s-]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('86') && p.length > 11) p = p.slice(2)
  return p
}

/** service role 绕过 RLS，可读全部别名行 */
function adminClient(): SupabaseClient {
  return createClient(env('VITE_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })
}

// ========== 函数入口 ==========

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const entry = req.query.entry as string | undefined
    if (entry === 'resolve-phone') {
      // 登录前调用（无会话）：公开解析接口。手机号本身非机密，本项目为手机号登录易用性接受该权衡；
      // 未注册手机号返回 404（not_found），前端据此提示「请先注册」；服务异常返回 500 由前端降级为邮箱登录
      const phone = normalizePhone(String((req.body as { phone?: string })?.phone ?? ''))
      if (!/^1\d{10}$/.test(phone)) return res.status(400).json({ error: 'invalid_phone' })
      const sb = adminClient()
      const { data, error } = await sb.from('wb_login_aliases').select('user_id').eq('phone', phone).maybeSingle()
      if (error) throw error
      if (!data) return res.status(404).json({ error: 'not_found' })
      const { data: user, error: userErr } = await sb.auth.admin.getUserById(String(data.user_id))
      if (userErr) throw userErr
      if (!user.user.email) return res.status(404).json({ error: 'not_found' })
      return res.json({ ok: true, email: user.user.email })
    }
    return res.status(404).json({ error: 'not found' })
  } catch (err) {
    console.error('auth handler error', err)
    return res.status(500).json({ error: err instanceof Error ? err.message : 'internal error' })
  }
}
