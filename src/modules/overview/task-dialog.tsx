import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Star } from 'lucide-react'
import { useTaskMutations } from './api'
import { toast } from 'sonner'
import { todayStr } from '@/lib/db/types'
import { cn } from '@/lib/utils'
import type { Task, TaskRepeat } from '@/lib/db/types'

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
  const [status, setStatus] = useState<'todo' | 'someday'>('todo') // 状态 pills：待办 / 将来
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium')
  const [focus, setFocus] = useState(false)
  const [dueDate, setDueDate] = useState(todayStr())
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
      setStatus(editing?.status === 'someday' ? 'someday' : 'todo') // 仅暴露 todo/someday 两态，done/doing 回落为 todo
      setPriority(editing?.priority ?? 'medium')
      setFocus(editing?.focus ?? false)
      setDueDate(editing?.dueDate ?? todayStr())
      setDueTime(editing?.dueTime ?? '')
      setTagsText(editing?.tags?.join('，') ?? '')
      // 重复值反解为预设；不匹配任何快捷项（interval≠1 / anchor=complete）落 custom 并带出原值
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
    const payload = {
      title: title.trim(),
      status, // someday 时截止日期可留空（dueDate 已是空串 → null，不强制）
      priority,
      focus,
      focusDate: focus ? todayStr() : null,
      dueDate: dueDate || null,
      dueTime: dueTime || null,
      tags,
      repeat: status === 'someday' ? null : buildRepeat(), // 将来任务不重复；显式 null = 清除
    }
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
          {/* 状态 pills（样式参考 health RecordsPanel 类型 pills）：someday 即收件箱，可无日期 */}
          <div className="flex gap-2">
            {([['todo', '待办'], ['someday', '将来']] as const).map(([v, label]) => (
              <button key={v} type="button" onClick={() => setStatus(v)}
                className={cn('flex-1 text-xs px-3 py-1.5 rounded-full border transition-colors', status === v ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{label}</button>
            ))}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="task-due-date">{status === 'someday' ? '日期（将来任务可留空）' : '日期（可清空；焦点任务仅在所选日期显示）'}</Label>
            <Input id="task-due-date" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
          </div>
          {/* 重复：将来任务不重复（隐藏）；显式 repeat: null 清除 */}
          {status !== 'someday' && (
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
          )}
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
