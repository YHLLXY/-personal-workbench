import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { useUiStore } from './store'
import { repository } from '@/lib/db'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { toast } from 'sonner'
import { todayStr } from '@/lib/db/types'
import { cn } from '@/lib/utils'

const TABS = [
  { id: 'task', label: '任务' },
  { id: 'note', label: '速记' },
  { id: 'habit', label: '打卡' },
] as const

export function QuickCapture() {
  const open = useUiStore(s => s.captureOpen)
  const setOpen = useUiStore(s => s.setCaptureOpen)
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('task')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const qc = useQueryClient()

  const addTask = useMutation({ mutationFn: () => repository.createTask({ title, dueDate: todayStr() }), onSuccess: () => { qc.invalidateQueries({ queryKey: ['tasks'] }); toast.success('任务已添加'); reset() }, onError: () => toast.error('添加失败') })
  const addNote = useMutation({ mutationFn: () => repository.createNote(content), onSuccess: () => { qc.invalidateQueries({ queryKey: ['notes'] }); toast.success('已记下'); reset() }, onError: () => toast.error('保存失败') })
  const addLog = useMutation({
    mutationFn: async () => {
      // 优化：日志列表只查一次（计划原文在循环内重复查询，属低效写法）
      const habits = await repository.listHabits()
      const logs = await repository.listHabitLogs()
      const today = todayStr()
      for (const h of habits) {
        const hit = logs.find(l => l.habitId === h.id && l.logDate === today)
        if (hit) await repository.setHabitLog(h.id, today, Math.min(h.targetPerDay, hit.count + 1))
        else await repository.setHabitLog(h.id, today, 1)
      }
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['habitLogs'] }); toast.success('今日习惯已打卡'); reset() },
    onError: () => toast.error('打卡失败'),
  })

  function reset() { setTitle(''); setContent(''); setOpen(false) }
  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center" onClick={() => setOpen(false)}>
      <div className="w-full sm:max-w-md bg-card rounded-t-2xl sm:rounded-2xl border border-border shadow-xl p-4 pb-6" onClick={e => e.stopPropagation()}>
        <div className="flex items-center mb-4">
          <div className="flex gap-1 bg-muted rounded-lg p-1">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={cn('px-3 py-1.5 text-xs rounded-md', tab === t.id ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground')}>{t.label}</button>
            ))}
          </div>
          <button onClick={() => setOpen(false)} className="ml-auto p-1.5 text-muted-foreground hover:bg-muted rounded-lg"><X className="size-4" /></button>
        </div>
        {tab === 'task' && (
          <form onSubmit={e => { e.preventDefault(); if (title.trim()) addTask.mutate() }} className="space-y-3">
            <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="要做什么？今天到期" />
            <Button type="submit" className="w-full" disabled={!title.trim() || addTask.isPending}>添加任务</Button>
          </form>
        )}
        {tab === 'note' && (
          <form onSubmit={e => { e.preventDefault(); if (content.trim()) addNote.mutate() }} className="space-y-3">
            <Textarea autoFocus value={content} onChange={e => setContent(e.target.value)} placeholder="记下这个想法…" rows={4} />
            <Button type="submit" className="w-full" disabled={!content.trim() || addNote.isPending}>保存速记</Button>
          </form>
        )}
        {tab === 'habit' && (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">给今天的全部习惯打一次卡</p>
            <Button className="w-full" onClick={() => addLog.mutate()} disabled={addLog.isPending}>全部打卡</Button>
          </div>
        )}
      </div>
    </div>
  )
}
