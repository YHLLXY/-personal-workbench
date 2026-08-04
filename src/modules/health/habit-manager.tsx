import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useHabits, useHabitMutations } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

const PRESETS = ['早起', '运动', '背单词', '不熬夜']

export function HabitManager() {
  const { data: habits } = useHabits()
  const { create, remove } = useHabitMutations()
  const [name, setName] = useState('')

  return (
    <div>
      <div className="flex gap-2 mb-3">
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="新习惯，如：阅读 30 分钟" className="h-9 text-sm" />
        <Button size="sm" onClick={() => { if (name.trim()) { create.mutate({ name: name.trim() }, { onSuccess: () => { setName(''); toast.success('习惯已创建') } }) } }}>
          <Plus className="size-3.5 mr-1" />创建
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-4">
        {PRESETS.map(p => <button key={p} onClick={() => create.mutate({ name: p }, { onSuccess: () => toast.success(`已添加「${p}」`) })} className="text-[11px] border border-border rounded-full px-2.5 py-1 text-muted-foreground hover:border-primary hover:text-primary">{p} +</button>)}
      </div>
      <div className="space-y-1.5">
        {(habits ?? []).map(h => (
          <div key={h.id} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3 py-2">
            <span className="text-sm">{h.icon}</span>
            <span className="text-sm flex-1">{h.name}</span>
            <span className="text-[10px] text-muted-foreground">每日 {h.targetPerDay} 次</span>
            <button onClick={() => remove.mutate(h.id)} aria-label={`删除习惯 ${h.name}`} className="p-1 text-muted-foreground/50 hover:text-destructive"><Trash2 className="size-3.5" /></button>
          </div>
        ))}
        {(habits ?? []).length === 0 && <p className="text-xs text-muted-foreground py-3 text-center">还没有习惯，从上面预设开始</p>}
      </div>
    </div>
  )
}
