import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search, Plus, FilePlus2, HeartPulse } from 'lucide-react'
import { allSubModules } from '@/registry'
import { useUiStore } from './store'
import { cn } from '@/lib/utils'

export function CommandPalette() {
  const open = useUiStore(s => s.paletteOpen)
  const setOpen = useUiStore(s => s.setPaletteOpen)
  const setCaptureOpen = useUiStore(s => s.setCaptureOpen)
  const [q, setQ] = useState('')
  const navigate = useNavigate()

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setOpen])

  const items = useMemo(() => {
    const nav = allSubModules.filter(s => s.name.includes(q) || s.path.includes(q)).map(s => ({ id: 'go:' + s.id, label: `前往 ${s.name}`, icon: s.icon, run: () => { navigate(s.path); setOpen(false) } }))
    const actions = [
      { id: 'new:task', label: '新建任务', icon: Plus, run: () => { setOpen(false); setCaptureOpen(true) } },
      { id: 'new:note', label: '新建速记', icon: FilePlus2, run: () => { setOpen(false); navigate('/notes?new=1') } },
      { id: 'new:habit', label: '打卡今日习惯', icon: HeartPulse, run: () => { setOpen(false); navigate('/health') } },
    ]
    const filtered = actions.filter(a => a.label.includes(q))
    return [...filtered, ...nav]
  }, [q, navigate, setOpen, setCaptureOpen])

  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-start justify-center pt-[15vh] px-4" onClick={() => setOpen(false)}>
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search className="size-4 text-muted-foreground" />
          <input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="输入命令或搜索…"
            className="flex-1 bg-transparent outline-none text-sm placeholder:text-muted-foreground" />
        </div>
        <div className="max-h-72 overflow-y-auto p-2">
          {items.length === 0 && <div className="px-3 py-6 text-center text-sm text-muted-foreground">没有匹配结果</div>}
          {items.map(it => (
            <button key={it.id} onClick={it.run} className={cn('w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm hover:bg-muted')}>
              <it.icon className="size-4 text-primary" strokeWidth={1.7} />
              {it.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
