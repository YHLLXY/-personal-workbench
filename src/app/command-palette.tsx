import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, FilePlus2, HeartPulse, MonitorCog, Download, Settings, Keyboard, Search } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { allSubModules } from '@/registry'
import { useUiStore } from './store'
import { useTheme } from './theme'
import { HOTKEYS, formatShortcut, type Hotkey } from '@/lib/hotkeys'
import { downloadBackupFile } from '@/lib/backup'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface PaletteCommand {
  id: string
  label: string
  icon: LucideIcon
  shortcut?: Hotkey
  run: () => void
}
interface PaletteGroup { title: string; commands: PaletteCommand[] }

const HK = (id: string) => HOTKEYS.find(h => h.id === id)!
const THEME_LABEL: Record<string, string> = { light: '浅色', dark: '深色', system: '跟随系统' }

export function CommandPalette() {
  const open = useUiStore(s => s.paletteOpen)
  const setOpen = useUiStore(s => s.setPaletteOpen)
  const setCaptureOpen = useUiStore(s => s.setCaptureOpen)
  const setCaptureTab = useUiStore(s => s.setCaptureTab)
  const setShortcutsOpen = useUiStore(s => s.setShortcutsOpen)
  const { theme, toggle } = useTheme()
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const groups = useMemo<PaletteGroup[]>(() => {
    const close = () => setOpen(false)
    const openCapture = (tab: 'task' | 'note' | 'habit') => () => { close(); setCaptureTab(tab); setCaptureOpen(true) }
    const match = (label: string) => label.includes(q)
    const nav = allSubModules
      .filter(s => s.name.includes(q) || s.path.includes(q))
      .map(s => ({ id: 'go:' + s.id, label: `前往 ${s.name}`, icon: s.icon, run: () => { navigate(s.path); close() } }))
    return [
      {
        title: '新建',
        commands: [
          { id: 'new:task', label: '新建任务', icon: Plus, shortcut: HK('new-task'), run: openCapture('task') },
          { id: 'new:note', label: '新建速记', icon: FilePlus2, shortcut: HK('new-note'), run: openCapture('note') },
          { id: 'new:habit', label: '打卡今日习惯', icon: HeartPulse, shortcut: HK('checkin'), run: openCapture('habit') },
        ].filter(c => match(c.label)),
      },
      {
        title: '操作',
        commands: [
          {
            id: 'theme', label: `切换主题（当前：${THEME_LABEL[theme]}）`, icon: MonitorCog,
            run: () => { close(); toggle() },
          },
          {
            id: 'export', label: '导出备份', icon: Download,
            run: () => {
              close()
              downloadBackupFile()
                .then(() => toast.success('已导出备份文件'))
                .catch(err => toast.error(`导出失败：${err instanceof Error ? err.message : '未知错误'}`))
            },
          },
          { id: 'shortcuts', label: '快捷键说明', icon: Keyboard, run: () => { close(); setShortcutsOpen(true) } },
          { id: 'settings', label: '打开设置', icon: Settings, shortcut: HK('settings'), run: () => { navigate('/settings'); close() } },
        ].filter(c => match(c.label)),
      },
      { title: '导航', commands: nav },
    ]
  }, [q, navigate, setOpen, setCaptureOpen, setCaptureTab, setShortcutsOpen, theme, toggle])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="size-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="输入命令或搜索…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground" />
        </div>
        <div className="max-h-80 overflow-y-auto p-2 space-y-3">
          {groups.every(g => g.commands.length === 0) && (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配结果</div>
          )}
          {groups.map(g => (
            <div key={g.title}>
              {g.commands.length > 0 && (
                <div className="px-3 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">{g.title}</div>
              )}
              {g.commands.map(it => (
                <button key={it.id} onClick={it.run} className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-muted')}>
                  <it.icon className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
                  <span className="flex-1 text-left truncate">{it.label}</span>
                  {it.shortcut && (
                    <kbd className="text-[10px] border border-border rounded px-1 text-muted-foreground">{formatShortcut(it.shortcut)}</kbd>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
