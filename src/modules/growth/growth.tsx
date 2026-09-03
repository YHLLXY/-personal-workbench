import { useState, type MouseEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, ChevronRight, Flame, Plus, RotateCcw, TrendingUp } from 'lucide-react'
import { useGrowthActions, useImportPresets } from './api'
import { celebrate, streakMilestone } from '@/lib/celebrate'
import { useHabits, useHabitLogs, useSetHabitLog } from '../health/api'
import { useReviews } from '../review/api'
import { todayStr } from '../../lib/db/types'
import { streakFromLogDates } from '../../lib/heatmap'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { EmptyState } from '@/components/empty-state'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { GrowthAction, Habit } from '../../lib/db/types'
import { ActionDetail } from './action-detail'

const CATEGORY_LABEL: Record<string, string> = {
  '睡眠': '睡眠', '学业': '学业', '表达': '表达', '职业': '职业', '心理': '心理', '财务': '财务', '决策': '决策', '精力': '精力',
}

/** 行动 30 天内曾打卡过 → 本周进度格子（最近 7 天） */
function weekCells(dates: Set<string>): boolean[] {
  const now = new Date()
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6 - i))
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return dates.has(key)
  })
}

export default function Growth() {
  const [tab, setTab] = useState('today')
  const { data: actions } = useGrowthActions()
  const importPresets = useImportPresets()

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-xl font-bold mb-1">自我提升</h1>
      <p className="text-xs text-muted-foreground mb-4">338 题问卷 × 十项行动 · 让成长看得见</p>
      {(actions ?? []).length === 0 && (
        <div className="bg-card border border-border rounded-2xl p-6 mb-4 text-center">
          <p className="text-3xl mb-2">📈</p>
          <p className="text-sm font-medium mb-1">还没有行动计划</p>
          <p className="text-xs text-muted-foreground mb-4">基于「相互了解工程」338 题问卷生成的十项行动，一键导入即可开始打卡</p>
          <Button onClick={() => importPresets.mutate(actions ?? [], { onSuccess: n => toast.success(`已导入 ${n} 项行动，去「今日行动」打卡吧`) })} disabled={importPresets.isPending}>
            {importPresets.isPending ? '导入中…' : '一键导入十项行动'}
          </Button>
        </div>
      )}
      <Tabs value={tab} onValueChange={v => setTab(v as string)}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="today">今日行动</TabsTrigger>
          <TabsTrigger value="plans">行动计划</TabsTrigger>
          <TabsTrigger value="review">周复盘</TabsTrigger>
        </TabsList>
        <TabsContent value="today" className="pt-4"><TodayPanel onGoToPlans={() => setTab('plans')} /></TabsContent>
        <TabsContent value="plans" className="pt-4"><PlansPanel /></TabsContent>
        <TabsContent value="review" className="pt-4"><ReviewPanel /></TabsContent>
      </Tabs>
    </div>
  )
}

