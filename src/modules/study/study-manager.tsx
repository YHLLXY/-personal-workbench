import { useState } from 'react'
import { Plus, Pencil, Trash2, CalendarClock } from 'lucide-react'
import { useExams, useExamMutations, daysUntil } from './api'
import { ExamDialog } from './exam-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import type { Exam } from '@/lib/db/types'

export default function StudyManager() {
  const { data: exams, isLoading } = useExams()
  const { remove } = useExamMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const sorted = [...(exams ?? [])].sort((a, b) => a.examDate.localeCompare(b.examDate))

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">学习管理</h1>
          <p className="text-xs text-muted-foreground mt-0.5">考试倒计时 · 专注统计</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />添加考试</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isLoading ? <Skeleton className="h-28 col-span-2" /> : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-2 py-6 text-center">还没有考试，添加第一个倒计时吧</p>
        ) : sorted.map(e => {
          const d = daysUntil(e.examDate)
          const urgent = d >= 0 && d <= 7
          return (
            <div key={e.id} className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
              <div className={cn('rounded-xl px-3 py-2 text-center min-w-[64px]', urgent ? 'bg-destructive/10' : 'bg-primary/10')}>
                <div className={cn('text-2xl font-extrabold font-numeric', urgent ? 'text-destructive' : 'text-primary')}>{d < 0 ? '已过' : d}</div>
                <div className="text-[10px] text-muted-foreground">天后</div>
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-sm truncate">{e.title}</div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><CalendarClock className="size-3" />{e.examDate}{e.subject ? ` · ${e.subject}` : ''}</div>
              </div>
              <div className="flex gap-1 shrink-0">
                <button onClick={() => { setEditing(e); setDialogOpen(true) }} aria-label="编辑" className="p-1.5 text-muted-foreground/60 hover:text-primary rounded-lg"><Pencil className="size-3.5" /></button>
                <button onClick={() => remove.mutate(e.id)} aria-label="删除" className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded-lg"><Trash2 className="size-3.5" /></button>
              </div>
            </div>
          )
        })}
      </div>
      <ExamDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  )
}
