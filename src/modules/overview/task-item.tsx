import { Check, Star, Trash2 } from 'lucide-react'
import type { Task } from '@/lib/db/types'
import { cn } from '@/lib/utils'

const PRIORITY_DOT: Record<Task['priority'], string> = { high: 'bg-destructive', medium: 'bg-accent', low: 'bg-muted-foreground/40' }

export function TaskItem({ task, onToggle, onFocus, onEdit, onDelete }: {
  task: Task; onToggle: () => void; onFocus: () => void; onEdit: () => void; onDelete: () => void
}) {
  const done = task.status === 'done'
  return (
    <div className={cn('group flex items-center gap-3 bg-card border border-border rounded-xl px-3.5 py-2.5', done && 'opacity-60')}>
      <button onClick={onToggle} aria-label="完成"
        className={cn('size-[18px] rounded-md border-[1.5px] shrink-0 flex items-center justify-center transition-colors',
          done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
        {done && <Check className="size-3" strokeWidth={3} />}
      </button>
      <span className={cn('size-2 rounded-full shrink-0', PRIORITY_DOT[task.priority])} title={`优先级 ${task.priority}`} />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <span className={cn('block text-sm truncate', done && 'line-through text-muted-foreground')}>{task.title}</span>
      </button>
      {task.focus && <span className="text-[10px] bg-primary/12 text-primary rounded-full px-2 py-0.5 shrink-0">今日焦点</span>}
      <button onClick={onFocus} aria-label="设为今日焦点" className={cn('shrink-0 text-muted-foreground/50 hover:text-primary transition-colors', task.focus && 'text-primary')}>
        <Star className="size-4" strokeWidth={1.7} fill={task.focus ? 'currentColor' : 'none'} />
      </button>
      <button onClick={onDelete} aria-label="删除" className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors opacity-0 group-hover:opacity-100">
        <Trash2 className="size-4" strokeWidth={1.7} />
      </button>
    </div>
  )
}