/** Tab1 今日行动：进行中行动的打卡清单（复用习惯打卡链路） */
function TodayPanel({ onGoToPlans }: { onGoToPlans: () => void }) {
  const { data: actions } = useGrowthActions()
  const { data: habits } = useHabits()
  const { data: logs } = useHabitLogs()
  const setLog = useSetHabitLog()
  const today = todayStr()
  const active = (actions ?? []).filter(a => a.status === 'active').sort((a, b) => a.no - b.no)
  const habitOf = (a: GrowthAction) => habits?.find(h => h.id === a.habitId && h.active)

  if (active.length === 0) return (
    <EmptyState icon={<TrendingUp />} title="还没有进行中的行动" desc="在「行动计划」一键导入十项行动后，这里按天打卡"
      action={<Button size="sm" onClick={onGoToPlans}>去行动计划</Button>} />
  )

  /** 打卡 + 三层成就感反馈：卡片动效 / 纸屑震动 / 全部完成与连击里程碑加强 toast */
  function checkIn(e: MouseEvent<HTMLButtonElement>, a: GrowthAction, habit: Habit) {
    const done = logs?.find(l => l.habitId === habit.id && l.logDate === today)?.count ?? 0
    const next = done > 0 ? 0 : 1
    if (next === 1) {
      const newStreak = streakFromLogDates([...(logs?.filter(l => l.habitId === habit.id).map(l => l.logDate) ?? []), today])
      const othersUndone = active.filter(x => {
        const h = habitOf(x)
        return h && h.id !== habit.id && !logs?.some(l => l.habitId === h.id && l.logDate === today)
      }).length
      const all = othersUndone === 0
      const milestone = streakMilestone(newStreak)
      void celebrate(e.currentTarget, all || milestone != null ? 'grand' : 'single')
      if (all) toast.success(`今日行动全部完成 🎉 连击 ${newStreak} 天`)
      else if (milestone) toast.success(`「${a.title}」打卡成功 · 连击 ${newStreak} 天 🔥`)
      else toast.success(`「${a.title}」打卡成功`)
    } else {
      toast.info(`已取消「${a.title}」`)
    }
    setLog.mutate({ habitId: habit.id, date: today, count: next })
  }

  return (
    <div className="space-y-2">
      {active.map(a => {
        const habit = habitOf(a)
        const done = habit ? logs?.find(l => l.habitId === habit.id && l.logDate === today)?.count ?? 0 : 0
        const dates = habit ? new Set(logs?.filter(l => l.habitId === habit.id).map(l => l.logDate) ?? []) : new Set<string>()
        return (
          <div key={a.id} className={cn('flex items-center gap-3 bg-card border border-border rounded-xl px-4 py-3 transition-colors', done > 0 ? 'border-primary/40 bg-primary/5' : '')}>
            <span className="text-lg">{a.emoji}</span>
            <div className="flex-1 min-w-0">
              <p className={cn('text-sm truncate transition-colors', done > 0 && 'line-through text-muted-foreground')}>{a.title}</p>
              <p className="text-[10px] text-muted-foreground">行动 {a.no} · {CATEGORY_LABEL[a.category] ?? a.category} {done > 0 ? '· 今日已完成' : ''}</p>
            </div>
            {habit ? (
              <>
                <span className="text-xs text-muted-foreground flex items-center gap-0.5 shrink-0"><Flame className="size-3 text-orange-400" />{streakFromLogDates([...dates])} 天</span>
                <button onClick={e => checkIn(e, a, habit)}
                  aria-label={`打卡 ${a.title}`}
                  className={cn('size-6 rounded-full border-[1.5px] flex items-center justify-center transition-colors active:scale-90', done > 0 ? 'bg-primary border-primary text-primary-foreground' : 'border-muted-foreground/40 text-muted-foreground hover:border-primary')}>
                  {done > 0 ? <Check className="size-3.5 check-pop" /> : <Plus className="size-3.5" />}
                </button>
              </>
            ) : (
              <span className="text-[10px] text-muted-foreground shrink-0">未绑定打卡</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

type Filter = 'all' | 'active' | 'paused' | 'done'

/** Tab2 行动计划：状态筛选 + 行动卡片（点击打开详情） */
function PlansPanel() {
  const { data: actions } = useGrowthActions()
  const { data: habits } = useHabits()
  const { data: logs } = useHabitLogs()
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<GrowthAction | null>(null)
  const today = todayStr()

  const list = (actions ?? []).sort((a, b) => a.no - b.no).filter(a => filter === 'all' || a.status === filter)
  const activeCount = (actions ?? []).filter(a => a.status === 'active').length
  const doneCount = (actions ?? []).filter(a => a.status === 'done').length
  const stats = (f: Filter) => f === 'all' ? `${actions?.length ?? 0} 项` : f === 'active' ? `${activeCount} 项` : f === 'paused' ? `${(actions ?? []).filter(a => a.status === 'paused').length} 项` : `${doneCount} 项`

  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {([['all', '全部'], ['active', '进行中'], ['paused', '已暂停'], ['done', '已完成']] as [Filter, string][]).map(([f, label]) => (
          <button key={f} onClick={() => setFilter(f)} className={cn('text-xs px-3 py-1.5 rounded-full border', filter === f ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label} {stats(f)}</button>
        ))}
      </div>
      <div className="space-y-2">
        {list.map(a => {
          const habit = habits?.find(h => h.id === a.habitId && h.active)
          const dates = habit ? new Set(logs?.filter(l => l.habitId === habit.id).map(l => l.logDate) ?? []) : new Set<string>()
          const cells = weekCells(dates)
          const weekCount = cells.filter(Boolean).length
          return (
            <button key={a.id} onClick={() => setSelected(a)} className="w-full text-left bg-card border border-border rounded-2xl px-4 py-3 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-2.5">
                <span className="text-lg">{a.emoji}</span>
                <p className="text-sm font-medium flex-1 truncate">{a.title}</p>
                {a.status !== 'active' && <Badge variant="secondary" className="text-[10px] shrink-0">{a.status === 'done' ? '已完成' : '已暂停'}</Badge>}
                <ChevronRight className="size-4 text-muted-foreground/50 shrink-0" />
              </div>
              <p className="text-[11px] text-muted-foreground mt-1 line-clamp-1">{a.why}</p>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] text-muted-foreground">行动 {a.no}</span>
                <div className="flex gap-0.5">
                  {cells.map((on, i) => <span key={i} className={cn('h-2.5 w-2.5 rounded-[3px]', on ? 'bg-primary' : 'bg-muted')} />)}
                </div>
                <span className="text-[10px] text-muted-foreground">本周 {weekCount}/7</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 ml-auto"><Flame className="size-3 text-orange-400" />{streakFromLogDates([...dates])} 天</span>
                {habit && <span className="text-[10px] text-muted-foreground">{dates.has(today) ? '今日 ✓' : '今日未打卡'}</span>}
              </div>
            </button>
          )
        })}
        {list.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">{filter === 'all' ? '还没有行动计划，点上面「一键导入十项行动」' : '该状态下暂无行动'}</p>}
      </div>
      <ActionDetail action={selected} onClose={() => setSelected(null)} />
    </div>
  )
}

/** Tab3 周复盘：本周复盘状态 + 每周日提醒 */
function ReviewPanel() {
  const navigate = useNavigate()
  const { data: reviews } = useReviews()
  const today = todayStr()
  const thisWeek = (reviews ?? []).filter(r => {
    const d = new Date(today); d.setDate(d.getDate() - 7)
    const cutoff = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    return r.reviewDate >= cutoff && r.reviewDate <= today
  }).length
  const isSunday = new Date().getDay() === 0

  return (
    <div className="space-y-3">
      <div className="bg-card border border-border rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="size-4 text-primary" />
          <p className="text-sm font-medium">本周复盘</p>
          <span className="text-[10px] text-muted-foreground ml-auto">{thisWeek} 条记录</span>
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          {isSunday
            ? thisWeek > 0 ? '本周已复盘 ✓ 记得看看十项行动的打卡数据，微调下周计划' : '今天是周日——花 15 分钟写本周复盘，看看行动打卡数据'
            : thisWeek > 0 ? '本周已复盘 ✓ 继续保持' : '本周还没写复盘。复盘是你最强的习惯，周末花 15 分钟和 Claudian 一起过一遍'}
        </p>
        <Button size="sm" variant="outline" className="mt-3" onClick={() => navigate('/review')}>
          <RotateCcw className="size-3.5 mr-1" />去写复盘
        </Button>
      </div>
      <div className="bg-card border border-border rounded-2xl p-5">
        <p className="text-sm font-medium mb-2">复盘时看什么</p>
        <ul className="text-xs text-muted-foreground space-y-1.5 list-disc pl-4">
          <li>本周各行动打卡天数（行动计划卡片上有周格子）</li>
          <li>行动 1 睡眠：本周熬夜几天？深夜刷手机多久？</li>
          <li>行动 8 表达：这周的 1 次主动表达完成了吗</li>
          <li>焦虑清单（行动 6）：担心的事真的发生了几个？</li>
          <li>下周微调：哪条行动降强度、哪条加码</li>
        </ul>
      </div>
    </div>
  )
}