import { Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ThemeProvider, useTheme } from './app/theme'
import { AuthProvider, useAuth } from './app/auth'
import { Shell } from './app/layout'
import AuthPage from './app/auth-page'
import { allSubModules } from './registry'
import { isCloudMode } from './lib/db'
import { Skeleton } from '@/components/ui/skeleton'
import { Button } from '@/components/ui/button'

const queryClient = new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1 } } })

export function Guard({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-dvh flex items-center justify-center text-sm text-muted-foreground">加载中…</div>
  if (isCloudMode && !user) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrowserRouter>
          <AuthProvider>
            <Toaster richColors position="top-center" />
            <Suspense fallback={<div className="p-6 space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}>
              <Routes>
                <Route path="/login" element={isCloudMode ? <AuthPage /> : <Navigate to="/" replace />} />
                <Route element={<Guard><Shell /></Guard>}>
                  {allSubModules.map(s => <Route key={s.id} path={s.path} element={<s.component />} />)}
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </Suspense>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

function SettingsPage() {
  const { user, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  return (
    <div className="max-w-xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">设置</h1>
      <div className="bg-card border border-border rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div><div className="font-medium text-sm">外观</div><div className="text-xs text-muted-foreground">当前：{theme === 'light' ? '浅色' : '深色'}</div></div>
          <Button variant="outline" size="sm" onClick={toggle}>切换</Button>
        </div>
        <div className="flex items-center justify-between">
          <div><div className="font-medium text-sm">账号</div><div className="text-xs text-muted-foreground">{isCloudMode ? user?.email ?? '未登录' : '本地模式（未配置云端）'}</div></div>
          {isCloudMode && <Button variant="outline" size="sm" onClick={signOut}>退出登录</Button>}
        </div>
        <div className="text-xs text-muted-foreground">
          数据模式：{isCloudMode ? '☁️ 云端同步（Supabase）' : '💾 本地存储（配置 VITE_SUPABASE_URL 后启用云端）'}
        </div>
      </div>
    </div>
  )
}
