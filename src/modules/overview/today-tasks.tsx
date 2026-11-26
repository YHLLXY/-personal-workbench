import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useTasks, useTaskMutations, todayTasks, todayDone, recentOverdue, oldOverdue, filterTasks } from './api'
import { useTaskActions } from './use-task-actions'
import { usePlanItems, usePlanMaterialize } from './day-plan-api'
import { TaskItem } from './task-item'
import { TaskDialog } from './task-dialog'
import { EveningWrapUp } from './evening-wrap-up'
import { useConfirm } from '@/components/confirm-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CalendarClock, ChevronDown, MoreHorizontal, Plus } from 'lucide-react'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { todayStr } from '@/lib/db/types'
import { isDoneForToday } from '@/lib/task-rules'
import { addDays } from '@/lib/repeat'
import { dayLabel } from '@/lib/day-plan'
import { midpointSort, useDragSort } from '@/lib/drag-sort'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { flipIn } from '@/lib/flip'
import type { Task } from '@/lib/db/types'

/** 三段视图（v1.35，委托书 2.1 / 4.1）：今天 / 明天 / 以后。
 *  为什么要有"明天"这一段：v1.34 的今日待办只渲染今天与逾期，**改期到明天的任务当场消失**，
 *  用户只能靠记忆确认"我刚才改到哪天了"（改期后的核对成本 = ∞，见委托书 5.2）。 */
type DayTab = 'today' | 'tomorrow' | 'later'
const TABS: Array<{ key: DayTab; label: string; hint: string }> = [
  { key: 'today', label: '今天', hint: '今日到期 / 今日焦点 / 进行中 / 逾期 / 已完成' },
  { key: 'tomorrow', label: '明天', hint: '明天到期，以及未来 7 天' },
  { key: 'later', label: '以后', hint: '更远的日期 / 待安排 / 将来' },
]

/** 按到期日分组（升序），给"明天 / 以后"段的日期小结用 */
function groupByDate(list: Task[]): Array<[string, Task[]]> {
  const map = new Map<string, Task[]>()
  for (const t of list) {
    const key = t.dueDate ?? ''
    const arr = map.get(key) ?? []
    arr.push(t)
    map.set(key, arr)
  }
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
}

