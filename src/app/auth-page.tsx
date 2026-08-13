import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { getSupabaseClient } from '../lib/db/supabase-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

type Mode = 'login' | 'register'

const EMAIL_RE = /^\S+@\S+\.\S+$/
/** 中国大陆手机号（1 开头 11 位）——normalize 后校验（与 api/auth.ts 同规则） */
const PHONE_RE = /^1\d{10}$/

/** 手机号规范化：去空格/连字符、剥离可选 +86 前缀 */
export function normalizePhone(raw: string): string {
  let p = raw.trim().replace(/[\s-]/g, '')
  if (p.startsWith('+')) p = p.slice(1)
  if (p.startsWith('86') && p.length > 11) p = p.slice(2)
  return p
}

type PhoneResolve = { ok: true; email: string } | { ok: false; reason: 'not_found' | 'unavailable' }

/**
 * 手机号 → 邮箱（/api/resolve-phone）。
 * 404 = 未注册；网络错误/接口未部署/500 = unavailable（前端据此给降级提示，邮箱登录不受影响）
 */
async function resolvePhoneEmail(phone: string): Promise<PhoneResolve> {
  try {
    const r = await fetch('/api/resolve-phone', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone }),
    })
    if (r.status === 404) return { ok: false, reason: 'not_found' }
    if (!r.ok) return { ok: false, reason: 'unavailable' }
    const j = (await r.json()) as { email?: string }
    return j.email ? { ok: true, email: j.email } : { ok: false, reason: 'unavailable' }
  } catch {
    return { ok: false, reason: 'unavailable' }
  }
}

/** Supabase 登录错误 → 用户可读文案 */
function authErrorMessage(error: { code?: string; message: string }): string {
  if (error.code === 'invalid_credentials' || error.message.includes('Invalid login credentials')) return '账号或密码不正确'
  if (error.code === 'user_already_exists' || error.message.includes('User already registered')) return '该邮箱已注册，请直接登录'
  if (error.message.includes('Email not confirmed')) return '邮箱尚未验证，请先前往邮箱完成验证'
  return error.message
}

