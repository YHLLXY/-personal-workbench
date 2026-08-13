import { useMemo, useState } from 'react'
import { CalendarClock, Pencil, Plus, StickyNote, Trash2 } from 'lucide-react'
import { useExams, useExamMutations, daysUntil } from './api'
import { ExamDialog } from './exam-dialog'
import GoalManager from './goal-manager'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import type { Exam } from '@/lib/db/types'

export default function StudyManager() {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold">学习管理</h1>
        <p className="text-xs text-muted-foreground mt-0.5">考试倒计时 · 学习目标 · 专注统计</p>
      </div>
      <Tabs defaultValue="exams">
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="exams">考试</TabsTrigger>
          <TabsTrigger value="goals">学习目标</TabsTrigger>
        </TabsList>
        <TabsContent value="exams" className="pt-4"><ExamsPanel /></TabsContent>
        <TabsContent value="goals" className="pt-4"><GoalManager /></TabsContent>
      </Tabs>
    </div>
  )
}

function ExamsPanel() {
  const { data: exams, isLoading } = useExams()
  const { remove } = useExamMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Exam | null>(null)
  const [subject, setSubject] = useState<string | null>(null)

  const subjects = useMemo(() => [...new Set((exams ?? []).map(e => e.subject).filter((s): s is string => !!s))].sort(), [exams])
  const filtered = (exams ?? []).filter(e => !subject || e.subject === subject)
  const sorted = [...filtered].sort((a, b) => a.examDate.localeCompare(b.examDate))

  return (
    <>
      <div className="flex items-center justify-between mb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setSubject(null)}
            className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', subject === null ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40')}>
            全部
          </button>
          {subjects.map(s => (
            <button key={s} onClick={() => setSubject(subject === s ? null : s)}
              className={cn('rounded-full border px-2.5 py-1 text-xs transition-colors', subject === s ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:border-primary/40')}>
              {s}
            </button>
          ))}
        </div>
        <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />添加考试</Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {isLoading ? <Skeleton className="h-28 col-span-2" /> : sorted.length === 0 ? (
          <p className="text-sm text-muted-foreground col-span-2 py-6 text-center">
            {subject ? `「${subject}」暂无考试` : '还没有考试，添加第一个倒计时吧'}
          </p>
        ) : sorted.map(e => <ExamCard key={e.id} exam={e} onEdit={() => { setEditing(e); setDialogOpen(true) }} onDelete={() => remove.mutate(e.id)} />)}
      </div>
      <ExamDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </>
  )
}

function ExamCard({ exam: e, onEdit, onDelete }: { exam: Exam; onEdit: () => void; onDelete: () => void }) {
  const [noteOpen, setNoteOpen] = useState(false)
  const d = daysUntil(e.examDate)
  const urgent = d >= 0 && d <= 7
  const hasNote = !!e.note
  return (
    <div className="bg-card border border-border rounded-2xl p-4 flex items-start gap-3">
      <div className={cn('rounded-xl px-3 py-2 text-center min-w-[64px]', urgent ? 'bg-destructive/10' : 'bg-primary/10')}>
        <div className={cn('text-2xl font-extrabold font-numeric', urgent ? 'text-destructive' : 'text-primary')}>{d < 0 ? '已过' : d}</div>
        {d >= 0 && <div className="text-[10px] text-muted-foreground">天后</div>}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm truncate">{e.title}</div>
        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1"><CalendarClock className="size-3" />{e.examDate}{e.subject ? ` · ${e.subject}` : ''}</div>
        {hasNote && (
          <div className="mt-1.5">
            <p className={cn('text-xs text-muted-foreground/80 bg-muted/60 rounded-lg px-2 py-1.5', !noteOpen && 'line-clamp-2')}>{e.note}</p>
            {e.note && e.note.length > 40 && (
              <button onClick={() => setNoteOpen(o => !o)} className="mt-0.5 text-[10px] text-primary flex items-center gap-0.5">
                <StickyNote className="size-3" />{noteOpen ? '收起' : '展开'}
              </button>
            )}
          </div>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} aria-label="编辑" className="p-1.5 text-muted-foreground/60 hover:text-primary rounded-lg"><Pencil className="size-3.5" /></button>
        <button onClick={onDelete} aria-label="删除" className="p-1.5 text-muted-foreground/60 hover:text-destructive rounded-lg"><Trash2 className="size-3.5" /></button>
      </div>
    </div>
  )
}
