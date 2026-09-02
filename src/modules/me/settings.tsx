import { useEffect, useState } from 'react'
import { ChevronRight, Download, HardDrive, History, KeyRound, LogOut, Palette, Smartphone, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/auth'
import { isCloudMode, repository } from '@/lib/db'
import { getSupabaseClient } from '@/lib/db/supabase-client'
import { AVATAR_COLORS } from '@/lib/profile'
import { validateBackup, formatBytes, downloadBackupFile, markBackupDone, backupAgeDays, backupAgeLabel } from '@/lib/backup'
import { taskCompletionRate, totalFocusMinutes, formatMinutes, activeNoteCount, buildWeeklyTrend } from '@/lib/stats'
import { streakFromLogDates } from '@/lib/heatmap'
import { streakMilestone } from '@/lib/celebrate'
import { todayStr } from '@/lib/db/types'
import { useTasks } from '@/modules/overview/api'
import { useFocusSessions } from '@/modules/study/api'
import { useHabitStats, useHabitLogs } from '@/modules/health/api'
import { useReviews } from '@/modules/review/api'
import { useNotes, usePapers } from '@/modules/news/api'
import { useTheme, type Theme } from '@/app/theme'
import { CHANGELOG } from '@/app/changelog'
import { promptInstall, usePwaInstall } from '@/lib/pwa-install'
import { WeeklyTrendCard } from '@/modules/overview/weekly-trend'
import { cn } from '@/lib/utils'
import { NotificationSection } from './notifications-section'

/** 我的页：身份卡 / 本周趋势 / 累计统计 / 设置分组（外观·通知·数据·账号）/ 关于。
 *  v1.23 五段式改版——依据 docs/plans/PLAN_ME_PAGE_REDESIGN.md（高频在上、破坏性收底、状态徽章、渐进披露）。 */
export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">我的</h1>
      <ProfileHero />
      <WeeklyTrendCard />
      <section>
        <h2 className="mb-2 text-sm font-semibold">累计统计</h2>
        <StatsGrid />
      </section>
      <AppearanceSection />
      <NotificationSection />
      <DataSection />
      <AccountSection />
      <AboutSection />
    </div>
  )
}

/** 身份卡：头像 + 昵称 + 模式徽章 + 三个关键数字（共享既有查询缓存，不新增请求） */
function ProfileHero() {
  const { user } = useAuth()
  const { data: stats } = useHabitStats()
  const { data: tasks } = useTasks()
  const { data: sessions } = useFocusSessions()
  const [editOpen, setEditOpen] = useState(false)
  const initial = ((user?.nickname || user?.email || '我')[0] ?? '我').toUpperCase()
  const rate = taskCompletionRate(tasks ?? [])
  const weekMinutes = buildWeeklyTrend(tasks ?? [], sessions ?? [], todayStr()).reduce((sum, d) => sum + d.minutes, 0)
  const milestone = streakMilestone(stats?.streak ?? 0)

  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
          style={{ backgroundColor: user?.avatarColor ?? AVATAR_COLORS[0] }}>{initial}</div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-lg font-bold">{user?.nickname || '未设置昵称'}</div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {user?.email
              ? <span className="max-w-56 truncate text-xs text-muted-foreground">{user.email}</span>
              : <span className="text-xs text-muted-foreground">本地模式</span>}
            <Badge variant="outline" className="text-[10px]">{isCloudMode ? '☁️ 云端同步' : '💾 本地存储'}</Badge>
          </div>
        </div>
        <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5 text-xs" onClick={() => setEditOpen(true)}>编辑</Button>
      </div>
      <div className="mt-4 grid grid-cols-3 divide-x divide-border border-t border-border pt-3">
        <HeroStat main={stats ? `${stats.streak}` : '…'} unit="天" label={milestone ? `连续打卡 🎉${milestone}` : '连续打卡'} />
        <HeroStat main={`${weekMinutes}`} unit="分" label="本周专注" />
        <HeroStat main={rate.total === 0 ? '—' : `${rate.rate}%`} label="待办完成率（累计）" />
      </div>
      <ProfileEditDialog open={editOpen} onOpenChange={setEditOpen} />
    </div>
  )
}

