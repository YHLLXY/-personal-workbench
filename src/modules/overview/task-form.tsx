import { useEffect, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ChevronDown, Star } from 'lucide-react'
import { useTaskMutations } from './api'
import { toast } from 'sonner'
import { todayStr } from '@/lib/db/types'
import { addDays } from '@/lib/repeat'
import { dayLabel } from '@/lib/day-plan'
import { cn } from '@/lib/utils'
import type { Task, TaskInput, TaskRepeat } from '@/lib/db/types'

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']
/** 重复预设：none/daily/weekday/weekly/monthly 为快捷项，custom 才暴露 interval/单位/锚点；
 *  anchor='complete' 的存量值反解为 custom（快捷项固定按计划日推），否则保存时会丢锚点 */
type RepeatPreset = 'none' | 'daily' | 'weekday' | 'weekly' | 'monthly' | 'custom'
const isWorkweek = (ws: number[]) => ws.length === 5 && [1, 2, 3, 4, 5].every(d => ws.includes(d))
function weekdayOf(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00')
  return Number.isNaN(d.getTime()) ? 1 : d.getDay()
}
/** weekly 无选中时的兜底：任务到期日的星期 */
function defaultWeekdays(dueDate: string): number[] { return [weekdayOf(dueDate)] }
const clampInterval = (n: number) => Math.min(30, Math.max(1, Math.floor(n) || 1))

/**
 * 新建 / 编辑任务表单（v1.35，委托书 5.4）。
 *
 * 旧版把 10 个控件平铺在一个弹窗里：手机上要滚 1.6 屏才能看到「添加」按钮，而其中 9 个是选填的。
 * 现在只有两件事在首屏：**标题**（唯一必填）和**日期**（今天 / 明天 / 自选）。其余全部折进「更多设置」，
 * 提交按钮吸底——键盘弹出时它仍然在屏幕上（这是移动端表单最容易踩的坑）。
 * 桌面端与移动端共用这一个表单，只是外壳不同（Dialog / 底部 Sheet）。
 */
