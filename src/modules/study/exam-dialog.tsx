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
  const [examTime, setExamTime] = useState('')

  useEffect(() => {
    if (open) { setTitle(editing?.title ?? ''); setDate(editing?.examDate ?? ''); setSubject(editing?.subject ?? ''); setExamTime(editing?.examTime ?? '') }
  }, [open, editing])

  function submit() {
    if (!title.trim() || !date) return
    const input = { title: title.trim(), examDate: date, subject: subject.trim() || null, examTime: examTime || null }
    if (editing) update.mutate({ id: editing.id, patch: input }, { onSuccess: () => onOpenChange(false) })
    else create.mutate(input, { onSuccess: () => onOpenChange(false) })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? '编辑考试' : '添加考试'}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <div className="space-y-1.5"><Label htmlFor="exam-title">名称</Label><Input id="exam-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="如：四级模拟考" /></div>
          <div className="space-y-1.5"><Label htmlFor="exam-date">日期</Label><Input id="exam-date" type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
          <div className="space-y-1.5"><Label htmlFor="exam-subject">科目（可选）</Label><Input id="exam-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="如：英语" /></div>
          <div className="space-y-1.5"><Label htmlFor="exam-time">考试时间（可选，填写后考前 1 小时提醒）</Label><Input id="exam-time" type="time" value={examTime} onChange={e => setExamTime(e.target.value)} /></div>
          <Button className="w-full" onClick={submit} disabled={!title.trim() || !date}>{editing ? '保存' : '添加'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