export default function TodayTasks() {
  const { data: tasks, isLoading, isError } = useTasks()
  const { update } = useTaskMutations()
  // 完成 / 撤销 / 批量完成 / 改期 都走唯一入口（v1.35）：规则在 lib/task-rules，回执与落库在 hook 里
  const { toggle, completeMany, reschedule, skipOnce, removeTask } = useTaskActions()
  const confirm = useConfirm()
  const [params, setParams] = useSearchParams()
  const [dialogOpen, setDialogOpen] = useState(false)
  const [wrapOpen, setWrapOpen] = useState(false) // 收尾 Sheet（结束今天）：晚间批量处理未完成项
  const [editing, setEditing] = useState<Task | null>(null)
  const [tag, setTag] = useState<string | null>(null) // 当前标签筛选，null=全部
  const [query, setQuery] = useState('') // 标题关键词
  const [doneOpen, setDoneOpen] = useState(true) // 已完成分区默认展开：刚勾完就能看到划线，误触可立刻撤销
  const [somedayMenuId, setSomedayMenuId] = useState<string | null>(null) // 将来区 ⋯ 菜单（受控，同一时刻至多一个展开）
  const [somedayDate, setSomedayDate] = useState('')
  const today = todayStr()
  const tomorrow = addDays(today, 1)
  const weekEnd = addDays(today, 7)
  // /tasks?day=tomorrow 深链（复盘「去待办查看」用）：落在对应分段，非法值回落到今天
  const rawDay = params.get('day')
  const tab: DayTab = rawDay === 'tomorrow' || rawDay === 'later' ? rawDay : 'today'
  const setTab = (next: DayTab) => setParams(next === 'today' ? {} : { day: next }, { replace: true })
  // 计划快照（v1.35）：进入今日页把「今天该有计划项但还没有」的任务补成行，复盘才有当天分母
  const { data: planItems } = usePlanItems()
  usePlanMaterialize(tasks, planItems, today)
  const rootRef = useRef<HTMLDivElement>(null)

  // FLIP 布局动画：每次提交后、绘制前对比各任务上一帧位置，位移即从旧位置滑到新位置
  // （补加星标平滑滑顶；完成/撤销时在今日↔已完成两区间连续滑移而非瞬移闪没，2026-08 反馈）
  useLayoutEffect(() => { flipIn(rootRef.current) })

  // v1.24 F：repeat「跳过一次」只推 dueDate 不记完成（"跳过不补"会推进到首个 ≥ today 的槽位）
  // 逾期区一键顺延（既有「清理历史待办」同款：confirm + toast 撤销）
  const postponeAllRecent = async (list: Task[]) => {
    if (list.length === 0) return
    if (!(await confirm({ title: '顺延 ' + list.length + ' 项逾期任务？', description: '到期日改成今天，任务回到「今日」段。', confirmLabel: '顺延' }))) return
    const originals = new Map(list.map(t => [t.id, t.dueDate] as const))
    list.forEach(t => update.mutate({ id: t.id, patch: { dueDate: today } }))
    toast.success('已顺延 ' + list.length + ' 项', {
      action: { label: '撤销', onClick: () => originals.forEach((d, id) => update.mutate({ id, patch: { dueDate: d } })) },
      duration: 5000,
    })
  }
  // v1.24 G：将来任务转正式待办并指定到期日
  const moveSomedayTo = (t: Task, date: string) => {
    update.mutate({ id: t.id, patch: { status: 'todo', dueDate: date } }, { onSuccess: () => { toast.success('已排到 ' + date); setSomedayMenuId(null) } })
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
  // 「明天 / 以后」段：未完成且有日期（或待安排/将来）。isDoneForToday 的任务已经在「已完成」区，不重复出现
  const upcoming = pool.filter(t => t.status !== 'done' && !isDoneForToday(t, today) && t.dueDate !== null && t.dueDate > today)
  const tomorrowList = upcoming.filter(t => t.dueDate === tomorrow)
  const nearList = upcoming.filter(t => t.dueDate! > tomorrow && t.dueDate! <= weekEnd)
  const farList = upcoming.filter(t => t.dueDate! > weekEnd)
  // 待安排（v1.35 修 D-18）：dueDate=null 的普通待办此前**任何视图都看不到**，等于静默隐形
  const unscheduled = pool.filter(t => t.dueDate === null && t.status === 'todo')
  const allTags = [...new Set((tasks ?? []).flatMap(t => t.tags))] // 全部任务的去重标签
  const filtering = Boolean(tag || query.trim())
  // 「进行中」的唯一出口：点卡片上的胶囊回到普通待办（v1.31——此前只能进编辑弹窗改，等于没有出口）
  const toggleDoing = (t: Task) => update.mutate({ id: t.id, patch: { status: t.status === 'doing' ? 'todo' : 'doing' } })

  // v1.24 E：今日区手动拖拽排序——半序只写被拖项一项（上/下邻 sort 中点），焦点/doing 分组由比较器保持
  const todayById = new Map(todayList.map(t => [t.id, t]))
  const drag = useDragSort(todayList.map(t => t.id), (newOrder, movedId) => {
    const i = newOrder.indexOf(movedId)
    const prevSort = i > 0 ? todayById.get(newOrder[i - 1])?.sort : undefined
    const nextSort = i < newOrder.length - 1 ? todayById.get(newOrder[i + 1])?.sort : undefined
    update.mutate({ id: movedId, patch: { sort: midpointSort(prevSort, nextSort) } })
  })

  const planned = todayList.length + doneToday.length
  const counts: Record<DayTab, number> = { today: planned, tomorrow: tomorrowList.length + nearList.length, later: farList.length + unscheduled.length + someday.length }
  const nearGroups = useMemo(() => groupByDate(nearList), [nearList])
  const farGroups = useMemo(() => groupByDate(farList), [farList])

  /** 一段里的普通任务卡（明天/以后共用）：主操作是完成，次操作在 ⋯ 里（改期/编辑/删除） */
  const renderRow = (t: Task) => (
    <TaskItem key={t.id} task={t}
      onToggle={() => toggle(t)}
      onEdit={() => { setEditing(t); setDialogOpen(true) }}
      onDelete={() => void removeTask(t)}
      onReschedule={date => reschedule(t, date)}
      onSkip={t.repeat ? () => skipOnce(t) : undefined} />
  )

  return (
    <div ref={rootRef} className="mx-auto max-w-3xl">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold">今日计划</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            今天 {planned} · 完成 <span className="text-primary">{doneToday.length}</span> · 剩余 {todayList.length}
            {overdue.length > 0 && <span className="text-destructive"> · 逾期 {overdue.length}</span>}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {/* 收尾入口（v1.35）：20:00 后高亮——晚间是它真正被用到的时段 */}
          <Button variant="outline" onClick={() => setWrapOpen(true)} className={cn('shrink-0', new Date().getHours() >= 20 && 'border-primary/50 text-primary')}>
            收尾
          </Button>
          <Button onClick={() => { setEditing(null); setDialogOpen(true) }} className="shrink-0"><Plus className="size-4 mr-1" />新建</Button>
        </div>
      </div>

      {/* 分段控件（v1.35）：44px 触控高，带计数；三等分不折行（320px 下字号降到 12px） */}
      <div role="tablist" aria-label="计划范围" className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1 mb-3">
        {TABS.map(t => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} title={t.hint}
            onClick={() => setTab(t.key)}
            className={cn('h-11 rounded-lg text-xs sm:text-sm font-medium transition-colors',
              tab === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
            {t.label} {counts[t.key]}
          </button>
        ))}
      </div>

      {/* 标签筛选 + 标题搜索：作用于三个分段 */}
      <div className="flex flex-wrap items-center gap-1.5 mb-3">
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
      ) : tab === 'today' ? (
        todayList.length === 0 && doneToday.length === 0 && overdue.length === 0 ? (
          <EmptyState icon="✓" title={filtering ? '没有匹配的任务' : '今天没有安排'}
            desc={filtering ? '换个标签或关键词试试' : '从明天移一条过来，或点右上角新建'} />
        ) : (
          <div className="space-y-4">
            {overdue.length > 0 && (
              <section>
                <h2 className="text-xs text-destructive font-medium mb-1.5 flex items-center">
                  <span>已逾期 {recent.length} 项{old.length > 0 && ' · 更早 ' + old.length + ' 项已折叠'}</span>
                  {recent.length > 0 && (
                    <button onClick={() => void postponeAllRecent(recent)}
                      className="ml-auto text-[10px] text-destructive/80 hover:text-destructive border border-destructive/30 rounded-full px-2 py-1 transition-colors">
                      全部顺延到今天
                    </button>
                  )}
                </h2>
                {recent.length > 0 && (
                  <div className="space-y-1.5">
                    {recent.map(t => (
                      <div key={t.id} className="rounded-xl border border-destructive/25 bg-destructive/5">
                        <TaskItem task={t}
                          onToggle={() => toggle(t)}
                          onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus } })}
                          onEdit={() => { setEditing(t); setDialogOpen(true) }}
                          onDelete={() => void removeTask(t)}
                          onPostpone={() => reschedule(t, today, { title: '已顺延到今天' })}
                          onToggleDoing={() => toggleDoing(t)}
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
                          onToggle={() => toggle(t)}
                          onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus } })}
                          onEdit={() => { setEditing(t); setDialogOpen(true) }}
                          onDelete={() => void removeTask(t)}
                          onPostpone={() => reschedule(t, today, { title: '已顺延到今天' })}
                          onToggleDoing={() => toggleDoing(t)}
                          onChecklist={items => update.mutate({ id: t.id, patch: { checklist: items } })}
                          onReschedule={date => reschedule(t, date)}
                          onSkip={t.repeat ? () => skipOnce(t) : undefined} />
                      ))}
                      <Button
                        variant="outline" size="sm" className="w-full text-xs text-destructive border-destructive/30"
                        onClick={() => {
                          void (async () => {
                            if (!(await confirm({ title: '清理 ' + old.length + ' 项更早的历史待办？', description: '会标记为已完成，不再出现在待办里。重复任务只算今天这一次，序列继续。', confirmLabel: '清理', destructive: true }))) return
                            // 逐条走 completionPatch（v1.35）：原实现直接写 status:'done'，会把重复任务的整条序列终结掉（D-19）
                            completeMany(old, { title: '已清理 ' + old.length + ' 项历史待办' })
                          })()
                        }}>
                        清理历史待办（全部标记完成）
                      </Button>
                    </div>
                  </details>
                )}
              </section>
            )}
            <section>
              {overdue.length > 0 && todayList.length > 0 && <h2 className="text-xs font-medium text-muted-foreground mb-1.5">今日</h2>}
              {/* 拖拽容器：拖拽期间 overscroll-contain 防触摸滚动链（触摸三坑之二，见 lib/drag-sort.ts） */}
              <div ref={drag.containerRef} className={cn('space-y-1.5', drag.draggingId && 'overscroll-contain')}>
                {drag.order.map(id => {
                  const t = todayById.get(id)
                  if (!t) return null
                  return (
                    <TaskItem key={id} task={t}
                      drag={{ id, handle: drag.handleProps(id) }}
                      onToggle={() => toggle(t, { after: () => setDoneOpen(true) })}
                      onFocus={() => update.mutate({ id: t.id, patch: { focus: !t.focus, focusDate: t.focus ? null : today } })}
                      onEdit={() => { setEditing(t); setDialogOpen(true) }}
                      onDelete={() => void removeTask(t)}
                      onToggleDoing={() => toggleDoing(t)}
                      onChecklist={items => update.mutate({ id: t.id, patch: { checklist: items } })}
                      onReschedule={date => reschedule(t, date)}
                      onSkip={t.repeat ? () => skipOnce(t) : undefined} />
                  )
                })}
              </div>
            </section>
            {doneToday.length > 0 && (
              <section>
                <details className="group rounded-xl border border-border bg-card" open={doneOpen} onToggle={e => setDoneOpen(e.currentTarget.open)}>
                  <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
                    <span className="flex items-center gap-1.5">
                      <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
                      已完成 {doneToday.length} 项 · 点勾撤销
                    </span>
                    <span className="text-[10px]">{doneOpen ? '点击折叠' : '点击展开'}</span>
                  </summary>
                  <div className="px-3 pb-3 space-y-1.5">
                    {doneToday.map(t => (
                      <TaskItem key={t.id} task={t} done
                        onToggle={() => toggle(t)}
                        onEdit={() => { setEditing(t); setDialogOpen(true) }}
                        onDelete={() => void removeTask(t)} />
                    ))}
                  </div>
                </details>
              </section>
            )}
          </div>
        )
      ) : tab === 'tomorrow' ? (
        tomorrowList.length === 0 && nearList.length === 0 ? (
          <EmptyState icon="🌤" title={filtering ? '没有匹配的任务' : '明天还是空的'}
            desc={filtering ? '换个标签或关键词试试' : '把今天没做完的移到明天，或新建一条'} />
        ) : (
          <div className="space-y-4">
            {tomorrowList.length > 0 && (
              <section>
                <h2 className="text-xs font-medium text-muted-foreground mb-1.5">明天 · {tomorrowList.length} 项</h2>
                <div className="space-y-1.5">{tomorrowList.map(renderRow)}</div>
              </section>
            )}
            {nearGroups.map(([date, group]) => (
              <section key={date}>
                <h2 className="text-xs font-medium text-muted-foreground mb-1.5">{dayLabel(date, today)} · {group.length} 项</h2>
                <div className="space-y-1.5">{group.map(renderRow)}</div>
              </section>
            ))}
          </div>
        )
      ) : (
        unscheduled.length === 0 && someday.length === 0 && farGroups.length === 0 ? (
          <EmptyState icon="🗂" title={filtering ? '没有匹配的任务' : '以后没有安排'}
            desc={filtering ? '换个标签或关键词试试' : '没有日期的待办会落在「待安排」，搁置的落在「将来」'} />
        ) : (
          <div className="space-y-4">
            {unscheduled.length > 0 && (
              <section>
                <h2 className="text-xs font-medium text-muted-foreground mb-1.5">待安排 · {unscheduled.length} 项</h2>
                <p className="text-[10px] text-muted-foreground/70 mb-1.5">没有日期的待办。给个日期就进「今天 / 明天」，或先放着。</p>
                <div className="space-y-1.5">{unscheduled.map(renderRow)}</div>
              </section>
            )}
            {someday.length > 0 && (
              <section>
                <h2 className="text-xs font-medium text-muted-foreground mb-1.5">将来 · {someday.length} 项</h2>
                <div className="space-y-1.5">
                  {someday.map(t => (
                    <div key={t.id} className="flex items-center gap-2 bg-card border border-border rounded-xl px-3.5 py-2">
                      <span className="flex-1 min-w-0 text-sm truncate">{t.title}</span>
                      {t.tags.length > 0 && <span className="shrink-0 text-[10px] text-muted-foreground">{t.tags.join(' / ')}</span>}
                      <button onClick={() => update.mutate({ id: t.id, patch: { status: 'todo', dueDate: today } }, { onSuccess: () => toast.success('已移到今天') })}
                        title="移到今天" className="shrink-0 flex items-center gap-0.5 text-[10px] text-primary border border-primary/30 rounded-full px-2 py-1.5 hover:bg-primary/10 transition-colors">
                        <CalendarClock className="size-3" />移到今天
                      </button>
                      {/* v1.24 G：⋯ 菜单——选日期（转正式待办 + 自选到期日）/ 编辑 / 删除（原 inline 编辑/删除收编） */}
                      <DropdownMenu open={somedayMenuId === t.id} onOpenChange={o => { setSomedayMenuId(o ? t.id : null); if (o) setSomedayDate('') }}>
                        <DropdownMenuTrigger aria-label="更多操作" className="shrink-0 p-1 text-muted-foreground/50 hover:text-foreground transition-colors">
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
                          <DropdownMenuItem variant="destructive" onClick={() => { setSomedayMenuId(null); void removeTask(t) }}>删除</DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {farGroups.map(([date, group]) => (
              <section key={date}>
                <h2 className="text-xs font-medium text-muted-foreground mb-1.5">{dayLabel(date, today)} · {group.length} 项</h2>
                <div className="space-y-1.5">{group.map(renderRow)}</div>
              </section>
            ))}
          </div>
        )
      )}
      <TaskDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <EveningWrapUp open={wrapOpen} onOpenChange={setWrapOpen} tasks={[...todayList, ...recent]} />
    </div>
  )
}