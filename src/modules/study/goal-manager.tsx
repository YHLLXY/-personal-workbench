import { useEffect, useState } from 'react'
import { CheckCircle2, Minus, Pencil, Plus, PlusCircle, RotateCcw, Target, Trash2 } from 'lucide-react'
import { useStudyGoals, useStudyGoalMutations } from './goals-api'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { StudyGoal } from '@/lib/db/types'

/** 学习目标管理：进度条 + 进度步进 + 截止日 + 完成归档 + 删除 */
export default function GoalManager() {
  const { data: goals, isLoading } = useStudyGoals()
  const { update, remove } = useStudyGoalMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StudyGoal | null>(null)

  const sorted = [...(goals ?? [])].sort((a, b) => {
    // 进行中在前（未归档优先），同状态按目标进度高的在前
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1
    return (b.progress / Math.max(b.target, 1)) - (a.progress / Math.max(a.target, 1))
  })

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">为目标设一个量化的终点，每天前进一点点</p>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}><PlusCircle className="size-4 mr-1" />新建目标</Button>
      </div>
      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-8 text-center">还没有学习目标，先定一个小目标吧</p>
      ) : (
        <div className="space-y-2">
          {sorted.map(g => {
            const pct = Math.min(100, Math.round((g.progress / Math.max(g.target, 1)) * 100))
            const done = g.status === 'done'
            return (
              <div key={g.id} className={cn('bg-card border border-border rounded-2xl p-4', done && 'opacity-60')}>
                <div className="flex items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Target className="size-4 text-primary shrink-0" strokeWidth={1.7} />
                      <span className={cn('text-sm font-semibold truncate', done && 'line-through text-muted-foreground')}>{g.title}</span>
                      {done && <span className="text-[10px] bg-primary/12 text-primary rounded-full px-2 py-0.5 shrink-0">已完成</span>}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={pct} className="h-2 flex-1" />
                      <span className="shrink-0 text-xs font-numeric text-muted-foreground">{g.progress} / {g.target}</span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      {g.deadline && <span>截止 {g.deadline}</span>}
                      {g.note && <span className="truncate max-w-[16rem]">备注：{g.note}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {!done ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => update.mutate({ id: g.id, patch: { progress: Math.max(0, g.progress - 1) } })} aria-label="进度 -1" className="size-7 rounded-lg border border-border text-muted-foreground hover:border-primary/40 flex items-center justify-center"><Minus className="size-3.5" /></button>
                        <button onClick={() => update.mutate({ id: g.id, patch: { progress: g.progress + 1 } })} aria-label="进度 +1" className="size-7 rounded-lg border border-border text-muted-foreground hover:border-primary/40 flex items-center justify-center"><Plus className="size-3.5" /></button>
                      </div>
                    ) : (
                      <button onClick={() => update.mutate({ id: g.id, patch: { status: 'active' } })} aria-label="恢复进行中" title="恢复进行中" className="size-7 rounded-lg border border-border text-muted-foreground hover:border-primary/40 flex items-center justify-center"><RotateCcw className="size-3.5" /></button>
                    )}
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setEditing(g); setDialogOpen(true) }} aria-label="编辑" className="p-1.5 text-muted-foreground/60 hover:text-primary rounded-lg"><Pencil className="size-3.5" /></button>
                      <button onClick={() => remove.mutate(g.id)} aria-label="删除" className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded-lg"><Trash2 className="size-3.5" /></button>
                    </div>
                  </div>
                </div>
                {!done && pct >= 100 && (
                  <Button size="sm" variant="outline" className="mt-3 w-full h-7 text-xs" onClick={() => update.mutate({ id: g.id, patch: { status: 'done' } })}>
                    <CheckCircle2 className="size-3.5 mr-1" />进度已满，归档完成
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      )}
      <GoalDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  )
}

function GoalDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: StudyGoal | null }) {
  const { create, update } = useStudyGoalMutations()
  const [title, setTitle] = useState('')
  const [target, setTarget] = useState('100')
  const [deadline, setDeadline] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? '')
      setTarget(String(editing?.target ?? 100))
      setDeadline(editing?.deadline ?? '')
      setNote(editing?.note ?? '')
    }
  }, [open, editing])

  function submit() {
    if (!title.trim()) return
    const num = Math.max(1, Math.floor(Number(target) || 100))
    const input = { title: title.trim(), target: num, deadline: deadline || null, note: note.trim() || null }
    const onDone = () => onOpenChange(false)
    if (editing) update.mutate({ id: editing.id, patch: input }, { onSuccess: onDone })
    else create.mutate(input, { onSuccess: onDone })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? '编辑目标' : '新建学习目标'}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5"><Label htmlFor="goal-title">目标名称</Label><Input id="goal-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="如：刷完 100 道高数题" /></div>
          <div className="space-y-1.5"><Label htmlFor="goal-target">目标量</Label><Input id="goal-target" type="number" min={1} value={target} onChange={e => setTarget(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="goal-deadline">截止日（可选）</Label><Input id="goal-deadline" type="date" value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="goal-note">备注（可选）</Label><Textarea id="goal-note" value={note} onChange={e => setNote(e.target.value)} rows={2} placeholder="怎么拆解？每天做多少？" /></div>
          <Button className="w-full" onClick={submit} disabled={!title.trim()}>{editing ? '保存' : '创建'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
