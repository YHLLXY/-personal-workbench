import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { isCloudMode } from '../lib/db'
import { getSupabaseClient } from '../lib/db/supabase-client'
import { AVATAR_COLORS, getLocalProfile, setLocalProfile, type Profile } from '../lib/profile'

export interface AuthUser { email: string; nickname: string; avatarColor: string }
export interface AuthState {
  user: AuthUser | null
  loading: boolean
  signOut: () => Promise<void>
  updateProfile: (data: { nickname?: string; avatarColor?: string }) => Promise<void>
}

const defaultProfile: Profile = { nickname: '', avatarColor: AVATAR_COLORS[0] }

const AuthContext = createContext<AuthState>({
  user: null, loading: true,
  signOut: async () => {},
  updateProfile: async () => {},
})
export const useAuth = () => useContext(AuthContext)

/** 会话用户 -> AuthUser（云模式读 user_metadata；缺省回落默认资料） */
function userFromSession(
  user: { email?: string | null; user_metadata?: Record<string, unknown> } | null | undefined,
): AuthUser | null {
  if (!user) return null
  const meta = user.user_metadata
  return {
    email: user.email ?? '',
    nickname: typeof meta?.nickname === 'string' ? meta.nickname : '',
    avatarColor: typeof meta?.avatarColor === 'string' ? meta.avatarColor : defaultProfile.avatarColor,
  }
}

/** 已确认过别名的会话（user_id:phone），避免 onAuthStateChange 每次刷新都重复查库 */
const aliasEnsured = new Set<string>()

/**
 * 手机号别名补齐（注册/登录成功后调用）：
 * user_metadata 带 phone 且 wb_login_aliases 无该行 → RLS 插入本人行。
 * 手机号登录（/api/resolve-phone）依赖此行解析邮箱。
 * 表属认证域（本人 RLS），不进 WorkbenchRepository/BackupTables（防备份把别名带到另一账号）。
 * 幂等 + 静默失败：他人已占用的手机号（PK 冲突）放弃补齐，不打断登录。
 */
async function ensurePhoneAlias(sb: SupabaseClient, user: { id: string; user_metadata?: Record<string, unknown> }): Promise<void> {
  const phone = user.user_metadata?.phone
  if (typeof phone !== 'string' || !phone) return
  const key = `${user.id}:${phone}`
  if (aliasEnsured.has(key)) return
  aliasEnsured.add(key)
  try {
    const { data } = await sb.from('wb_login_aliases').select('phone').eq('phone', phone).maybeSingle()
    if (!data) await sb.from('wb_login_aliases').insert({ phone, user_id: user.id })
  } catch (err) { console.warn('ensurePhoneAlias failed', err) }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: isCloudMode, signOut: async () => {}, updateProfile: async () => {} })

  useEffect(() => {
    if (!isCloudMode) {
      // 本地模式：资料存 localStorage
      const p = getLocalProfile()
      setState(s => ({ ...s, user: { email: '', nickname: p.nickname, avatarColor: p.avatarColor }, loading: false }))
      return
    }
    const sb = getSupabaseClient()
    sb.auth.getSession().then(({ data }) => {
      const user = data.session?.user
      setState(s => ({ ...s, user: userFromSession(user), loading: false }))
      if (user) void ensurePhoneAlias(sb, user) // 登录后补齐手机号别名行（幂等）
    }).catch(() => setState(s => ({ ...s, user: null, loading: false })))
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => {
      const user = session?.user
      setState(s => ({ ...s, user: userFromSession(user), loading: false }))
      if (user) void ensurePhoneAlias(sb, user)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signOut: async () => {
          if (isCloudMode) await getSupabaseClient().auth.signOut()
          aliasEnsured.clear() // 退出后清缓存，下次登录重新确保别名
        },
        updateProfile: async (data) => {
          if (!isCloudMode) {
            const next = { ...getLocalProfile(), ...data }
            setLocalProfile(next)
            setState(s => ({ ...s, user: s.user ? { ...s.user, ...next } : s.user }))
            return
          }
          const sb = getSupabaseClient()
          // ⚠️ 关键：updateUser 后 JWT 缓存旧 metadata，必须 refreshSession 才能读到新昵称/头像色
          await sb.auth.updateUser({ data })
          await sb.auth.refreshSession()
          const { data: session } = await sb.auth.getSession()
          setState(s => ({ ...s, user: userFromSession(session.session?.user), loading: false }))
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}
