import { useState } from 'react'
import { CalendarClock, Check, ChevronDown, Clock, Plus, Repeat, RotateCcw, Star, Trash2, X } from 'lucide-react'
import { genId, type ChecklistItem, type Task } from '@/lib/db/types'
import { repeatLabel } from '@/lib/repeat'
import { cn } from '@/lib/utils'

const PRIORITY_DOT: Record<Task['priority'], string> = { high: 'bg-destructive', medium: 'bg-accent', low: 'bg-muted-foreground/40' }

export function TaskItem({ task, done: doneOverride, onToggle, onFocus, onEdit, onDelete, onPostpone, onChecklist }: {
  task: Task; done?: boolean; onToggle: () => void; onFocus?: () => void; onEdit: () => void; onDelete: () => void; onPostpone?: () => void
  onChecklist?: (items: ChecklistItem[]) => void
}) {
  // done 覆盖：repeat 任务完成当天 status 仍是 todo（同一行滚动），由调用方传 isDoneForToday 收容进已完成区
  const done = doneOverride ?? task.status === 'done'
  const checklist = task.checklist ?? []
  const checklistDone = checklist.filter(c => c.done).length
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [newItem, setNewItem] = useState('')
  const checklistEditable = Boolean(onChecklist) && !done
  function addChecklistItem() {
    const text = newItem.trim()
    if (!text || !onChecklist) return
    onChecklist([...checklist, { id: genId(), text, done: false }])
    setNewItem('')
  }
  return (
    // data-flip-id：FLIP 布局动画锚点（src/lib/flip.ts）——同列表重排平滑（补加星标滑顶，不再瞬跳闪没），
    // 今日↔已完成跨区块连续滑移（坠落/飞回）。一条任务同一时刻只挂载在一个区块，task.id 全局唯一
    <div data-flip-id={task.id}
      className={cn('group bg-card border border-border rounded-xl px-3.5 py-2.5 transition-colors', done && 'opacity-60 bg-muted/40')}>
      <div className="flex items-center gap-3">
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
            {task.status === 'doing' && !done && <span className="text-[10px] bg-accent/20 text-accent-foreground rounded-full px-2 py-0.5 shrink-0">进行中</span>}
            {checklist.length > 0 && (
              <span className={cn('text-[10px] rounded-full px-1.5 py-px shrink-0', checklistDone === checklist.length ? 'bg-primary/12 text-primary' : 'bg-muted text-muted-foreground')}>
                {checklistDone}/{checklist.length}
              </span>
            )}
          </div>
          {(task.dueTime || task.repeat || task.tags.length > 0 || (done && task.completedAt)) && (
            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 pl-4 text-[10px] text-muted-foreground">
              {task.dueTime && <span className="flex items-center gap-0.5"><Clock className="size-3" />{task.dueTime}</span>}
              {task.repeat && <span className="flex items-center gap-0.5"><Repeat className="size-3" />{repeatLabel(task.repeat, task.dueDate)}</span>}
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
        {checklistEditable && (
          <button onClick={() => setChecklistOpen(o => !o)} aria-label="展开清单" aria-expanded={checklistOpen}
            className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors">
            <ChevronDown className={cn('size-4 transition-transform', checklistOpen && 'rotate-180')} />
          </button>
        )}
        <button onClick={onDelete} aria-label="删除" className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100">
          <Trash2 className="size-4" strokeWidth={1.7} />
        </button>
      </div>
      {/* 清单行内展开（Things 式 checklist；编辑入口唯一走这里，TaskDialog 不做清单编辑）。
          全勾完不自动完成父任务（TickTick 同款语义） */}
      {checklistEditable && checklistOpen && (
        <div className="mt-2 pl-8 space-y-1">
          {checklist.map(item => (
            <div key={item.id} className="flex items-center gap-2">
              <button onClick={() => onChecklist?.(checklist.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
                aria-label={item.done ? '取消勾选' : '勾选'}
                className={cn('size-[14px] rounded border-[1.5px] shrink-0 flex items-center justify-center transition-all active:scale-90',
                  item.done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
                {item.done && <Check className="size-2.5" strokeWidth={3} />}
              </button>
              <span className={cn('flex-1 min-w-0 text-xs truncate', item.done && 'line-through text-muted-foreground')}>{item.text}</span>
              <button onClick={() => onChecklist?.(checklist.filter(c => c.id !== item.id))} aria-label="删除条目"
                className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors">
                <X className="size-3" />
              </button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Plus className="size-3 text-muted-foreground shrink-0" />
            <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="添加条目…"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}
              className="flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50" />
          </div>
        </div>
      )}
    </div>
  )
}
