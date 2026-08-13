import { CheckCircle2, Star } from 'lucide-react'
import { useTasks, todayTasks } from './api'
import { todayStr } from '@/lib/db/types'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function TodayTasksCard() {
  const { data: tasks, isLoading } = useTasks()
  const list = todayTasks(tasks ?? [], todayStr()).slice(0, 5)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><CheckCircle2 className="size-4 text-primary" strokeWidth={1.7} />今日待办</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? <Skeleton className="h-16 w-full" /> : list.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">今天没有待办 🎉</p>
        ) : list.map(t => (
          <div key={t.id} className={cn('flex items-center gap-2 text-sm py-1.5 border-b border-border/60 last:border-0', t.status === 'done' && 'opacity-50')}>
            <span className={cn('size-3.5 rounded border-[1.5px] shrink-0', t.status === 'done' ? 'bg-primary border-primary' : 'border-muted-foreground/40')} />
            <span className={cn('truncate flex-1', t.status === 'done' && 'line-through text-muted-foreground')}>{t.title}</span>
            {t.focus && <Star className="size-3 text-primary shrink-0" strokeWidth={1.7} fill="currentColor" />}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

export function TodayFocusCard() {
  const { data: tasks, isLoading } = useTasks()
  const today = todayStr()
  const focus = (tasks ?? []).filter(t => t.focus && t.focusDate === today && t.status !== 'done').slice(0, 3)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Star className="size-4 text-primary" strokeWidth={1.7} />今日焦点</CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {isLoading ? <Skeleton className="h-16 w-full" /> : focus.length === 0 ? (
          <p className="text-xs text-muted-foreground py-3">在今日待办中标记 ⭐ 今日焦点（最多 3 项）</p>
        ) : focus.map(t => (
          <div key={t.id} className="flex items-center gap-2 text-sm py-1.5"><span className="text-primary">·</span>{t.title}</div>
        ))}
      </CardContent>
    </Card>
  )
}
