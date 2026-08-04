import { useState } from 'react'
import { Flame, Scale, Moon, Dumbbell, Trash2, Plus } from 'lucide-react'
import { useHabits, useHabitLogs, useSetHabitLog, useHealthLogs, useHealthMutations } from './api'
import { HabitManager } from './habit-manager'
import { todayStr } from '@/lib/db/types'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

export default function Health() {
  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold mb-1">运动健康</h1>
      <p className="text-xs text-muted-foreground mb-4">习惯打卡 · 体重 / 睡眠 / 运动记录</p>
      <Tabs defaultValue="checkin">
        <TabsList>
          <TabsTrigger value="checkin">今日打卡</TabsTrigger>
          <TabsTrigger value="habits">习惯管理</TabsTrigger>
          <TabsTrigger value="records">身体记录</TabsTrigger>
        </TabsList>
        <TabsContent value="checkin" className="pt-4"><CheckinPanel /></TabsContent>
        <TabsContent value="habits" className="pt-4"><HabitManager /></TabsContent>
        <TabsContent value="records" className="pt-4"><RecordsPanel /></TabsContent>
      </Tabs>
    </div>
  )
}

function CheckinPanel() {
  const { data: habits } = useHabits()
  const { data: logs } = useHabitLogs()
  const setLog = useSetHabitLog()
  const today = todayStr()

  return (
    <div className="space-y-2">
      {(habits ?? []).filter(h => h.active).length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">先去「习惯管理」添加习惯</p>}
      {(habits ?? []).filter(h => h.active).map(h => {
        const done = logs?.find(l => l.habitId === h.id && l.logDate === today)?.count ?? 0
        return (
          <div key={h.id} className="flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3">
            <span className="text-lg">{h.icon}</span>
            <span className="text-sm flex-1">{h.name}</span>
            <span className="text-xs text-muted-foreground font-numeric">{done}/{h.targetPerDay}</span>
            {/* 多目标习惯打满后，点按逐步撤销（减 1）而非清零，避免误触丢全天记录 */}
            <button onClick={() => { const next = done >= h.targetPerDay ? done - 1 : done + 1; setLog.mutate({ habitId: h.id, date: today, count: next }, { onSuccess: () => next === 0 && toast.success(`已取消「${h.name}」`) }) }}
              aria-label={`打卡 ${h.name}`}
              className={cn('size-6 rounded-full border-[1.5px] flex items-center justify-center transition-colors', done > 0 ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 text-muted-foreground hover:border-primary')}>
              {done > 0 ? <Flame className="size-3.5" /> : <Plus className="size-3.5" />}
            </button>
          </div>
        )
      })}
    </div>
  )
}

function RecordsPanel() {
  const { data: logs } = useHealthLogs()
  const { create, remove } = useHealthMutations()
  const [type, setType] = useState<'weight' | 'sleep' | 'exercise'>('weight')
  const [value, setValue] = useState('')

  const records = [...(logs ?? [])].sort((a, b) => b.logDate.localeCompare(a.logDate))

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {([['weight', '体重'], ['sleep', '睡眠'], ['exercise', '运动']] as const).map(([t, label]) => (
          <button key={t} onClick={() => { setType(t); setValue('') }} className={cn('text-xs px-3 py-1.5 rounded-full border', type === t ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label}</button>
        ))}
        <Input type="number" step="0.1" min="0" max={type === 'sleep' ? 24 : undefined} value={value} onChange={e => setValue(e.target.value)} placeholder={type === 'weight' ? 'kg' : type === 'sleep' ? '小时' : '分钟'} className="w-24 h-8 text-sm ml-auto" />
        <Button size="sm" disabled={!value || Number(value) <= 0} onClick={() => { create.mutate({ logDate: todayStr(), type, value: Number(value) }, { onSuccess: () => { setValue(''); toast.success('已记录') } }) }}>记录</Button>
      </div>
      <div className="bg-card border border-border rounded-2xl divide-y divide-border/70">
        {records.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">还没有身体记录</p> : records.slice(0, 20).map(r => (
          <div key={r.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
            <span className="text-muted-foreground">{r.type === 'weight' ? <Scale className="size-4" /> : r.type === 'sleep' ? <Moon className="size-4" /> : <Dumbbell className="size-4" />}</span>
            <span className="font-numeric font-medium">{r.value}{r.type === 'weight' ? ' kg' : r.type === 'sleep' ? ' h' : ' min'}</span>
            <span className="text-xs text-muted-foreground ml-auto">{r.logDate}</span>
            <button onClick={() => remove.mutate(r.id)} aria-label="删除记录" className="text-muted-foreground/50 hover:text-destructive"><Trash2 className="size-3.5" /></button>
          </div>
        ))}
      </div>
    </div>
  )
}