export function TaskForm({ editing, onDone }: { editing?: Task | null; onDone: () => void }) {
  const { create, update } = useTaskMutations()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<'todo' | 'doing' | 'someday'>('todo') // 状态 pills：待办 / 进行中 / 将来
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [focus, setFocus] = useState(false)
  const [dueDate, setDueDate] = useState(todayStr())
  // 切到「将来」前的日期，切回来时还原（旧版切到将来不清日期，存下 someday+dueDate 这种自相矛盾的数据）
  const [savedDate, setSavedDate] = useState<string | null>(null)
  const [dueTime, setDueTime] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [repeatPreset, setRepeatPreset] = useState<RepeatPreset>('none')
  const [repeatInterval, setRepeatInterval] = useState(1)
  const [repeatUnit, setRepeatUnit] = useState<'daily' | 'weekly' | 'monthly'>('daily')
  const [repeatWeekdays, setRepeatWeekdays] = useState<number[]>([])
  const [repeatAnchor, setRepeatAnchor] = useState<'due' | 'complete'>('due')
  // 「更多设置」默认收起；编辑已有复杂任务时自动展开——不然用户看不到自己设过的重复/提醒，会以为丢了
  const [advanced, setAdvanced] = useState(false)

  useEffect(() => {
    setTitle(editing?.title ?? '')
    setNote(editing?.note ?? '')
    setStatus(editing?.status === 'someday' ? 'someday' : editing?.status === 'doing' ? 'doing' : 'todo') // done 回落为 todo
    setPriority(editing?.priority ?? 'medium')
    setFocus(editing?.focus ?? false)
    setDueDate(editing?.dueDate ?? todayStr())
    setDueTime(editing?.dueTime ?? '')
    setTagsText(editing?.tags?.join('，') ?? '')
    setSavedDate(null)
    setAdvanced(Boolean(editing && (editing.note || editing.repeat || editing.dueTime || editing.tags.length > 0 || editing.status === 'doing' || editing.status === 'someday' || editing.priority !== 'medium')))
    const r = editing?.repeat
    if (r) {
      const ws = [...(r.weekdays ?? [])].sort((a, b) => a - b)
      setRepeatAnchor(r.anchor)
      setRepeatInterval(r.interval)
      setRepeatUnit(r.freq)
      setRepeatWeekdays(ws.length ? ws : defaultWeekdays(editing?.dueDate ?? todayStr()))
      if (r.anchor === 'due' && r.interval === 1 && r.freq === 'daily') setRepeatPreset('daily')
      else if (r.anchor === 'due' && r.freq === 'weekly' && r.interval === 1 && isWorkweek(ws)) setRepeatPreset('weekday')
      else if (r.anchor === 'due' && r.freq === 'weekly' && r.interval === 1) setRepeatPreset('weekly')
      else if (r.anchor === 'due' && r.freq === 'monthly' && r.interval === 1) setRepeatPreset('monthly')
      else setRepeatPreset('custom')
    } else {
      setRepeatPreset('none'); setRepeatInterval(1); setRepeatUnit('daily'); setRepeatWeekdays([]); setRepeatAnchor('due')
    }
  }, [editing])

  const showWeekdayChips = repeatPreset === 'weekly' || (repeatPreset === 'custom' && repeatUnit === 'weekly')

  /** 状态切换的唯一入口：将来 = **无日期的收件箱**，来回切不丢日期也不丢重复规则（v1.31） */
  function pickStatus(v: 'todo' | 'doing' | 'someday') {
    if (v === 'someday' && status !== 'someday') {
      setSavedDate(dueDate || null)
      setDueDate('')
      setDueTime('')
    } else if (v !== 'someday' && status === 'someday') {
      setDueDate(savedDate || todayStr())
    }
    setStatus(v)
  }

  function toggleWeekday(d: number) {
    // custom 且每周 interval>1 时限单选（整周步进语义），其余多选
    const single = repeatPreset === 'custom' && repeatUnit === 'weekly' && repeatInterval > 1
    setRepeatWeekdays(ws => single ? [d] : ws.includes(d) ? ws.filter(x => x !== d) : [...ws, d].sort((a, b) => a - b))
  }

  function buildRepeat(): TaskRepeat | null {
    if (repeatPreset === 'none') return null
    if (repeatPreset === 'daily') return { freq: 'daily', interval: 1, anchor: 'due' }
    if (repeatPreset === 'weekday') return { freq: 'weekly', interval: 1, weekdays: [1, 2, 3, 4, 5], anchor: 'due' }
    if (repeatPreset === 'weekly') return { freq: 'weekly', interval: 1, weekdays: repeatWeekdays.length ? repeatWeekdays : defaultWeekdays(dueDate), anchor: 'due' }
    if (repeatPreset === 'monthly') return { freq: 'monthly', interval: 1, anchor: 'due' }
    // custom：锚点只在自定义里可设（快捷项固定按计划日推）
    return {
      freq: repeatUnit,
      interval: clampInterval(repeatInterval),
      ...(repeatUnit === 'weekly' ? { weekdays: repeatWeekdays.length ? repeatWeekdays : defaultWeekdays(dueDate) } : {}),
      anchor: repeatAnchor,
    }
  }

  function submit() {
    if (!title.trim()) return
    const tags = tagsText.split(/[,，]/).map(s => s.trim()).filter(Boolean)
    const payload: TaskInput = {
      title: title.trim(),
      status,
      priority,
      focus,
      // 只在焦点「由关变开」时绑定今天；已是焦点则沿用原绑定日。
      // 旧实现无条件写 todayStr()：编辑任何旧焦点任务（哪怕只改标题）都会把它拉回今天的今日区（v1.31 修）
      focusDate: focus ? (editing?.focus ? editing.focusDate ?? todayStr() : todayStr()) : null,
      dueDate: status === 'someday' ? null : dueDate || null, // 将来任务 = 不排期
      dueTime: status === 'someday' ? null : dueTime || null,
      tags,
      // v1.31：不再因为切到「将来」而静默清空重复规则（切回来不会恢复 = 数据丢失）
      repeat: buildRepeat(),
    }
    // v1.25 备注条件挂键：杜绝 patch 里出现 note: undefined（本地 spread 会把已存备注抹成 undefined，
    // 而云端丢 undefined 键=保留，两边漂移）。有内容才挂；编辑时清空才显式 null
    if (note.trim()) payload.note = note.trim()
    else if (editing?.note) payload.note = null
    const onSuccess = () => { onDone(); toast.success(editing ? '已保存' : '已添加') }
    if (editing) update.mutate({ id: editing.id, patch: payload }, { onSuccess })
    else create.mutate(payload, { onSuccess })
  }

  const tomorrow = addDays(todayStr(), 1)

  return (
    <form className="flex min-h-0 flex-1 flex-col" onSubmit={e => { e.preventDefault(); submit() }}>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3">
        <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="要做什么？"
          aria-label="任务内容" className="h-11 text-base" />
        {/* 日期：两个最快档 + 原生日期（44px）。将来任务不排期，整条禁用并说明 */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground shrink-0">日期</span>
            {[{ label: '今天', date: todayStr() }, { label: '明天', date: tomorrow }].map(o => (
              <button key={o.label} type="button" disabled={status === 'someday'}
                onClick={() => setDueDate(o.date)} aria-pressed={dueDate === o.date}
                className={cn('h-9 px-3 rounded-full border text-xs transition-colors disabled:opacity-40',
                  dueDate === o.date ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>
                {o.label}
              </button>
            ))}
            {dueDate && <span className="text-[10px] text-muted-foreground">{dayLabel(dueDate, todayStr())}</span>}
          </div>
          <Input id="task-due-date" type="date" value={dueDate} disabled={status === 'someday'} onChange={e => setDueDate(e.target.value)}
            aria-label={status === 'someday' ? '日期（将来任务不排期）' : '日期'} className="h-11" />
        </div>

        <button type="button" onClick={() => setAdvanced(o => !o)} aria-expanded={advanced}
          className="flex w-full items-center justify-between h-11 px-1 text-xs text-muted-foreground hover:text-foreground transition-colors">
          <span>更多设置（备注 / 优先级 / 重复 / 提醒 / 标签 / 状态）</span>
          <ChevronDown className={cn('size-4 transition-transform', advanced && 'rotate-180')} />
        </button>

        {advanced && (
          <div className="space-y-3">
            {/* v1.25 备注：显示在卡片标题下方（灰字，最多 2 行，全文进这里看） */}
            <div className="space-y-1.5">
              <Label htmlFor="task-note">备注（可选，显示在卡片上）</Label>
              <Textarea id="task-note" rows={2} value={note} onChange={e => setNote(e.target.value)} placeholder="补充细节、链接、背景…" />
            </div>
            <div className="flex gap-3">
              <Select value={priority} onValueChange={v => setPriority(v as typeof priority)} items={{ high: '高优先级', medium: '中优先级', low: '低优先级' }}>
                <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="high"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-destructive" />高优先级</span></SelectItem>
                  <SelectItem value="medium"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-accent" />中优先级</span></SelectItem>
                  <SelectItem value="low"><span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-muted-foreground/40" />低优先级</span></SelectItem>
                </SelectContent>
              </Select>
              <Button variant={focus ? 'default' : 'outline'} type="button" className="flex-1 h-9" onClick={() => setFocus(f => !f)}>
                <Star className={cn('size-3.5 mr-1.5', focus && 'fill-current')} strokeWidth={1.7} />{focus ? '今日焦点' : '设为焦点'}
              </Button>
            </div>
            {/* 状态 pills：三态语义 v1.31 补完，并且把说明写在看得见的地方（用户原话「我还是没有搞懂」） */}
            <div className="space-y-1.5">
              <div className="flex gap-2">
                {([['todo', '待办'], ['doing', '进行中'], ['someday', '将来']] as const).map(([v, label]) => (
                  <button key={v} type="button" onClick={() => pickStatus(v)}
                    className={cn('flex-1 text-xs px-3 py-2 rounded-full border transition-colors', status === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label}</button>
                ))}
              </div>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                {status === 'todo' ? '待办：有日期，到期当天进「今日计划」，过期进「已逾期」。'
                  : status === 'doing' ? '进行中：正在推进的事，不管日期天天留在「今日计划」顶部，直到你改回待办或完成。'
                  : '将来：还没排期的事，不设日期、不提醒，收在「以后 · 将来」里，想清楚哪天做再排。'}
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>重复</Label>
              <Select value={repeatPreset} onValueChange={v => {
                const preset = v as RepeatPreset
                if ((preset === 'weekly' || preset === 'custom') && repeatWeekdays.length === 0) setRepeatWeekdays(defaultWeekdays(dueDate))
                setRepeatPreset(preset)
              }} items={{ none: '不重复', daily: '每天', weekday: '每个工作日', weekly: '每周', monthly: '每月', custom: '自定义…' }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不重复</SelectItem>
                  <SelectItem value="daily">每天</SelectItem>
                  <SelectItem value="weekday">每个工作日</SelectItem>
                  <SelectItem value="weekly">每周</SelectItem>
                  <SelectItem value="monthly">每月</SelectItem>
                  <SelectItem value="custom">自定义…</SelectItem>
                </SelectContent>
              </Select>
              {showWeekdayChips && (
                <div className="flex flex-wrap gap-1">
                  {WEEK_CN.map((label, d) => (
                    <button key={d} type="button" onClick={() => toggleWeekday(d)}
                      className={cn('size-8 text-xs rounded-full border transition-colors', repeatWeekdays.includes(d) ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label}</button>
                  ))}
                </div>
              )}
              {repeatPreset === 'custom' && (
                <div className="space-y-2 rounded-lg border border-border p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground shrink-0">每</span>
                    <Input type="number" min={1} max={30} value={repeatInterval}
                      onChange={e => setRepeatInterval(clampInterval(Number(e.target.value)))} className="h-8 w-16" />
                    <Select value={repeatUnit} onValueChange={v => setRepeatUnit(v as typeof repeatUnit)} items={{ daily: '天', weekly: '周', monthly: '月' }}>
                      <SelectTrigger className="h-8 w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="daily">天</SelectItem>
                        <SelectItem value="weekly">周</SelectItem>
                        <SelectItem value="monthly">月</SelectItem>
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground">一次</span>
                  </div>
                  <div className="flex gap-1.5">
                    {([['due', '按计划日推'], ['complete', '按完成日推']] as const).map(([v, label]) => (
                      <button key={v} type="button" onClick={() => setRepeatAnchor(v)}
                        className={cn('flex-1 text-xs px-2 py-1.5 rounded-md border transition-colors', repeatAnchor === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-due-time">提醒时间（可选，到点通知）</Label>
              <Input id="task-due-time" type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="task-tags">标签（可选，逗号分隔）</Label>
              <Input id="task-tags" value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="如：工作，学习" className="h-11" />
            </div>
          </div>
        )}
      </div>
      {/* 吸底提交：键盘弹出时仍在屏幕上（移动端表单第一坑） */}
      <div className="shrink-0 border-t border-border bg-popover px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <Button type="submit" className="w-full h-11" disabled={!title.trim() || (editing ? update.isPending : create.isPending)}>
          {editing ? '保存' : '添加'}
        </Button>
      </div>
    </form>
  )
}
