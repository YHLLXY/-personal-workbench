import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useExamMutations } from './api'
import type { Exam } from '@/lib/db/types'

export function ExamDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing: Exam | null }) {
  const { create, update } = useExamMutations()
  const [title, setTitle] = useState('')
  const [date, setDate] = useState('')
  const [subject, setSubject] = useState('')

  useEffect(() => {
    if (open) { setTitle(editing?.title ?? ''); setDate(editing?.examDate ?? ''); setSubject(editing?.subject ?? '') }
  }, [open, editing])

  function submit() {
    if (!title.trim() || !date) return
    const input = { title: title.trim(), examDate: date, subject: subject.trim() || null }
    if (editing) update.mutate({ id: editing.id, patch: input }, { onSuccess: () => onOpenChange(false) })
    else create.mutate(input, { onSuccess: () => onOpenChange(false) })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? '编辑考试' : '添加考试'}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5"><Label>名称</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="如：四级模拟考" /></div>
          <div className="space-y-1.5"><Label>日期</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>科目（可选）</Label><Input value={subject} onChange={e => setSubject(e.target.value)} placeholder="如：英语" /></div>
          <Button className="w-full" onClick={submit} disabled={!title.trim() || !date}>{editing ? '保存' : '添加'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
