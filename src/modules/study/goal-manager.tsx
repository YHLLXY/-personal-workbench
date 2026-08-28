import { useEffect, useState } from 'react'
import { Check, CheckCircle2, Minus, Pencil, Plus, PlusCircle, RotateCcw, Target, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useStudyGoals, useStudyGoalMutations } from './goals-api'
import { daysUntil } from './api'
import { celebrate } from '@/lib/celebrate'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { StudyGoal } from '@/lib/db/types'

/** 学习目标管理：进度步进（±1/+5/+10/精确设置）+ 截止速率倒推 + 里程碑庆祝 + 完成归档 + 删除 */
export default function GoalManager() {
  const { data: goals, isLoading } = useStudyGoals()
  const { update, remove } = useStudyGoalMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StudyGoal | null>(null)
  // 精确设置进度：editingId 指向正在内联编辑的目标，draft 为输入草稿
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')

  /** 精确设置进度：草稿转数字后按差值推进（复用 advance 的 clamp 与里程碑反馈），非法输入静默取消 */
  function commitEdit(g: StudyGoal) {
    const num = Math.floor(Number(draft))
    setEditingId(null)
    if (!Number.isFinite(num) || draft.trim() === '') return
    advance(g, num - g.progress)
  }

  /** 推进进度（delta 可负）：clamp 到 [0, target]，跨越 25/50/75 里程碑与达成 100 时给庆祝反馈 */
  function advance(g: StudyGoal, delta: number) {
    const before = Math.min(Math.round((g.progress / Math.max(g.target, 1)) * 100), 100)
    const next = Math.min(Math.max(g.progress + delta, 0), g.target)
    update.mutate({ id: g.id, patch: { progress: next } })
    const after = Math.min(Math.round((next / Math.max(g.target, 1)) * 100), 100)
    if (after >= 100 && before < 100) {
      void celebrate(null, 'grand')
      toast.success(`达成目标「${g.title}」🎉 去归档吧`)
    } else {
      const crossed = [25, 50, 75].find(q => before < q && after >= q)
      if (crossed) {
        void celebrate(null, 'single')
        toast.success(`「${g.title}」已过 ${crossed}%`)
      }
    }
  }

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
                      <div className="relative flex-1">
                        <Progress value={pct} className="h-2" />
                        {/* 25/50/75 里程碑刻度线 */}
                        {[25, 50, 75].map(q => <span key={q} className="absolute top-0 bottom-0 w-px bg-border/80" style={{ left: `${q}%` }} />)}
                      </div>
                      {editingId === g.id ? (
                        <span className="shrink-0 flex items-center gap-1">
                          <Input autoFocus type="number" min={0} max={g.target} value={draft} onChange={e => setDraft(e.target.value)}
                            onKeyDown={e => e.key === 'Enter' && commitEdit(g)} className="h-6 w-16 text-xs font-numeric" />
                          <button onClick={() => commitEdit(g)} aria-label="确认进度" className="size-6 rounded-lg border border-primary/40 text-primary flex items-center justify-center"><Check className="size-3.5" /></button>
                        </span>
                      ) : (
                        <button onClick={() => { setEditingId(g.id); setDraft(String(g.progress)) }} title="点击精确设置进度"
                          className="shrink-0 text-xs font-numeric text-muted-foreground hover:text-primary underline decoration-dotted underline-offset-2">
                          {g.progress} / {g.target}
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                      {g.deadline && !done && (() => {
                        const d = daysUntil(g.deadline)
                        const remain = Math.max(g.target - g.progress, 0)
                        if (d < 0) return <span className="text-destructive font-medium">已逾期 {Math.abs(d)} 天</span>
                        if (remain === 0) return <span>进度已满 · 截止 {g.deadline}</span>
                        if (d === 0) return <span className="text-amber-600 dark:text-amber-400 font-medium">今天截止 · 还差 {remain}</span>
                        return <span>截止 {g.deadline} · 剩 {d} 天，每天约 {Math.ceil(remain / d)}</span>
                      })()}
                      {g.deadline && done && <span>截止 {g.deadline}</span>}
                      {g.note && <span className="truncate max-w-[16rem]">备注：{g.note}</span>}
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {!done ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => advance(g, -1)} aria-label="进度 -1" className="size-7 rounded-lg border border-border text-muted-foreground hover:border-primary/40 flex items-center justify-center"><Minus className="size-3.5" /></button>
                        <button onClick={() => advance(g, 1)} aria-label="进度 +1" className="size-7 rounded-lg border border-border text-muted-foreground hover:border-primary/40 flex items-center justify-center"><Plus className="size-3.5" /></button>
                        {g.target >= 10 && <button onClick={() => advance(g, 5)} aria-label="进度 +5" className="h-7 px-1.5 rounded-lg border border-border text-[10px] font-numeric text-muted-foreground hover:border-primary/40 flex items-center justify-center">+5</button>}
                        {g.target >= 10 && <button onClick={() => advance(g, 10)} aria-label="进度 +10" className="h-7 px-1.5 rounded-lg border border-border text-[10px] font-numeric text-muted-foreground hover:border-primary/40 flex items-center justify-center">+10</button>}
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

  // 提交防连击：云端 insert 有网络往返，等待期间再点会重复创建（2026-08 线上反馈：一设一个变两个）
  const pending = create.isPending || update.isPending

  function submit() {
    if (!title.trim() || pending) return
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
          <Button className="w-full" onClick={submit} disabled={!title.trim() || pending}>{pending ? '保存中…' : editing ? '保存' : '创建'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
