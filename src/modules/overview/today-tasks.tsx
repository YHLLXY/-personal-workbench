import { useLayoutEffect, useRef, useState } from 'react'
import { useTasks, useTaskMutations, todayTasks, todayDone, recentOverdue, oldOverdue, filterTasks } from './api'
import { TaskItem } from './task-item'
import { TaskDialog } from './task-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CalendarClock, ChevronDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { todayStr } from '@/lib/db/types'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { flipIn } from '@/lib/flip'
import type { Task } from '@/lib/db/types'

export default function TodayTasks() {
  const { data: tasks, isLoading, isError } = useTasks()
  const { update, remove } = useTaskMutations()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<Task | null>(null)
  const [tag, setTag] = useState<string | null>(null) // 当前标签筛选，null=全部
  const [query, setQuery] = useState('') // 标题关键词
  const [doneOpen, setDoneOpen] = useState(true) // 已完成分区默认展开：刚勾完就能看到划线，误触可立刻撤销
  const today = todayStr()
  const rootRef = useRef<HTMLDivElement>(null)

  // FLIP 布局动画：每次提交后、绘制前对比各任务上一帧位置，位移即从旧位置滑到新位置
  // （补加星标平滑滑顶；完成/撤销时在今日↔已完成两区间连续滑移而非瞬移闪没，2026-08 反馈）
  useLayoutEffect(() => { flipIn(rootRef.current) })

  // 完成/撤销的统一入口。乐观更新在 useTaskMutations 落缓存；完成时展开已完成分区（否则任务坠进折叠区等于隐形）
  // 并弹 toast 撤销（Todoist 式主撤销路径，2026-08 反馈"找不到撤销"）
  const toggleDone = (t: Task) => {
    const done = t.status === 'done'
    update.mutate({ id: t.id, patch: { status: done ? 'todo' : 'done' } })
    if (done) return
    setDoneOpen(true)
    toast.success('已完成', {
      description: `「${t.title}」已划线保留`,
      action: { label: '撤销', onClick: () => update.mutate({ id: t.id, patch: { status: 'todo' } }) },
      duration: 5000,
    })
  }

  // 先按标签/关键词过滤，再走既有口径函数；someday 单独分流（todayTasks 口径不排除 someday，手动拆开避免同任务重复出现）
  const filtered = filterTasks(tasks ?? [], { tag, query })
  const pool = filtered.filter(t => t.status !== 'someday')
  const someday = filtered.filter(t => t.status === 'someday')
  const list = todayTasks(pool, today)
  const doneToday = todayDone(pool, today)
  const recent = recentOverdue(pool, today)
  const old = oldOverdue(pool, today)
  const overdue = [...recent, ...old]
  const todayList = list.filter(t => !overdue.some(o => o.id === t.id))
  const allTags = [...new Set((tasks ?? []).flatMap(t => t.tags))] // 全部任务的去重标签
  const filtering = Boolean(tag || query.trim())

  return (
    <div ref={rootRef} className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">今日待办</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            今日 {todayList.length} 项{doneToday.length > 0 && <span className="text-primary"> · 已完成 {doneToday.length} 项</span>}{overdue.length > 0 && <span className="text-destructive"> · 逾期 {overdue.length} 项</span>} · 标记 ⭐ 为今日焦点（最多 3 项）
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true) }}><Plus className="size-4 mr-1" />新建</Button>
      </div>
      {/* 标签筛选 + 标题搜索：作用于今日/逾期/将来三个区块 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-4">
        {['全部', ...allTags].map(tg => (
          <button key={tg} onClick={() => setTag(tg === '全部' ? null : tg)}
            className={cn('text-xs px-3 py-1.5 rounded-full border transition-colors', (tag ?? '全部') === tg ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:text-foreground')}>{tg}</button>
        ))}
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索标题…" className="h-8 w-40 text-xs ml-auto" />
      </div>
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive py-10 text-center">加载失败，请重试</p>
      ) : list.length === 0 && someday.length === 0 && doneToday.length === 0 ? (
        <EmptyState icon="✓" title={filtering ? '没有匹配的任务' : '今天没有待办'} desc={filtering ? '换个标签或关键词试试' : '点击右上角新建，或按 ⌘K 快速添加'} />
      ) : (
        <div className="space-y-4">
          {overdue.length > 0 && (
            <section>
              <h2 className="text-xs text-destructive font-medium mb-1.5">已逾期 {recent.length} 项{old.length > 0 && ` · 更早 ${old.length} 项已折叠`}</h2>
              {recent.length > 0 && (
                <div className="space-y-1.5">
                  {recent.map(t => (
                    <div key={t.id} className="rounded-xl border border-destructive/25 bg-destructive/5">
                      <TaskItem task={t}
                        onToggle={() => toggleDone(t)}
                        onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus } })}
                        onEdit={() => { setEditing(t); setDialogOpen(true) }}
                        onDelete={() => remove.mutate(t.id)}
                        onPostpone={() => update.mutate({ id: t.id, patch: { dueDate: today } })} />
                    </div>
                  ))}
                </div>
              )}
              {old.length > 0 && (
                <details className="group rounded-xl border border-border bg-card">
                  <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <span className="flex items-center gap-1.5">
                      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                      更早过期 {old.length} 项
                    </span>
                    <span className="text-[10px]">点击展开</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-1.5">
                    {old.map(t => (
                      <TaskItem key={t.id} task={t}
                        onToggle={() => toggleDone(t)}
                        onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus } })}
                        onEdit={() => { setEditing(t); setDialogOpen(true) }}
                        onDelete={() => remove.mutate(t.id)}
                        onPostpone={() => update.mutate({ id: t.id, patch: { dueDate: today } })} />
                    ))}
                    <Button
                      variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/30"
                      onClick={() => {
                        if (window.confirm(`将 ${old.length} 项更早过期的历史待办标记为已完成？这些任务将不再出现在待办中。`)) {
                          old.forEach(t => update.mutate({ id: t.id, patch: { status: 'done' } }))
                          toast.success(`已清理 ${old.length} 项历史待办`, {
                            action: { label: '撤销', onClick: () => old.forEach(t => update.mutate({ id: t.id, patch: { status: 'todo' } })) },
                            duration: 5000,
                          })
                        }
                      }}>
                      清理历史待办（全部标记完成）
                    </Button>
                  </div>
                </details>
              )}
            </section>
          )}
          {todayList.length > 0 && (
            <section>
              {overdue.length > 0 && <h2 className="text-xs font-medium text-muted-foreground mb-1.5">今日</h2>}
              <div className="space-y-1.5">
                {todayList.map(t => (
                  <TaskItem key={t.id} task={t}
                    onToggle={() => toggleDone(t)}
                    onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus, focusDate: t.focus ? null : today } })}
                    onEdit={() => { setEditing(t); setDialogOpen(true) }}
                    onDelete={() => remove.mutate(t.id)} />
                ))}
              </div>
            </section>
          )}
          {doneToday.length > 0 && (
            <section>
              <details className="group rounded-xl border border-border bg-card" open={doneOpen} onToggle={e => setDoneOpen(e.currentTarget.open)}>
                <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
                  <span className="flex items-center gap-1.5">
                    <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                    已完成 {doneToday.length} 项 · 点方块可撤销
                  </span>
                  <span className="text-[10px]">{doneOpen ? '点击折叠' : '点击展开'}</span>
                </summary>
                <div className="px-3 pb-3 space-y-1.5">
                  {doneToday.map(t => (
                    <TaskItem key={t.id} task={t}
                      onToggle={() => toggleDone(t)}
                      onEdit={() => { setEditing(t); setDialogOpen(true) }}
                      onDelete={() => remove.mutate(t.id)} />
                  ))}
                </div>
              </details>
            </section>
          )}
        </div>
      )}
      {/* someday 收件箱：全站唯一能看到 status==='someday' 任务的入口，空时不渲染 */}
      {someday.length > 0 && (
        <details className="group mt-4 rounded-xl border border-border bg-card">
          <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
            <span className="flex items-center gap-1.5">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
              将来 · {someday.length} 项
            </span>
            <span className="text-[10px]">点击展开</span>
          </summary>
          <div className="px-3 pb-3 space-y-1.5">
            {someday.map(t => (
              <div key={t.id} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3.5 py-2">
                <span className="flex-1 min-w-0 text-sm truncate">{t.title}</span>
                {t.tags.length > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{t.tags.join(' / ')}</span>}
                <button onClick={() => update.mutate({ id: t.id, patch: { status: 'todo', dueDate: today } }, { onSuccess: () => toast.success('已移到今天') })}
                  title="移到今天" className="shrink-0 flex items-center gap-0.5 text-[10px] text-primary border border-primary/30 rounded-full px-2 py-0.5 hover:bg-primary/10 transition-colors">
                  <CalendarClock className="size-3" />移到今天
                </button>
                <button onClick={() => { setEditing(t); setDialogOpen(true) }} aria-label="编辑" className="shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"><Pencil className="size-4" strokeWidth={1.7} /></button>
                <button onClick={() => remove.mutate(t.id)} aria-label="删除" className="shrink-0 text-muted-foreground/50 hover:text-destructive transition-colors"><Trash2 className="size-4" strokeWidth={1.7} /></button>
              </div>
            ))}
          </div>
        </details>
      )}
      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  )
}
