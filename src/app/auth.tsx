import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
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
    sb.auth.getSession().then(({ data }) => setState(s => ({ ...s, user: userFromSession(data.session?.user), loading: false }))).catch(() => setState(s => ({ ...s, user: null, loading: false })))
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setState(s => ({ ...s, user: userFromSession(session?.user), loading: false })))
    return () => sub.subscription.unsubscribe()
  }, [])

  return (
    <AuthContext.Provider
      value={{
        ...state,
        signOut: async () => { if (isCloudMode) await getSupabaseClient().auth.signOut() },
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
