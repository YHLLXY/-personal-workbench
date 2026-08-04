import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { isCloudMode } from '../lib/db'
import { getSupabaseClient } from '../lib/db/supabase-client'

export interface AuthState { user: { email: string } | null; loading: boolean }
const AuthContext = createContext<AuthState & { signOut: () => Promise<void> }>({ user: null, loading: true, signOut: async () => {} })
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ user: null, loading: isCloudMode })
  useEffect(() => {
    if (!isCloudMode) return
    const sb = getSupabaseClient()
    sb.auth.getSession().then(({ data }) => setState({ user: data.session?.user ? { email: data.session.user.email ?? '' } : null, loading: false }))
    const { data: sub } = sb.auth.onAuthStateChange((_e, session) => setState({ user: session?.user ? { email: session.user.email ?? '' } : null, loading: false }))
    return () => sub.subscription.unsubscribe()
  }, [])
  return <AuthContext.Provider value={{ ...state, signOut: async () => { if (isCloudMode) await getSupabaseClient().auth.signOut() } }}>{children}</AuthContext.Provider>
}
