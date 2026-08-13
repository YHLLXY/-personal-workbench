import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff } from 'lucide-react'
import { getSupabaseClient } from '../lib/db/supabase-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

/** 解析 location.hash 中的 Supabase recovery token（#access_token=..&refresh_token=..&type=recovery） */
function parseRecoveryHash(hash: string): { accessToken: string; refreshToken: string } | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const accessToken = params.get('access_token') ?? ''
  const refreshToken = params.get('refresh_token') ?? ''
  return accessToken && params.get('type') === 'recovery' ? { accessToken, refreshToken } : null
}

export default function ResetPasswordPage() {
  const navigate = useNavigate()
  const [tokenError, setTokenError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [showPw2, setShowPw2] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const tokens = parseRecoveryHash(window.location.hash)
    if (!tokens) { setTokenError('重置链接无效'); return }
    getSupabaseClient().auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
      .then(({ error }) => {
        if (error) setTokenError('重置链接已失效，请重新发送')
        else setReady(true)
      })
      .catch(() => setTokenError('重置链接已失效，请重新发送'))
  }, [])

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (pw.length < 6) { toast.error('密码至少 6 位'); return }
    if (pw !== pw2) { toast.error('两次输入的密码不一致'); return }
    setBusy(true)
    try {
      await getSupabaseClient().auth.updateUser({ password: pw })
      toast.success('密码已重置，请使用新密码登录')
      navigate('/')
    } catch (err) { toast.error('重置失败：' + (err instanceof Error ? err.message : '未知错误')) }
    finally { setBusy(false) }
  }

  // 无有效 token / 链接失效：错误卡片 + 回登录
  if (tokenError || !ready) {
    return (
      <div className="min-h-dvh flex items-center justify-center bg-background px-4">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2 justify-center mb-8">
            <span className="size-3 rounded-full bg-primary" />
            <span className="font-bold text-lg">我的工作台</span>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm text-center">
            <p className="text-sm text-muted-foreground">{tokenError ?? '正在验证重置链接…'}</p>
            {tokenError && (
              <Link to="/login" className="inline-flex h-8 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition-colors hover:bg-muted">
                返回登录
              </Link>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <span className="size-3 rounded-full bg-primary" />
          <span className="font-bold text-lg">我的工作台</span>
        </div>
        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="space-y-1">
            <h1 className="font-semibold">设置新密码</h1>
            <p className="text-xs text-muted-foreground">重置链接已验证，请输入新密码（至少 6 位）</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-password">新密码</Label>
            <div className="relative">
              <Input id="rp-password" type={showPw ? 'text' : 'password'} autoComplete="new-password" required value={pw} onChange={e => setPw(e.target.value)} placeholder="至少 6 位" className="pr-9" />
              <button type="button" onClick={() => setShowPw(v => !v)} aria-label={showPw ? '隐藏密码' : '显示密码'} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rp-confirm">确认新密码</Label>
            <div className="relative">
              <Input id="rp-confirm" type={showPw2 ? 'text' : 'password'} autoComplete="new-password" required value={pw2} onChange={e => setPw2(e.target.value)} placeholder="再次输入密码" className="pr-9" />
              <button type="button" onClick={() => setShowPw2(v => !v)} aria-label={showPw2 ? '隐藏密码' : '显示密码'} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPw2 ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? '提交中…' : '重置密码'}</Button>
          <p className="text-sm text-center">
            <Link to="/login" className="text-muted-foreground hover:text-primary transition-colors">返回登录</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
