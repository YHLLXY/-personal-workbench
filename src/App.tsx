import { Suspense, type ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { ThemeProvider } from './app/theme'
import { AuthProvider, useAuth } from './app/auth'
import { Shell } from './app/layout'
import AuthPage from './app/auth-page'
import ResetPasswordPage from './app/reset-password'
import { allSubModules } from './registry'
import { isCloudMode } from './lib/db'
import { Skeleton } from '@/components/ui/skeleton'
import { SettingsPage } from './modules/me/settings'
import { ErrorBoundary } from '@/components/error-boundary'

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
            <ErrorBoundary>
              <Suspense fallback={<div className="p-6 space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}>
                <Routes>
                  <Route path="/login" element={isCloudMode ? <AuthPage /> : <Navigate to="/" replace />} />
                  <Route path="/reset-password" element={isCloudMode ? <ResetPasswordPage /> : <Navigate to="/" replace />} />
                  <Route element={<Guard><Shell /></Guard>}>
                    {allSubModules.map(s => <Route key={s.id} path={s.path} element={<s.component />} />)}
                    <Route path="/settings" element={<SettingsPage />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </Suspense>
            </ErrorBoundary>
          </AuthProvider>
        </BrowserRouter>
      </ThemeProvider>
    </QueryClientProvider>
  )
}

