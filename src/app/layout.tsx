import { Suspense, useEffect, useState } from 'react'
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Search, Settings, Moon, Sun, Plus } from 'lucide-react'
import { modules } from '@/registry'
import { useUiStore } from './store'
import { useTheme } from './theme'
import { useAuth } from './auth'
import { AVATAR_COLORS } from '../lib/profile'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { CommandPalette } from './command-palette'
import { QuickCapture } from './quick-capture'
import { ShortcutsDialog } from './shortcuts-dialog'
import { OnboardingOverlay } from './onboarding'
import { useGlobalHotkeys } from './hotkeys'
import { useReminderSync } from '@/modules/reminders/api'
import { ErrorBoundary } from '@/components/error-boundary'
import { greeting } from './daily-summary'

/** 移动端底部 Tab：取每个主模块第一个子模块 + 「我的」。
 *  review（今日复盘）不在底部 Tab：移动端仅保留首页卡片入口（home-review），路径 /review 仍可用（侧边栏/命令面板/复盘卡片）。 */
const MOBILE_TABS = [
  ...modules.filter(m => m.id !== 'review').map(m => ({ sub: m.children[0] })),
  { sub: { id: 'me', name: '我的', icon: Settings, path: '/settings', component: () => null } },
]

export function Shell() {
  const { resolvedTheme, toggle } = useTheme()
  const { user } = useAuth()
  const setPaletteOpen = useUiStore(s => s.setPaletteOpen)
  const setCaptureOpen = useUiStore(s => s.setCaptureOpen)
  const setCaptureTab = useUiStore(s => s.setCaptureTab)
  useGlobalHotkeys()
  useReminderSync() // 订阅提醒数据 → 更新 store 未读数 → Shell 重渲染 → 侧边栏角标联动
  const navigate = useNavigate()
  const location = useLocation() // 订阅路由变化，确保 active 样式刷新
  const [offline, setOffline] = useState(() => typeof navigator !== 'undefined' && !navigator.onLine)
  useEffect(() => {
    const on = () => setOffline(false)
    const off = () => setOffline(true)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off) }
  }, [])
  const today = new Date()
  const dateStr = `${today.getFullYear()} 年 ${today.getMonth() + 1} 月 ${today.getDate()} 日`

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      {/* 桌面/平板侧边栏：>=md 显示；<xl 折叠为图标栏 */}
      <aside className="hidden md:flex md:flex-col md:w-[200px] xl:w-[224px] shrink-0 border-r border-border bg-card/60 backdrop-blur px-2 py-4">
        <div className="flex items-center gap-2 px-3 pb-4 mb-2 border-b border-border">
          <span className="size-2.5 rounded-full bg-primary" />
          <span className="font-bold text-sm">我的工作台</span>
        </div>
        <nav className="flex-1 overflow-y-auto">
          {modules.map(m => (
            <div key={m.id} className="mb-1">
              <div className="px-3 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground/70 hidden xl:block">
                {m.name}
              </div>
              {m.children.map(sub => {
                const Icon = sub.icon
                const badge = sub.badge?.() ?? null
                const active = sub.path === '/' ? location.pathname === '/' : location.pathname.startsWith(sub.path)
                return (
                  <NavLink key={sub.id} to={sub.path}
                    aria-label={sub.name}
                    className={cn('flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground transition-colors',
                      active && 'bg-primary/12 text-primary font-medium')}>
                    <Icon className="size-4 shrink-0" strokeWidth={1.7} />
                    <span className="hidden xl:inline">{sub.name}</span>
                    {badge && (
                      <span className="ml-auto hidden xl:inline-block text-[10px] bg-accent/40 text-accent-foreground rounded-full px-1.5">
                        {badge}
                      </span>
                    )}
                  </NavLink>
                )
              })}
            </div>
          ))}
          {modules.length === 0 && (
            <p className="px-3 py-2 text-[11px] text-muted-foreground/60">模块注册中…</p>
          )}
        </nav>
        <div className="border-t border-border pt-2">
          <button onClick={() => navigate('/settings')} aria-label="设置" className="flex w-full items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:bg-muted">
            <Settings className="size-4" strokeWidth={1.7} />
            <span className="hidden xl:inline">设置</span>
          </button>
        </div>
      </aside>

      {/* 主区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {offline && <div className="bg-amber-500/90 text-amber-950 text-[11px] text-center py-1">当前离线 · 数据保存在本机，恢复联网后自动同步</div>}
        {/* 顶栏 */}
        <header className="flex items-center gap-3 px-4 md:px-6 py-3 border-b border-border bg-card/60 backdrop-blur sticky top-0 z-20">
          <div className="text-sm font-semibold">
            {greeting(new Date())}
            <span className="ml-2 text-xs font-normal text-muted-foreground hidden sm:inline">{dateStr}</span>
          </div>
          <button onClick={() => setPaletteOpen(true)}
            className="ml-auto hidden sm:flex items-center gap-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-1.5 hover:bg-muted/70">
            <Search className="size-3.5" /> 搜索任务、笔记、热点…
            <kbd className="text-[10px] border border-border rounded px-1">⌘K</kbd>
          </button>
          <Button variant="ghost" size="icon" className="sm:hidden" aria-label="搜索" onClick={() => setPaletteOpen(true)}>
            <Search className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" aria-label={`切换主题（当前：${resolvedTheme === 'dark' ? '深色' : '浅色'}）`} onClick={toggle}>
            {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </Button>
          <div className="size-8 rounded-full text-white flex items-center justify-center text-xs font-bold"
            style={{ backgroundColor: user?.avatarColor ?? AVATAR_COLORS[0] }}>
            {(user?.nickname || user?.email || '我')[0]?.toUpperCase()}
          </div>
        </header>

        {/* 内容 */}
        <main className="flex-1 overflow-y-auto px-4 md:px-6 py-4 md:py-6 pb-32 md:pb-6">
          <ErrorBoundary>
            <Suspense fallback={<div className="space-y-3"><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>}>
              {/* key=pathname 使路由切换时整块重挂载，重播页面入场动画 */}
              <div key={location.pathname} className="page-enter">
                <Outlet />
              </div>
            </Suspense>
          </ErrorBoundary>
        </main>
      </div>

      {/* 移动端底部 Tab */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border grid pb-[env(safe-area-inset-bottom)]"
        style={{ gridTemplateColumns: `repeat(${MOBILE_TABS.length}, minmax(0, 1fr))` }}>
        {MOBILE_TABS.map(t => (
          <button key={t.sub.id} onClick={() => navigate(t.sub.path)}
            className={cn('flex flex-col items-center gap-0.5 py-2 text-[10px] text-muted-foreground', isMobileActive(t.sub.path, location.pathname) && 'text-primary font-semibold')}>
            <t.sub.icon className="size-5" strokeWidth={1.7} />
            {t.sub.name}
          </button>
        ))}
      </nav>

      {/* 移动端 FAB */}
      <button onClick={() => { setCaptureTab('task'); setCaptureOpen(true) }} aria-label="快速捕获"
        className="md:hidden fixed bottom-20 right-4 z-30 size-12 rounded-full bg-primary text-primary-foreground shadow-lg shadow-primary/30 flex items-center justify-center">
        <Plus className="size-5" />
      </button>

      <CommandPalette />
      <QuickCapture />
      <ShortcutsDialog />
      <OnboardingOverlay />
    </div>
  )
}

function isMobileActive(path: string, current: string) {
  if (path === '/') return current === '/'
  return current.startsWith(path)
}
