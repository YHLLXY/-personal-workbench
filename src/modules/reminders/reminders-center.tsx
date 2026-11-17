import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useReminderView } from './api'
import { useReminderStore } from './store'
import { useTaskMutations } from '@/modules/overview/api'
import { kindLabel, reminderFacts, type ReminderState } from './format'
import { completionPatch } from '@/lib/task-rules'
import { AlertTriangle, Bell, CalendarClock, Clock3, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { EmptyState } from '@/components/empty-state'
import { todayStr, type Task } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import { toast } from 'sonner'

/** 三组的固定顺序与配色：已逾期（红）→ 待处理（主色）→ 即将到来（默认）。
 *  分组取代了旧版「全部 / 未读 / 已忽略」三个 tab —— 那三个 tab 的存在本身就是「提醒被当成实体」的产物。
 *  v1.34：顶上三个胶囊从「纯计数」变成**筛选按钮**（原来点了没反应，图二）。 */
const GROUPS: Array<{ key: ReminderState; title: string }> = [
  { key: 'overdue', title: '已逾期' },
  { key: 'due', title: '待处理' },
  { key: 'upcoming', title: '即将到来' },
]

const ROW_TONE: Record<ReminderState, string> = {
  overdue: 'border-destructive/35 bg-destructive/8',
  due: 'border-primary/30 bg-primary/5',
  upcoming: 'border-border bg-card',
}

/** 距上次服务端扫描的分钟数（负数/坏值一律当 0） */
function minutesSince(iso: string): number {
  const ms = Date.now() - new Date(iso).getTime()
  return Number.isFinite(ms) ? Math.max(0, Math.round(ms / 60000)) : 0
}

export default function RemindersCenter() {
  const { rows, dueCount, isLoading, isError } = useReminderView()
  const scannedAt = useReminderStore(s => s.scannedAt)
  const { update } = useTaskMutations()
  const [filter, setFilter] = useState<ReminderState | null>(null)
  const now = Date.now()
  const today = todayStr()

  // 行、计数、排序、行内时刻全部来自 useReminderView 的投影（A 段：提醒行只是任务的投影）
  const items = rows.map(({ reminder, refs }) => ({ r: reminder, refs, facts: reminderFacts(reminder, refs, now) }))
  // 组内统一按到期时刻升序：拖得最久 / 最早到点的排最前，顶上永远是最该处理的那条
  items.sort((a, b) => a.r.scheduledAt.localeCompare(b.r.scheduledAt))
  const overdueCount = items.filter(x => x.facts.state === 'overdue').length
  const pendingCount = dueCount - overdueCount
  const upcomingCount = items.length - dueCount
  const visible = filter ? items.filter(x => x.facts.state === filter) : items

  // 完成：走 completionPatch（重复任务**不能**写 status='done'，那会终结整条序列），5 秒内可撤销
  const complete = (t: Task) => {
    const plan = completionPatch(t, today)
    update.mutate({ id: t.id, patch: plan.patch }, {
      onSuccess: () => toast.success(plan.nextDue ? '已完成' : '已完成，提醒已消除', {
        description: plan.nextDue ? `「${t.title}」下次：${plan.nextDue}` : `「${t.title}」已划线保留`,
        action: { label: '撤销', onClick: () => update.mutate({ id: t.id, patch: plan.undo }) },
        duration: 5000,
      }),
    })
  }
  // 顺延同样带撤销：还原原 dueDate（改期末尾那一下手滑，不然只能进编辑弹窗改回来）
  const postpone = (t: Task) => {
    const original = t.dueDate
    update.mutate({ id: t.id, patch: { dueDate: today } }, {
      onSuccess: () => toast.success('已顺延到今天', {
        action: { label: '撤销', onClick: () => update.mutate({ id: t.id, patch: { dueDate: original } }) },
        duration: 5000,
      }),
    })
  }

  const chips: Array<{ key: ReminderState | null; label: string; count: number; tone: string }> = [
    { key: null, label: '全部', count: items.length, tone: 'border-border text-muted-foreground' },
    { key: 'overdue', label: '已逾期', count: overdueCount, tone: 'border-destructive/30 bg-destructive/8 text-destructive' },
    { key: 'due', label: '待处理', count: pendingCount, tone: 'border-primary/30 bg-primary/8 text-primary' },
    { key: 'upcoming', label: '即将到来', count: upcomingCount, tone: 'border-border text-muted-foreground' },
  ]

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-4">
        <h1 className="text-xl font-bold">提醒中心</h1>
        <p className="text-xs text-muted-foreground mt-0.5">任务到期、考试节点与目标截止 · 到点发通知，逾期标红；把事处理掉，提醒自动消失</p>
        {/* v1.32：把"多久没扫过"变成可见数字 —— 外部推送迟到的根因之一就是扫描间隔（实测中位 199 分钟） */}
        {scannedAt && (
          <p className="mt-1 text-[10px] text-muted-foreground/70">
            上次扫描：{minutesSince(scannedAt) < 1 ? '刚刚' : `${minutesSince(scannedAt)} 分钟前`} · 迟到的提醒会在下一次扫描时补发
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3 text-xs" role="group" aria-label="按状态筛选提醒">
        {chips.map(c => (
          <button key={c.label} type="button" aria-pressed={filter === c.key}
            onClick={() => setFilter(f => (f === c.key ? null : c.key))}
            className={cn('rounded-full border px-3 py-1.5 transition-colors', c.tone,
              filter === c.key ? 'ring-1 ring-current font-medium' : 'opacity-75 hover:opacity-100')}>
            {c.label} {c.count}
          </button>
        ))}
      </div>
      {isLoading ? (
        <div className="space-y-2"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div>
      ) : isError ? (
        <p className="text-sm text-destructive py-10 text-center">加载失败，请重试</p>
      ) : items.length === 0 ? (
        <EmptyState icon="⏰" title="暂无提醒" desc="给待办设置提醒时间、给考试设置考试时间后，这里会按节点出现提醒" />
      ) : visible.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">这个分类下没有提醒</p>
      ) : (
        <div className="space-y-4">
          {GROUPS.map(g => {
            const list = visible.filter(x => x.facts.state === g.key)
            if (list.length === 0) return null
            return (
              <section key={g.key}>
                <h2 className={cn('text-xs font-medium mb-1.5 flex items-center gap-1.5', g.key === 'overdue' ? 'text-destructive' : 'text-muted-foreground')}>
                  {g.key === 'overdue' && <AlertTriangle className="size-3.5" strokeWidth={2} />}
                  {g.title} {list.length} 条
                </h2>
                <div className="space-y-1.5">
                  {list.map(({ r, refs, facts }) => {
                    const task = refs.task
                    return (
                      <div key={r.id} className={cn('flex items-start gap-3 rounded-xl border p-3', ROW_TONE[facts.state])}>
                        {facts.state === 'overdue'
                          ? <AlertTriangle className="size-4 mt-0.5 shrink-0 text-destructive" strokeWidth={1.8} />
                          : facts.state === 'due'
                            ? <Bell className="size-4 mt-0.5 shrink-0 text-primary" strokeWidth={1.7} />
                            : <Clock3 className="size-4 mt-0.5 shrink-0 text-muted-foreground" strokeWidth={1.7} />}
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium break-words">{facts.text}</div>
                          <div className="text-[10px] text-muted-foreground mt-0.5">
                            {kindLabel(r.kind)} · {new Date(r.scheduledAt).toLocaleString('zh-CN', { hour12: false })}
                            {r.sentAt ? ' · 已通知' : facts.state === 'upcoming' ? ' · 待通知' : ' · 未送达'}
                            {facts.state === 'overdue' && ' · 已逾期'}
                          </div>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5 self-center">
                          {task && (
                            <>
                              {facts.state === 'overdue' && (
                                <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={update.isPending} onClick={() => postpone(task)}>
                                  <CalendarClock className="size-3 mr-1" />顺延
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" className="h-7 text-[11px]" disabled={update.isPending} onClick={() => complete(task)}>完成</Button>
                            </>
                          )}
                          {!facts.missing && (
                            <Link to={task ? '/tasks' : '/study'} className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors">
                              查看<ExternalLink className="size-3" />
                            </Link>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}
