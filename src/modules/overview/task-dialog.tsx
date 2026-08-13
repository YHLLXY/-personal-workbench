import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star } from 'lucide-react'
import { useTaskMutations } from './api'
import { toast } from 'sonner'
import { todayStr } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import type { Task } from '@/lib/db/types'

/** 新建 / 编辑任务对话框。focus 开关联动 focusDate：开 → 今天，关 → null */
export function TaskDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing?: Task | null }) {
  const { create, update } = useTaskMutations()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [focus, setFocus] = useState(false)
  const [dueDate, setDueDate] = useState(todayStr())
  const [dueTime, setDueTime] = useState('')
  const [tagsText, setTagsText] = useState('')

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? '')
      setPriority(editing?.priority ?? 'medium')
      setFocus(editing?.focus ?? false)
      setDueDate(editing?.dueDate ?? todayStr())
      setDueTime(editing?.dueTime ?? '')
      setTagsText(editing?.tags?.join('，') ?? '')
    }
  }, [open, editing])

  function submit() {
    if (!title.trim()) return
    const tags = tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    const payload = {
      title: title.trim(),
      priority,
      focus,
      focusDate: focus ? todayStr() : null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      tags,
    }
    const onDone = () => { onOpenChange(false); toast.success(editing ? '已保存' : '已添加') }
    if (editing) update.mutate({ id: editing.id, patch: payload }, { onSuccess: onDone })
    else create.mutate(payload, { onSuccess: onDone })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? '编辑任务' : '新建任务'}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="任务内容" onKeyDown={e => e.key === 'Enter' && submit()} />
          <div className="flex gap-3">
            <Select value={priority} onValueChange={v => setPriority(v as typeof priority)}>
              <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="high"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />高优先级</span></SelectItem>
                <SelectItem value="medium"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />中优先级</span></SelectItem>
                <SelectItem value="low"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/40" />低优先级</span></SelectItem>
              </SelectContent>
            </Select>
            <Button variant={focus ? 'default' : 'outline'} type="button" className="flex-1" onClick={() => setFocus(f => !f)}>
              <Star className={cn('size-3.5 mr-1.5', focus && 'fill-current')} strokeWidth={1.7} />{focus ? '今日焦点' : '设为焦点'}
            </Button>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due-date">日期（可清空；焦点任务仅在所选日期显示）</Label>
            <Input id="task-due-date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due-time">提醒时间（可选，到点通知）</Label>
            <Input id="task-due-time" type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-tags">标签（可选，逗号分隔）</Label>
            <Input id="task-tags" value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="如：工作，学习" />
          </div>
          <Button className="w-full" onClick={submit} disabled={!title.trim() || (editing ? update.isPending : create.isPending)}>{editing ? '保存' : '添加'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
