import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star } from 'lucide-react'
import { useTaskMutations } from './api'
import { toast } from 'sonner'
import { todayStr } from '@/lib/db/types'
import { cn } from '@/lib/utils'

export function TaskDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { create } = useTaskMutations()
  const [title, setTitle] = useState('')
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [focus, setFocus] = useState(false)

  useEffect(() => { if (open) { setTitle(''); setPriority('medium'); setFocus(false) } }, [open])

  function submit() {
    if (!title.trim()) return
    create.mutate({ title: title.trim(), priority, focus, dueDate: todayStr() }, { onSuccess: () => { setTitle(''); onOpenChange(false); toast.success('已添加') } })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>新建任务</DialogTitle></DialogHeader>
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
          <Button className="w-full" onClick={submit} disabled={!title.trim() || create.isPending}>添加</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
