import { useNavigate } from 'react-router-dom'
import { Plus, Settings } from 'lucide-react'
import { allSubModules } from '@/registry'
import { useUiStore } from '@/app/store'

/** 移动端首页快捷入口宫格：已注册子模块 + 快速捕获 + 设置 */
export function MobileHomeEntries() {
  const navigate = useNavigate()
  const setCaptureOpen = useUiStore(s => s.setCaptureOpen)
  const subs = allSubModules.filter(s => s.id !== 'home')

  return (
    <div className="grid grid-cols-4 gap-2">
      <button onClick={() => setCaptureOpen(true)} aria-label="快速捕获"
        className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-xl py-3 text-primary">
        <Plus className="size-5" strokeWidth={1.7} />
        <span className="text-[10px]">快速捕获</span>
      </button>
      {subs.map(s => {
        const Icon = s.icon
        return (
          <button key={s.id} onClick={() => navigate(s.path)} aria-label={s.name}
            className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-xl py-3 text-muted-foreground">
            <Icon className="size-5" strokeWidth={1.7} />
            <span className="text-[10px]">{s.name}</span>
          </button>
        )
      })}
      <button onClick={() => navigate('/settings')} aria-label="设置"
        className="flex flex-col items-center gap-1.5 bg-card border border-border rounded-xl py-3 text-muted-foreground">
        <Settings className="size-5" strokeWidth={1.7} />
        <span className="text-[10px]">设置</span>
      </button>
    </div>
  )
}
