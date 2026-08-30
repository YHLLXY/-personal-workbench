import { CalendarClock, Check, Clock, RotateCcw, Star, Trash2 } from 'lucide-react'
import type { Task } from '@/lib/db/types'
import { cn } from '@/lib/utils'

const PRIORITY_DOT: Record<Task['priority'], string> = { high: 'bg-destructive', medium: 'bg-accent', low: 'bg-muted-foreground/40' }

export function TaskItem({ task, onToggle, onFocus, onEdit, onDelete, onPostpone }: {
  task: Task; onToggle: () => void; onFocus?: () => void; onEdit: () => void; onDelete: () => void; onPostpone?: () => void
}) {
  const done = task.status === 'done'
  return (
    // data-flip-id：FLIP 布局动画锚点（src/lib/flip.ts）——同列表重排平滑（补加星标滑顶，不再瞬跳闪没），
    // 今日↔已完成跨区块连续滑移（坠落/飞回）。一条任务同一时刻只挂载在一个区块，task.id 全局唯一
    <div data-flip-id={task.id}
      className={cn('group flex items-center gap-3 bg-card border border-border rounded-xl px-3.5 py-2.5 transition-colors', done && 'opacity-60 bg-muted/40')}>
      <button onClick={onToggle} aria-label={done ? '撤销完成' : '完成'} title={done ? '撤销完成' : '标记完成'}
        className={cn('group/check size-[18px] rounded-md border-[1.5px] shrink-0 flex items-center justify-center transition-all active:scale-90',
          done ? 'bg-primary border-primary text-primary-foreground hover:brightness-110' : 'border-muted-foreground/40 hover:border-primary')}>
        {done && (
          // 完成态：常态对勾，悬停变 ↺ 恢复图标（Todoist/Things 式撤销暗示，修"找不到撤销"）
          <>
            <Check className="size-3 group-hover/check:hidden" strokeWidth={3} />
            <RotateCcw className="hidden size-3 group-hover/check:block" strokeWidth={2.5} />
          </>
        )}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className={cn('size-2 rounded-full shrink-0', PRIORITY_DOT[task.priority])} title={`优先级 ${task.priority}`} />
          <button onClick={onEdit} className="flex-1 min-w-0 text-left">
            <span className={cn('block text-sm truncate transition-all duration-300', done && 'line-through text-muted-foreground')}>{task.title}</span>
          </button>
          {task.focus && !done && <span className="text-[10px] bg-primary/12 text-primary rounded-full px-2 py-0.5 shrink-0">今日焦点</span>}
        </div>
        {(task.dueTime || task.tags.length > 0 || (done && task.completedAt)) && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 pl-4 text-[10px] text-muted-foreground">
            {task.dueTime && <span className="flex items-center gap-0.5"><Clock className="size-3" />{task.dueTime}</span>}
            {task.tags.map(tag => <span key={tag} className="rounded-full bg-muted px-1.5 py-px">{tag}</span>)}
            {done && task.completedAt && <span>完成于 {new Date(task.completedAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>}
          </div>
        )}
      </div>
      {onPostpone && (
        <button onClick={onPostpone} aria-label="顺延到今天" title="顺延到今天"
          className="shrink-0 flex items-center gap-0.5 text-[10px] text-destructive/80 hover:text-destructive border border-destructive/30 rounded-full px-2 py-0.5 transition-colors">
          <CalendarClock className="size-3" />顺延
        </button>
      )}
      {onFocus && (
        <button onClick={onFocus} aria-label="设为今日焦点" className={cn('shrink-0 text-muted-foreground/50 hover:text-primary transition-colors', task.focus && 'text-primary')}>
          <Star className="size-4" strokeWidth={1.7} fill={task.focus ? 'currentColor' : 'none'} />
        </button>
      )}
      <button onClick={onDelete} aria-label="删除" className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
        <Trash2 className="size-4" strokeWidth={1.7} />
      </button>
    </div>
  )
}
