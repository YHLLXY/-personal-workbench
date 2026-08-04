import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSupabaseClient } from '../lib/db/supabase-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'

export default function AuthPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true)
    try {
      const sb = getSupabaseClient()
      const { error } = await sb.auth.signInWithPassword({ email, password })
      if (error) {
        // 防枚举：用户不存在与密码错误都返回 invalid_credentials
        if (error.code === 'invalid_credentials' || error.message.includes('Invalid login credentials')) {
          const { data: signUpData, error: signUpErr } = await sb.auth.signUp({ email, password })
          if (signUpErr) {
            if (signUpErr.code === 'user_already_exists' || signUpErr.message.includes('User already registered')) {
              toast.error('账号已存在，密码不正确')
              return
            }
            throw signUpErr
          }
          if (signUpData.session) {           // 邮箱验证关闭：直接登录态
            toast.success('账号已创建，欢迎使用！')
            navigate('/')
          } else {                            // 邮箱验证开启：无会话，提示验证
            toast.success('注册成功！请前往邮箱完成验证后登录')
            return
          }
        } else throw error
      } else {
        toast.success('欢迎回来！')
        navigate('/')
      }
    } catch (err) { toast.error('登录失败：' + (err instanceof Error ? err.message : '未知错误')) }
    finally { setBusy(false) }
  }

  return (
    <div className="min-h-dvh flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-2 justify-center mb-8">
          <span className="size-3 rounded-full bg-primary" />
          <span className="font-bold text-lg">我的工作台</span>
        </div>
        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-6 space-y-4 shadow-sm">
          <div className="space-y-1.5">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" type="email" required value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">密码</Label>
            <Input id="password" type="password" required value={password} onChange={e => setPassword(e.target.value)} placeholder="至少 6 位" />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? '登录中…' : '进入工作台'}</Button>
          <p className="text-xs text-muted-foreground text-center">数据仅你本人可见 · 云端加密同步</p>
        </form>
      </div>
    </div>
  )
}