function HeroStat({ main, unit, label }: { main: string; unit?: string; label: string }) {
  return (
    <div className="px-1 text-center">
      <div className="text-lg font-bold font-numeric">
        {main}
        {unit && <span className="ml-0.5 text-[10px] font-normal text-muted-foreground">{unit}</span>}
      </div>
      <div className="mt-0.5 text-[10px] text-muted-foreground">{label}</div>
    </div>
  )
}

/** 编辑资料弹窗：昵称 + 头像色一次保存（防连击：isPending 禁用） */
function ProfileEditDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { user, updateProfile } = useAuth()
  const [nickname, setNickname] = useState('')
  const [color, setColor] = useState<string>(AVATAR_COLORS[0])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setNickname(user?.nickname ?? '')
      setColor(user?.avatarColor ?? AVATAR_COLORS[0])
    }
  }, [open, user?.nickname, user?.avatarColor])

  function save() {
    if (saving) return
    const next: { nickname?: string; avatarColor?: string } = {}
    const name = nickname.trim()
    if (name && name !== user?.nickname) next.nickname = name
    if (color !== user?.avatarColor) next.avatarColor = color
    if (Object.keys(next).length === 0) { onOpenChange(false); return }
    setSaving(true)
    updateProfile(next)
      .then(() => { toast.success('已保存'); onOpenChange(false) })
      .catch(() => toast.error('保存失败，请重试'))
      .finally(() => setSaving(false))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>编辑资料</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor="profile-nickname">昵称</label>
            <Input id="profile-nickname" value={nickname} onChange={e => setNickname(e.target.value)} placeholder="设置昵称"
              onKeyDown={e => { if (e.key === 'Enter') save() }} />
          </div>
          <div className="space-y-1.5">
            <span className="text-xs text-muted-foreground">头像颜色</span>
            <div className="flex gap-2">
              {AVATAR_COLORS.map(c => (
                <button key={c} type="button" aria-label={`头像颜色 ${c}`} aria-pressed={color === c} onClick={() => setColor(c)} disabled={saving}
                  className={`size-7 rounded-full transition-transform hover:scale-110 disabled:opacity-50 ${color === c ? 'ring-2 ring-primary ring-offset-2' : ''}`}
                  style={{ backgroundColor: c }} />
              ))}
            </div>
          </div>
          <Button className="w-full" onClick={save} disabled={saving}>保存</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function StatsGrid() {
  const { data: tasks } = useTasks()
  const { data: logs } = useHabitLogs()
  const { data: sessions } = useFocusSessions()
  const { data: reviews } = useReviews()
  const { data: notes } = useNotes()
  const { data: papers } = usePapers()
  const rate = taskCompletionRate(tasks ?? [])
  const streak = streakFromLogDates((logs ?? []).map(l => l.logDate))
  const items = [
    { label: '待办完成率', value: rate.total === 0 ? '—' : `${rate.rate}%`, sub: `${rate.done} / ${rate.total} 项` },
    { label: '连续打卡', value: `${streak}`, sub: '天' },
    { label: '专注总时长', value: formatMinutes(totalFocusMinutes(sessions ?? [])), sub: '番茄钟累计' },
    { label: '复盘次数', value: `${reviews?.length ?? 0}`, sub: '篇' },
    { label: '笔记数', value: `${activeNoteCount(notes ?? [])}`, sub: '未归档' },
    { label: '资料库', value: `${papers?.length ?? 0}`, sub: '论文与文案' },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {items.map(it => (
        <div key={it.label} className="rounded-2xl border border-border bg-card p-4">
          <div className="text-lg font-bold font-numeric">{it.value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{it.label}</div>
          <div className="mt-0.5 text-[10px] text-muted-foreground/70">{it.sub}</div>
        </div>
      ))}
    </div>
  )
}

/** 外观：主题三态（顶栏按钮只做明暗互换，「跟随系统」从这里进） */
function AppearanceSection() {
  const { theme, setTheme } = useTheme()
  const options: Array<[Theme, string]> = [['light', '浅色'], ['dark', '深色'], ['system', '跟随系统']]
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">外观</h2>
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3">
        <Palette className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
        <span className="text-sm">主题</span>
        <div className="ml-auto flex gap-1.5">
          {options.map(([v, label]) => (
            <button key={v} onClick={() => setTheme(v)} aria-pressed={theme === v}
              className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors', theme === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground')}>
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}

function DataSection() {
  const qc = useQueryClient()
  const [usage, setUsage] = useState<string | null>(null)
  const [lastBackup, setLastBackup] = useState<number | null>(() => backupAgeDays(localStorage.getItem('wb:last-backup')))

  useEffect(() => {
    // feature-detect：Safari 不支持 storage.estimate
    if (isCloudMode || typeof navigator.storage?.estimate !== 'function') return
    let alive = true
    navigator.storage.estimate()
      .then(e => { if (alive && e.usage != null) setUsage(formatBytes(e.usage)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  async function handleExport() {
    try {
      await downloadBackupFile()
      markBackupDone()
      setLastBackup(backupAgeDays(localStorage.getItem('wb:last-backup')))
      toast.success('已导出备份文件')
    } catch (err) {
      toast.error(`导出失败：${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    let parsed: unknown
    try { parsed = JSON.parse(await file.text()) } catch { toast.error('文件格式已损坏'); return }
    const v = validateBackup(parsed)
    if (!v.ok) { toast.error(v.reason === 'not-workbench' ? '这不是工作台的备份文件' : '文件格式已损坏'); return }
    if (!window.confirm('导入将覆盖当前全部数据，不可撤销。确定继续？')) return
    try {
      await repository.importAll(v.tables)
      qc.invalidateQueries()
      toast.success('导入成功，数据已恢复')
    } catch (err) {
      const isQuota = err instanceof DOMException && err.name === 'QuotaExceededError'
      toast.error(isQuota ? '存储空间不足，建议清理由旧数据或改用云端模式' : `导入失败：${err instanceof Error ? err.message : '未知错误'}`)
    }
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">数据管理</h2>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <Download className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <div className="text-sm">导出备份</div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              上次备份：{backupAgeLabel(lastBackup)}
              {lastBackup != null && lastBackup >= 7 && <span className="font-medium text-amber-600 dark:text-amber-400"> · 建议每周备份一次</span>}
            </p>
          </div>
          <Button size="sm" variant="outline" onClick={handleExport}>导出</Button>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <Upload className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <div className="text-sm">导入恢复</div>
            <p className="mt-0.5 text-xs text-muted-foreground">备份文件会覆盖当前全部数据，也可用于本地 ↔ 云端迁移</p>
          </div>
          <label className="cursor-pointer">
            <span className="sr-only">选择备份文件</span>
            <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
            <Button type="button" variant="outline" size="sm" tabIndex={-1}>导入</Button>
          </label>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <HardDrive className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
          <div className="min-w-0 flex-1 text-sm">{isCloudMode ? '数据在云端同步' : '本地存储占用'}</div>
          <span className="text-xs text-muted-foreground">{isCloudMode ? '无本地占用' : usage ?? '计算中…'}</span>
        </div>
      </div>
    </section>
  )
}

function AccountSection() {
  const { signOut } = useAuth()
  const [pwOpen, setPwOpen] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)

  if (!isCloudMode) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold">账号</h2>
        <div className="rounded-2xl border border-border bg-card">
          <div className="flex items-center gap-3 px-4 py-3">
            <KeyRound className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
            <p className="text-xs text-muted-foreground">本地模式无账号，数据仅存本机。配置云端后账号功能可用。</p>
          </div>
        </div>
      </section>
    )
  }
  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">账号</h2>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        <div className="flex items-center gap-3 px-4 py-3">
          <KeyRound className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <div className="text-sm">修改密码</div>
            <p className="mt-0.5 text-xs text-muted-foreground">修改后需重新登录</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => setPwOpen(true)}>修改</Button>
        </div>
        <div className="flex items-center gap-3 px-4 py-3">
          <LogOut className="size-4 shrink-0 text-destructive" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <div className="text-sm text-destructive">退出登录</div>
            <p className="mt-0.5 text-xs text-muted-foreground">数据保存在云端，重新登录即可恢复</p>
          </div>
          <Button size="sm" variant="outline" className="text-destructive hover:text-destructive" onClick={() => setSignOutOpen(true)}>退出</Button>
        </div>
      </div>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
      <Dialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>退出登录</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">确定退出当前账号？数据保存在云端，重新登录即可恢复。</p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setSignOutOpen(false)}>取消</Button>
            <Button variant="destructive" className="flex-1" onClick={() => { setSignOutOpen(false); void signOut() }}>退出登录</Button>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function ChangePasswordDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { signOut } = useAuth()
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) { setPw(''); setPw2('') }
  }, [open])

  async function submit() {
    if (pw.length < 6) { toast.error('密码至少 6 位'); return }
    if (pw !== pw2) { toast.error('两次输入不一致'); return }
    setBusy(true)
    try {
      await getSupabaseClient().auth.updateUser({ password: pw })
      toast.success('密码已修改，请重新登录')
      onOpenChange(false)
      await signOut()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '修改失败，请重试')
    } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>修改密码</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">新密码（至少 6 位）</label>
            <Input type="password" value={pw} onChange={e => setPw(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">确认新密码</label>
            <Input type="password" value={pw2} onChange={e => setPw2(e.target.value)} />
          </div>
          <Button className="w-full" onClick={submit} disabled={busy}>确认修改</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** 关于：动态版本号 + 应用内更新日志 + PWA 安装引导 */
function AboutSection() {
  const [logOpen, setLogOpen] = useState(false)
  const [iosHelpOpen, setIosHelpOpen] = useState(false)
  const { canInstall, installed } = usePwaInstall()
  const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
  const latest = CHANGELOG[0]
  // 已 standalone 运行 → 收起安装行；无 beforeinstallprompt 且非 iOS（如桌面 Safari/Firefox）→ 同样收起
  const showInstall = !installed && (canInstall || isIOS)

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">关于</h2>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        {showInstall && (
          <div className="flex items-center gap-3 px-4 py-3">
            <Smartphone className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">添加到主屏幕</div>
              <p className="mt-0.5 text-xs text-muted-foreground">{isIOS ? 'iOS 通过 Safari「分享 → 添加到主屏幕」安装' : '安装到桌面/主屏幕，秒开、离线可用'}</p>
            </div>
            {canInstall
              ? <Button size="sm" onClick={() => { void promptInstall().then(ok => { if (!ok) toast.error('当前浏览器不支持一键安装，请手动添加') }) }}>安装</Button>
              : <Button size="sm" variant="outline" onClick={() => setIosHelpOpen(true)}>查看方法</Button>}
          </div>
        )}
        <div className="flex items-center gap-3 px-4 py-3">
          <History className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
          <div className="min-w-0 flex-1">
            <div className="text-sm">更新日志</div>
            {latest && <p className="mt-0.5 text-xs text-muted-foreground">{latest.version} · {latest.title}</p>}
          </div>
          <Button size="sm" variant="ghost" aria-label="查看更新日志" onClick={() => setLogOpen(true)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      </div>
      <p className="mt-2 px-1 text-[10px] text-muted-foreground/70">我的工作台 {latest?.version ?? ''} —— 待办、专注、打卡、复盘，一处安放。数据仅你本人可见；导出文件请自行妥善保管。</p>

      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>更新日志</DialogTitle></DialogHeader>
          <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
            {CHANGELOG.map(e => (
              <div key={e.version}>
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-semibold text-primary">{e.version}</span>
                  <span className="text-[10px] text-muted-foreground">{e.date}</span>
                </div>
                <div className="mt-0.5 text-xs font-medium">{e.title}</div>
                <ul className="mt-1 space-y-0.5">
                  {e.items.map((it, i) => <li key={i} className="text-xs leading-relaxed text-muted-foreground">· {it}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={iosHelpOpen} onOpenChange={setIosHelpOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>添加到主屏幕（iPhone / iPad）</DialogTitle></DialogHeader>
          <ol className="list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>在 Safari 中打开工作台</li>
            <li>点底部工具栏的「分享」按钮</li>
            <li>选择「添加到主屏幕」并确认</li>
          </ol>
          <p className="text-xs text-muted-foreground/70">安装后以独立窗口运行，推送通知也依赖主屏幕模式。</p>
        </DialogContent>
      </Dialog>
    </section>
  )
}
