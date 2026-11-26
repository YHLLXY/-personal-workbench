import { useEffect, useState } from 'react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Check, ChevronDown, Plus, RotateCcw, Trash2, X } from 'lucide-react'
import { addDays, nextMonday, repeatLabel } from '@/lib/repeat'
import { genId, todayStr, type ChecklistItem, type Task } from '@/lib/db/types'
import { dueDateChip } from './task-card'
import { cn } from '@/lib/utils'

/**
 * 任务操作面板（v1.35，委托书 5.3）。
 *
 * 卡片上只剩 3 个可点区之后，改期/延期/搁置/清单/编辑/删除全部落在这一块底部面板上。
 * 为什么是底部面板而不是下拉菜单：下拉菜单在手机上有两个已知问题——触控目标 28px（低于 44px 标准），
 * 且自选日期的原生 date 输入被挤在菜单里只有 28px 高。底部面板天然贴住安全区，主操作区高度 44px。
 */
export function TaskActionsSheet({ task, done, open, onOpenChange, onComplete, onReopen, onReschedule, onDefer, onShelve, onEdit, onDelete, onChecklist, onToggleDoing }: {
  task: Task | null
  /** 这一天是否已完成（repeat 任务完成当天 status 仍是 todo，不能只看 status） */
  done: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete: () => void
  onReopen: () => void
  onReschedule: (date: string) => void
  /** 延期：不排期，进「以后 · 待安排」 */
  onDefer: () => void
  /** 搁置：进「以后 · 将来」 */
  onShelve: () => void
  onEdit: () => void
  onDelete: () => void
  onChecklist?: (items: ChecklistItem[]) => void
  /** 「进行中」开关（v1.31 胶囊的出口，卡片瘦身后挪到这里） */
  onToggleDoing?: () => void
}) {
  const today = todayStr()
  const [customDate, setCustomDate] = useState('')
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [newItem, setNewItem] = useState('')
  useEffect(() => { if (open) { setCustomDate(''); setChecklistOpen(false); setNewItem('') } }, [open])

  const checklist = task?.checklist ?? []
  const chip = task ? dueDateChip(task.dueDate, today) : null
  const meta = [
    chip?.label,
    task?.dueTime,
    task?.repeat ? repeatLabel(task.repeat, task.dueDate) : null,
    task?.tags.length ? task.tags.join(' / ') : null,
    task?.status === 'doing' ? '进行中' : null,
    done ? '已完成' : null,
  ].filter(Boolean).join(' · ')

  function addChecklistItem() {
    const text = newItem.trim()
    if (!text || !onChecklist || !task) return
    onChecklist([...checklist, { id: genId(), text, done: false }])
    setNewItem('')
  }

  /** 每个动作做完就收起面板：用户在上面已经看到结果了，留着面板只会挡住下面那条 */
  function run(action: () => void) {
    action()
    onOpenChange(false)
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="max-h-[85dvh] gap-0 pb-[env(safe-area-inset-bottom)]">
        <SheetHeader className="pb-2">
          <SheetTitle className="break-words leading-snug">{task?.title ?? ''}</SheetTitle>
          {meta && <p className="text-xs text-muted-foreground">{meta}</p>}
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 space-y-4">
          {/* 主操作 */}
          <div className="flex gap-2">
            {done ? (
              <Button variant="outline" className="h-11 flex-1" onClick={() => run(onReopen)}>
                <RotateCcw className="size-4 mr-1" />撤销完成
              </Button>
            ) : (
              <Button className="h-11 flex-1" onClick={() => run(onComplete)}>
                <Check className="size-4 mr-1" />完成
              </Button>
            )}
            <Button variant="outline" className="h-11 flex-1" onClick={() => run(onEdit)}>编辑</Button>
          </div>

          {/* 改期：今天/明天/后天/下周一 四个固定档 + 自选（原生 date，44px 高） */}
          {!done && (
            <section>
              <h3 className="text-xs font-medium text-muted-foreground mb-1.5">改期</h3>
              <div className="grid grid-cols-4 gap-1.5">
                {[
                  { label: '今天', date: today },
                  { label: '明天', date: addDays(today, 1) },
                  { label: '后天', date: addDays(today, 2) },
                  { label: '下周一', date: nextMonday(today) },
                ].map(o => (
                  <button key={o.label} type="button" onClick={() => run(() => onReschedule(o.date))}
                    aria-pressed={task?.dueDate === o.date}
                    className={cn('h-11 rounded-lg border text-xs transition-colors',
                      task?.dueDate === o.date ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground')}>
                    {o.label}
                  </button>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-1.5">
                <input type="date" value={customDate} min={today} onChange={e => setCustomDate(e.target.value)} aria-label="自选日期"
                  className="h-11 flex-1 min-w-0 rounded-lg border border-border bg-transparent px-2 text-xs" />
                <Button className="h-11 shrink-0" disabled={!customDate || customDate < today}
                  onClick={() => run(() => onReschedule(customDate))}>改到这天</Button>
              </div>
              {customDate && customDate < today && <p className="mt-1 text-[10px] text-destructive">已过期，改到今天？</p>}
            </section>
          )}

          {!done && onToggleDoing && (
            <button type="button" onClick={() => run(onToggleDoing)}
              className="flex w-full items-center justify-center h-11 rounded-lg border border-border text-xs text-muted-foreground hover:text-foreground transition-colors">
              {task?.status === 'doing' ? '取消「进行中」' : '标记为「进行中」（每天都看到）'}
            </button>
          )}

          {/* 延期 / 搁置：两条"先不排期"的出路，语义不同（委托书决策 2） */}
          {!done && (
            <section className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" className="h-11 text-xs" onClick={() => run(onDefer)}>延期（待安排）</Button>
              <Button variant="outline" className="h-11 text-xs" onClick={() => run(onShelve)}>搁置（将来）</Button>
            </section>
          )}

          {/* 拆分 = 清单条目（决策 5：不新建任务行，避免两套任务） */}
          {onChecklist && (
            <section>
              <button type="button" onClick={() => setChecklistOpen(o => !o)} aria-expanded={checklistOpen}
                className="flex w-full items-center justify-between h-11 px-1 text-xs text-muted-foreground hover:text-foreground">
                <span>拆分 / 清单 {checklist.length > 0 && '(' + checklist.filter(c => c.done).length + '/' + checklist.length + ')'}</span>
                <ChevronDown className={cn('size-4 transition-transform', checklistOpen && 'rotate-180')} />
              </button>
              {checklistOpen && (
                <div className="space-y-1.5 pb-1">
                  {checklist.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <button onClick={() => onChecklist(checklist.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
                        aria-label={item.done ? '取消勾选' : '勾选'}
                        className={cn('size-5 rounded border-[1.5px] shrink-0 flex items-center justify-center transition-all active:scale-90',
                          item.done ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 hover:border-primary')}>
                        {item.done && <Check className="size-3" strokeWidth={3} />}
                      </button>
                      <span className={cn('flex-1 min-w-0 text-xs break-words', item.done && 'line-through text-muted-foreground')}>{item.text}</span>
                      <button onClick={() => onChecklist(checklist.filter(c => c.id !== item.id))} aria-label="删除条目"
                        className="shrink-0 p-1.5 text-muted-foreground/50 hover:text-destructive transition-colors">
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2">
                    <Plus className="size-3.5 text-muted-foreground shrink-0" />
                    <input value={newItem} onChange={e => setNewItem(e.target.value)} placeholder="加一条子步骤…"
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem() } }}
                      className="h-10 flex-1 min-w-0 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50" />
                    <Button variant="outline" className="h-10 shrink-0 text-xs" disabled={!newItem.trim()} onClick={addChecklistItem}>添加</Button>
                  </div>
                </div>
              )}
            </section>
          )}

          {/* 删除：红色文字 + 二次确认 + 6 秒撤销（面板这一下只是"提出请求"） */}
          <button type="button" onClick={() => run(onDelete)}
            className="flex w-full items-center justify-center gap-1 h-11 rounded-lg border border-destructive/30 text-xs text-destructive hover:bg-destructive/10 transition-colors">
            <Trash2 className="size-3.5" />删除这条任务
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
