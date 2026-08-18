import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Download, FolderKanban, KeyRound, LogOut, Upload } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { toast } from 'sonner'
import { useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/app/auth'
import { isCloudMode, repository } from '@/lib/db'
import { getSupabaseClient } from '@/lib/db/supabase-client'
import { AVATAR_COLORS } from '@/lib/profile'
import { validateBackup, formatBytes, downloadBackupFile } from '@/lib/backup'
import { taskCompletionRate, totalFocusMinutes, formatMinutes, activeNoteCount } from '@/lib/stats'
import { streakFromLogDates } from '@/lib/heatmap'
import { useTasks } from '@/modules/overview/api'
import { useFocusSessions } from '@/modules/study/api'
import { useHabitLogs } from '@/modules/health/api'
import { useReviews } from '@/modules/review/api'
import { useNotes, usePapers } from '@/modules/news/api'
import { NotificationSection } from './notifications-section'

/** 个人中心页：资料卡 / 数据统计 / 数据管理 / 通知 / 账号 / 关于 */
export function SettingsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <h1 className="text-xl font-bold">个人中心</h1>
      <ProfileCard />
      <section className="flex items-center justify-between rounded-2xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <FolderKanban className="size-5 text-primary" strokeWidth={1.7} />
          <div>
            <div className="text-sm font-semibold">我的项目</div>
            <p className="mt-0.5 text-xs text-muted-foreground">知识库项目状态总览（门户口动态同步）</p>
          </div>
        </div>
        <Link to="/projects" aria-label="查看我的项目">
          <Button size="sm" variant="outline"><ArrowRight className="size-3.5" /></Button>
        </Link>
      </section>
      <section>
        <h2 className="mb-2 text-sm font-semibold">数据统计</h2>
        <StatsGrid />
      </section>
      <DataSection />
      <NotificationSection />
      <AccountSection />
      <AboutSection />
    </div>
  )
}

function ProfileCard() {
  const { user, updateProfile } = useAuth()
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [saving, setSaving] = useState(false)
  const initial = ((user?.nickname || user?.email || '我')[0] ?? '我').toUpperCase()

  useEffect(() => {
    setNickname(user?.nickname ?? '')
  }, [user?.nickname])

  function save(next: { nickname?: string; avatarColor?: string }) {
    if (saving) return
    setSaving(true)
    updateProfile(next)
      .then(() => toast.success('已保存'))
      .catch(() => toast.error('保存失败，请重试'))
      .finally(() => setSaving(false))
  }

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 sm:flex-row sm:items-center">
      <div className="flex items-center gap-4">
        <div className="flex size-16 shrink-0 items-center justify-center rounded-full text-xl font-bold text-white"
          style={{ backgroundColor: user?.avatarColor ?? AVATAR_COLORS[0] }}>{initial}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Input value={nickname} onChange={e => setNickname(e.target.value)} placeholder="设置昵称"
              className="h-8 w-36" onKeyDown={e => { if (e.key === 'Enter' && nickname.trim()) save({ nickname: nickname.trim() }) }} />
            <Button size="sm" variant="outline" disabled={saving || !nickname.trim()} onClick={() => save({ nickname: nickname.trim() })}>保存</Button>
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">{user?.email || '本地模式（无账号）'}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{isCloudMode ? '☁️ 云端同步' : '💾 本地存储'}</p>
        </div>
      </div>
      <div className="sm:ml-auto">
        <div className="mb-1.5 text-[10px] text-muted-foreground">头像颜色</div>
        <div className="flex gap-1.5">
          {AVATAR_COLORS.map(c => (
            <button key={c} aria-label={`头像颜色 ${c}`} onClick={() => save({ avatarColor: c })} disabled={saving}
              className={`size-6 rounded-full transition-transform hover:scale-110 ${user?.avatarColor === c ? 'ring-2 ring-primary ring-offset-2' : ''} disabled:opacity-50`}
              style={{ backgroundColor: c }} />
          ))}
        </div>
      </div>
    </div>
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

function DataSection() {
  const qc = useQueryClient()
  const [usage, setUsage] = useState<string | null>(null)

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
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">数据管理</h2>
      <p className="text-xs text-muted-foreground">导出备份文件可随时恢复，也可用于本地 ↔ 云端迁移（导入会覆盖当前全部数据）</p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={handleExport}><Download className="mr-1 size-3.5" />导出备份</Button>
        <label className="cursor-pointer">
          <span className="sr-only">选择备份文件</span>
          <input type="file" accept=".json" className="hidden" onChange={handleImportFile} />
          <Button type="button" variant="outline" size="sm"><Upload className="mr-1 size-3.5" />导入恢复</Button>
        </label>
      </div>
      <div className="pt-1 text-xs text-muted-foreground">
        {isCloudMode ? '数据在云端同步，无本地占用' : usage ? `本地存储占用：${usage}` : '本地存储占用：计算中…'}
      </div>
    </section>
  )
}

function AccountSection() {
  const { signOut } = useAuth()
  const [pwOpen, setPwOpen] = useState(false)

  if (!isCloudMode) {
    return (
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="text-sm font-medium">账号</h2>
        <p className="mt-1 text-xs text-muted-foreground">本地模式无账号，数据仅存本机。配置云端后账号功能可用。</p>
      </section>
    )
  }
  return (
    <section className="space-y-3 rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">账号</h2>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => setPwOpen(true)}><KeyRound className="mr-1 size-3.5" />修改密码</Button>
        <Button size="sm" variant="outline" onClick={signOut}><LogOut className="mr-1 size-3.5" />退出登录</Button>
      </div>
      <ChangePasswordDialog open={pwOpen} onOpenChange={setPwOpen} />
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

function AboutSection() {
  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      <h2 className="text-sm font-medium">关于</h2>
      <p className="mt-1 text-xs text-muted-foreground">我的工作台 v1.2 —— 待办、专注、打卡、复盘，一处安放。</p>
      <p className="mt-1 text-[10px] text-muted-foreground/70">数据仅你本人可见；导出文件请自行妥善保管。</p>
    </section>
  )
}