export default function AuthPage() {
  const [mode, setMode] = useState<Mode>('login')
  // 登录态
  const [identifier, setIdentifier] = useState('') // 邮箱或手机号
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  // 注册态
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [regPw, setRegPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [showRegPw, setShowRegPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [busy, setBusy] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const navigate = useNavigate()

  /** 注册实时校验：返回各字段错误文案 + 规范化手机号 */
  function registerErrors(): { email: string; phone: string; password: string; confirm: string; np: string } {
    const errs = { email: '', phone: '', password: '', confirm: '', np: '' }
    const emailTrim = email.trim()
    if (!EMAIL_RE.test(emailTrim)) errs.email = emailTrim ? '邮箱格式不正确' : '请输入邮箱'
    const np = phone.trim() ? normalizePhone(phone) : ''
    errs.np = np
    if (phone.trim() && !PHONE_RE.test(np)) errs.phone = '手机号格式不正确（11 位，可带 +86 前缀）'
    if (regPw.length < 6) errs.password = regPw ? '密码至少 6 位' : '请设置密码（至少 6 位）'
    if (!confirmPw) errs.confirm = '请再次输入密码'
    else if (confirmPw !== regPw) errs.confirm = '两次输入的密码不一致'
    return errs
  }

  async function register(e: FormEvent) {
    e.preventDefault()
    setAttempted(true)
    const { email: emailErr, phone: phoneErr, password: pwErr, confirm: cfErr, np } = registerErrors()
    if (emailErr || phoneErr || pwErr || cfErr) { toast.error('请检查表单填写'); return }
    const sb = getSupabaseClient()
    const emailTrim = email.trim().toLowerCase()
    setBusy(true)
    try {
      // 手机号占用预检（best-effort：resolve-phone 未部署时跳过，别名在首次登录时补齐）
      if (np) {
        const res = await resolvePhoneEmail(np)
        if (res.ok) {
          toast.error('该手机号已被注册，请直接登录')
          setMode('login'); setIdentifier(phone.trim()); setAttempted(false)
          return
        }
      }
      const { data, error } = await sb.auth.signUp({
        email: emailTrim,
        password: regPw,
        options: np ? { data: { phone: np } } : undefined,
      })
      if (error) {
        if (error.code === 'user_already_exists' || error.message.includes('User already registered')) {
          toast.error('该邮箱已注册，请直接登录')
          setMode('login'); setIdentifier(emailTrim); setAttempted(false)
          return
        }
        throw error
      }
      if (data.session) {
        // 邮箱验证关闭：直接登录态（AuthProvider 已补齐手机号别名）
        toast.success('注册成功，欢迎使用！')
        navigate('/')
      } else {
        // 邮箱验证开启：无会话，切换登录（别名将在首次登录时补齐）
        toast.success('注册成功！请前往邮箱完成验证后登录')
        setMode('login'); setIdentifier(emailTrim); setAttempted(false)
      }
    } catch (err) { toast.error('注册失败：' + (err instanceof Error ? err.message : '未知错误')) }
    finally { setBusy(false) }
  }

  async function login(e: FormEvent) {
    e.preventDefault()
    const raw = identifier.trim()
    if (!raw) { toast.error('请输入邮箱或手机号'); return }
    let email = ''
    setBusy(true)
    try {
      if (raw.includes('@')) {
        if (!EMAIL_RE.test(raw)) { toast.error('邮箱格式不正确'); return }
        email = raw.toLowerCase()
      } else {
        const np = normalizePhone(raw)
        if (!PHONE_RE.test(np)) { toast.error('手机号格式不正确（11 位，可带 +86 前缀）'); return }
        const res = await resolvePhoneEmail(np)
        if (!res.ok) {
          if (res.reason === 'not_found') {
            toast.error('该手机号尚未注册，请先注册')
            setMode('register'); setPhone(raw); setAttempted(false)
            return
          }
          // 未部署 /api/resolve-phone 或服务异常：明确降级提示，邮箱登录不受影响
          toast.error('手机号登录服务暂不可用，请先用邮箱登录')
          return
        }
        email = res.email
      }
      const sb = getSupabaseClient()
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) { toast.error(authErrorMessage(error)); return }
      toast.success('欢迎回来！')
      navigate('/')
    } catch (err) { toast.error('登录失败：' + (err instanceof Error ? err.message : '未知错误')) }
    finally { setBusy(false) }
  }

  async function forgotPassword() {
    const email = identifier.trim()
    if (!email.includes('@')) { toast.error('请先输入注册邮箱'); return }
    try {
      await getSupabaseClient().auth.resetPasswordForEmail(email, { redirectTo: window.location.origin + '/reset-password' })
      toast.success('重置邮件已发送，请查收邮箱')
    } catch (err) { toast.error('发送失败：' + (err instanceof Error ? err.message : '未知错误')) }
  }

  const switchMode = (m: Mode) => { setMode(m); setAttempted(false) }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4 py-8">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <span className="size-3 rounded-full bg-primary" />
          <span className="font-bold text-lg">我的工作台</span>
        </div>

        {mode === 'login' ? (
          <form onSubmit={login} className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
            <div className="space-y-1.5">
              <Label htmlFor="identifier">邮箱或手机号</Label>
              <Input id="identifier" type="text" autoComplete="username" value={identifier} onChange={e => setIdentifier(e.target.value)} placeholder="you@example.com 或 13800138000" />
              <p className="text-xs text-muted-foreground">输入手机号将自动解析到对应邮箱账号</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">密码</Label>
              <div className="relative">
                <Input id="password" type={showPw ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" className="pr-9" />
                <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? '隐藏密码' : '显示密码'} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <button type="button" onClick={forgotPassword} className="text-xs text-muted-foreground hover:text-primary transition-colors">忘记密码？</button>
              <span className="text-xs text-muted-foreground">数据仅你本人可见 · 云端加密同步</span>
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? '登录中…' : '进入工作台'}</Button>
            <p className="text-sm text-center text-muted-foreground">
              还没有账号？{' '}
              <button type="button" onClick={() => switchMode('register')} className="text-primary hover:underline">立即注册</button>
            </p>
          </form>
        ) : (
          <form onSubmit={register} className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="reg-email">邮箱</Label>
              <Input id="reg-email" type="email" autoComplete="email" aria-invalid={attempted && !!registerErrors().email} value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
              {(attempted || email.trim()) && registerErrors().email && <p className="text-xs text-destructive">{registerErrors().email}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-phone">手机号 <span className="text-muted-foreground font-normal">（选填，用于手机号登录）</span></Label>
              <Input id="reg-phone" type="tel" autoComplete="tel" aria-invalid={attempted && !!registerErrors().phone} value={phone} onChange={e => setPhone(e.target.value)} placeholder="13800138000" />
              {(attempted || phone.trim()) && registerErrors().phone && <p className="text-xs text-destructive">{registerErrors().phone}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-password">密码</Label>
              <div className="relative">
                <Input id="reg-password" type={showRegPw ? 'text' : 'password'} autoComplete="new-password" aria-invalid={attempted && !!registerErrors().password} value={regPw} onChange={e => setRegPw(e.target.value)} placeholder="至少 6 位" className="pr-9" />
                <button type="button" onClick={() => setShowRegPw(v => !v)} aria-label={showRegPw ? '隐藏密码' : '显示密码'} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showRegPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {(attempted || regPw) && registerErrors().password && <p className="text-xs text-destructive">{registerErrors().password}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="reg-confirm">确认密码</Label>
              <div className="relative">
                <Input id="reg-confirm" type={showConfirmPw ? 'text' : 'password'} autoComplete="new-password" aria-invalid={attempted && !!registerErrors().confirm} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="再次输入密码" className="pr-9" />
                <button type="button" onClick={() => setShowConfirmPw(v => !v)} aria-label={showConfirmPw ? '隐藏密码' : '显示密码'} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                  {showConfirmPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {(attempted || confirmPw) && registerErrors().confirm && <p className="text-xs text-destructive">{registerErrors().confirm}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={busy}>{busy ? '注册中…' : '创建账号'}</Button>
            <p className="text-sm text-center text-muted-foreground">
              已有账号？{' '}
              <button type="button" onClick={() => switchMode('login')} className="text-primary hover:underline">直接登录</button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
