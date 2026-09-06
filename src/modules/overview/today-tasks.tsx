import { useLayoutEffect, useRef, useState } from 'react'
import { useTasks, useTaskMutations, todayTasks, todayDone, recentOverdue, oldOverdue, filterTasks, isDoneForToday } from './api'
import { TaskItem } from './task-item'
import { TaskDialog } from './task-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CalendarClock, ChevronDown, MoreHorizontal, Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { todayStr } from '@/lib/db/types'
import { nextOccurrence, prevOccurrence } from '@/lib/repeat'
import { midpointSort, useDragSort } from '@/lib/drag-sort'
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
  const [somedayMenuId, setSomedayMenuId] = useState<string | null>(null) // 将来区 ⋯ 菜单（受控，同一时刻至多一个展开）
  const [somedayDate, setSomedayDate] = useState('')
  const today = todayStr()
  const rootRef = useRef<HTMLDivElement>(null)

  // FLIP 布局动画：每次提交后、绘制前对比各任务上一帧位置，位移即从旧位置滑到新位置
  // （补加星标平滑滑顶；完成/撤销时在今日↔已完成两区间连续滑移而非瞬移闪没，2026-08 反馈）
  useLayoutEffect(() => { flipIn(rootRef.current) })

  // 完成/撤销的统一入口。乐观更新在 useTaskMutations 落缓存；完成时展开已完成分区（否则任务坠进折叠区等于隐形）
  // 并弹 toast 撤销（Todoist 式主撤销路径，2026-08 反馈"找不到撤销"）。
  // v1.24 repeat 任务：完成不走 status='done'——同一行滚到下一期（completedAt 记今天 + dueDate 推进），
  // isDoneForToday 把它收容进已完成区；撤销用闭包原 dueDate（精确）；已完成区点方块撤销用 prevOccurrence（晚完成为近似值）
  const toggleDone = (t: Task) => {
    const done = isDoneForToday(t, today)
    if (done) {
      if (t.repeat) update.mutate({ id: t.id, patch: { completedAt: null, dueDate: prevOccurrence(t.dueDate ?? today, t.repeat) } })
      else update.mutate({ id: t.id, patch: { status: 'todo' } })
      return
    }
    setDoneOpen(true)
    if (t.repeat) {
      const originalDue = t.dueDate
      const completedAt = new Date().toISOString()
      const next = nextOccurrence(t.dueDate ?? today, t.repeat, completedAt, today)
      update.mutate({ id: t.id, patch: { completedAt, dueDate: next } })
      toast.success('已完成', {
        description: `「${t.title}」下次：${next}`,
        action: { label: '撤销', onClick: () => update.mutate({ id: t.id, patch: { completedAt: null, dueDate: originalDue } }) },
        duration: 5000,
      })
      return
    }
    update.mutate({ id: t.id, patch: { status: 'done' } })
    toast.success('已完成', {
      description: `「${t.title}」已划线保留`,
      action: { label: '撤销', onClick: () => update.mutate({ id: t.id, patch: { status: 'todo' } }) },
      duration: 5000,
    })
  }

  // v1.24 F：改期（直接写 dueDate）与 repeat「跳过一次」（只推 dueDate 不记完成，「跳过不补」会推进到首个 ≥ today 的槽位）
  const reschedule = (t: Task, date: string) => update.mutate({ id: t.id, patch: { dueDate: date } })
  const skipOnce = (t: Task) => {
    if (!t.repeat) return
    update.mutate({ id: t.id, patch: { dueDate: nextOccurrence(t.dueDate ?? today, t.repeat, null, today) } })
  }
  // 逾期区一键顺延（既有「清理历史待办」同款：confirm + toast 撤销）
  const postponeAllRecent = () => {
    if (recent.length === 0) return
    if (!window.confirm(`将 ${recent.length} 项逾期任务顺延到今天？`)) return
    recent.forEach(t => update.mutate({ id: t.id, patch: { dueDate: today } }))
    const originals = new Map(recent.map(t => [t.id, t.dueDate] as const))
    toast.success(`已顺延 ${recent.length} 项`, {
      action: { label: '撤销', onClick: () => originals.forEach((d, id) => { if (d) update.mutate({ id, patch: { dueDate: d } }) }) },
      duration: 5000,
    })
  }
  // v1.24 G：将来任务转正式待办并指定到期日
  const moveSomedayTo = (t: Task, date: string) => {
    update.mutate({ id: t.id, patch: { status: 'todo', dueDate: date } }, { onSuccess: () => { toast.success(`已排到 ${date}`); setSomedayMenuId(null) } })
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
  // v1.24 E：今日区手动拖拽排序——半序只写被拖项一项（上/下邻 sort 中点），焦点/doing 分组由比较器保持
  const todayById = new Map(todayList.map(t => [t.id, t]))
  const drag = useDragSort(todayList.map(t => t.id), (newOrder, movedId) => {
    const i = newOrder.indexOf(movedId)
    const prevSort = i > 0 ? todayById.get(newOrder[i - 1])?.sort : undefined
    const nextSort = i < newOrder.length - 1 ? todayById.get(newOrder[i + 1])?.sort : undefined
    update.mutate({ id: movedId, patch: { sort: midpointSort(prevSort, nextSort) } })
  })

  return (
    <div ref={rootRef} className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">今日待办</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            今日 {todayList.length} 项{doneToday.length > 0 && <span className="text-primary"> · 已完成 {doneToday.length} 项</span>}{overdue.length > 0 && <span className="text-destructive"> · 逾期 {overdue.length} 项</span>}<span className="hidden sm:inline"> · 标记 ⭐ 为今日焦点（最多 3 项）</span>
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
              <h2 className="text-xs text-destructive font-medium mb-1.5 flex items-center">
                <span>已逾期 {recent.length} 项{old.length > 0 && ` · 更早 ${old.length} 项已折叠`}</span>
                {recent.length > 0 && (
                  <button onClick={postponeAllRecent}
                    className="ml-auto text-[10px] text-destructive/80 hover:text-destructive border border-destructive/30 rounded-full px-2 py-0.5 transition-colors">
                    全部顺延到今天
                  </button>
                )}
              </h2>
              {recent.length > 0 && (
                <div className="space-y-1.5">
                  {recent.map(t => (
                    <div key={t.id} className="rounded-xl border border-destructive/25 bg-destructive/5">
                      <TaskItem task={t}
                        onToggle={() => toggleDone(t)}
                        onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus } })}
                        onEdit={() => { setEditing(t); setDialogOpen(true) }}
                        onDelete={() => remove.mutate(t.id)}
                        onPostpone={() => update.mutate({ id: t.id, patch: { dueDate: today } })}
                        onChecklist={items => update.mutate({ id: t.id, patch: { checklist: items } })}
                        onReschedule={date => reschedule(t, date)}
                        onSkip={t.repeat ? () => skipOnce(t) : undefined} />
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
                        onPostpone={() => update.mutate({ id: t.id, patch: { dueDate: today } })}
                        onChecklist={items => update.mutate({ id: t.id, patch: { checklist: items } })}
                        onReschedule={date => reschedule(t, date)}
                        onSkip={t.repeat ? () => skipOnce(t) : undefined} />
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
              {/* 拖拽容器：拖拽期间 overscroll-contain 防触摸滚动链（触摸三坑之二，见 lib/drag-sort.ts） */}
              <div ref={drag.containerRef} className={cn('space-y-1.5', drag.draggingId && 'overscroll-contain')}>
                {drag.order.map(id => {
                  const t = todayById.get(id)
                  if (!t) return null
                  return (
                    <TaskItem key={id} task={t}
                      drag={{ id, handle: drag.handleProps(id) }}
                      onToggle={() => toggleDone(t)}
                      onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus, focusDate: t.focus ? null : today } })}
                      onEdit={() => { setEditing(t); setDialogOpen(true) }}
                      onDelete={() => remove.mutate(t.id)}
                      onChecklist={items => update.mutate({ id: t.id, patch: { checklist: items } })}
                      onReschedule={date => reschedule(t, date)}
                      onSkip={t.repeat ? () => skipOnce(t) : undefined} />
                  )
                })}
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
                    <TaskItem key={t.id} task={t} done
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
                {/* v1.24 G：⋯ 菜单——选日期（转正式待办 + 自选到期日）/ 编辑 / 删除（原 inline 编辑/删除收编） */}
                <DropdownMenu open={somedayMenuId === t.id} onOpenChange={o => { setSomedayMenuId(o ? t.id : null); if (o) setSomedayDate('') }}>
                  <DropdownMenuTrigger aria-label="更多操作" className="shrink-0 p-0.5 text-muted-foreground/50 hover:text-foreground transition-colors">
                    <MoreHorizontal className="size-4" />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <div className="flex items-center gap-1.5 px-1.5 py-1">
                      <input type="date" value={somedayDate} onChange={e => setSomedayDate(e.target.value)} aria-label="选择日期"
                        className="h-7 flex-1 min-w-0 rounded-md border border-border bg-transparent px-1.5 text-xs" />
                      <button type="button" onClick={() => moveSomedayTo(t, somedayDate)} disabled={!somedayDate}
                        className="shrink-0 text-xs rounded-md border border-border px-2 py-1 hover:bg-muted disabled:opacity-40 transition-opacity">确定</button>
                    </div>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={() => { setSomedayMenuId(null); setEditing(t); setDialogOpen(true) }}>编辑</DropdownMenuItem>
                    <DropdownMenuItem variant="destructive" onClick={() => { setSomedayMenuId(null); remove.mutate(t.id) }}>删除</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ))}
          </div>
        </details>
      )}
      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  )
}
