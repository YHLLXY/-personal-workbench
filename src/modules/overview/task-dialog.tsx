import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star } from 'lucide-react'
import { useTaskMutations } from './api'
import { toast } from 'sonner'
import { todayStr } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import type { Task, TaskInput, TaskRepeat } from '@/lib/db/types'

const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']
/** 重复预设：none/daily/weekday/weekly/monthly 为快捷项，custom 才暴露 interval/单位/锚点；
 *  anchor='complete' 的存量值反解为 custom（快捷项固定按计划日推），否则保存时会丢锚点 */
type RepeatPreset = 'none' | 'daily' | 'weekday' | 'weekly' | 'monthly' | 'custom'
const isWorkweek = (ws: number[]) => ws.length === 5 && [1, 2, 3, 4, 5].every(d => ws.includes(d))
function weekdayOf(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00`)
  return Number.isNaN(d.getTime()) ? 1 : d.getDay()
}
/** weekly 无选中时的兜底：任务到期日的星期 */
function defaultWeekdays(dueDate: string): number[] { return [weekdayOf(dueDate)] }
const clampInterval = (n: number) => Math.min(30, Math.max(1, Math.floor(n) || 1))

/** 新建 / 编辑任务对话框。focus 开关联动 focusDate：开 → 今天，关 → null */
export function TaskDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing?: Task | null }) {
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

  useEffect(() => {
    if (open) {
      setTitle(editing?.title ?? '')
      setNote(editing?.note ?? '')
      setStatus(editing?.status === 'someday' ? 'someday' : editing?.status === 'doing' ? 'doing' : 'todo') // 暴露 todo/doing/someday 三态，done 回落为 todo
      setPriority(editing?.priority ?? 'medium')
      setFocus(editing?.focus ?? false)
      setDueDate(editing?.dueDate ?? todayStr())
      setDueTime(editing?.dueTime ?? '')
      setTagsText(editing?.tags?.join('，') ?? '')
      // 重复值反解为预设；不匹配任何快捷项（interval≠1 / anchor=complete）落 custom 并带出原值
      setSavedDate(null)
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
    }
  }, [open, editing])

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
      // v1.31：不再因为切到「将来」而静默清空重复规则（切回来不会恢复 = 数据丢失）。
      // 重复控件对所有状态可见 —— 用户看到什么就提交什么
      repeat: buildRepeat(),
    }
    // v1.25 备注条件挂键：杜绝 patch 里出现 note: undefined（本地 applyTaskPatch spread 会把已存备注抹成 undefined，
    // 而云端 supabase-js 丢 undefined 键=保留，两边漂移）。有内容才挂；编辑时清空才显式 null（云端收到 null 才清列）
    if (note.trim()) payload.note = note.trim()
    else if (editing?.note) payload.note = null
    const onDone = () => { onOpenChange(false); toast.success(editing ? '已保存' : '已添加') }
    if (editing) update.mutate({ id: editing.id, patch: payload }, { onSuccess: onDone })
    else create.mutate(payload, { onSuccess: onDone })
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? '编辑任务' : '新建任务'}</DialogTitle></DialogHeader>
        <div className="space-y-3 pt-2">
          <Input autoFocus value={title} onChange={e => setTitle(e.target.value)} placeholder="任务内容" onKeyDown={e => e.key === 'Enter' && submit()} />
          {/* v1.25 备注：显示在卡片标题下方（灰字，最多 2 行，全文进编辑弹窗看） */}
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
            <Button variant={focus ? 'default' : 'outline'} type="button" className="flex-1" onClick={() => setFocus(f => !f)}>
              <Star className={cn('size-3.5 mr-1.5', focus && 'fill-current')} strokeWidth={1.7} />{focus ? '今日焦点' : '设为焦点'}
            </Button>
          </div>
          {/* 状态 pills（样式参考 health RecordsPanel 类型 pills）。三态语义 v1.31 补完，写在下面一行提示里——
              用户上一轮的原话是「进行中以及将来的设置任务的逻辑是什么？我还是没有搞懂」，语义必须写在看得见的地方 */}
          <div className="space-y-1.5">
            <div className="flex gap-2">
              {([['todo', '待办'], ['doing', '进行中'], ['someday', '将来']] as const).map(([v, label]) => (
                <button key={v} type="button" onClick={() => pickStatus(v)}
                  className={cn('flex-1 text-xs px-3 py-1.5 rounded-full border transition-colors', status === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label}</button>
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              {status === 'todo' ? '待办：有日期，到期当天进「今日待办」，过期进「已逾期」。'
                : status === 'doing' ? '进行中：正在推进的事，不管日期天天留在「今日待办」顶部，直到你改回待办或完成。'
                : '将来：还没排期的事，不设日期、不提醒，收在「今日待办」页尾的收件箱里，想清楚哪天做再排。'}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due-date">{status === 'someday' ? '日期（将来任务不排期）' : '日期（可清空；焦点任务仅在所选日期显示）'}</Label>
            <Input id="task-due-date" type="date" value={dueDate} disabled={status === 'someday'} onChange={e => setDueDate(e.target.value)} />
          </div>
          {/* 重复：v1.31 起对所有状态可见并保留 —— 旧版切到「将来」会静默写 repeat: null 且切回来不恢复（数据丢失） */}
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
                    className={cn('size-7 text-xs rounded-full border transition-colors', repeatWeekdays.includes(d) ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label}</button>
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
                      className={cn('flex-1 text-xs px-2 py-1 rounded-md border transition-colors', repeatAnchor === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label}</button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due-time">提醒时间（可选，到点通知）</Label>
            <Input id="task-due-time" type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-tags">标签（可选，逗号分隔）</Label>
            <Input id="task-tags" value={tagsText} onChange={e => setTagsText(e.target.value)} placeholder="如：工作，学习" />
          </div>
          <Button className="w-full" onClick={submit} disabled={!title.trim() || (editing ? update.isPending : create.isPending)}>{editing ? '保存' : '添加'}</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
