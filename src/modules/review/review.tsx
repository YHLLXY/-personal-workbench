import { useEffect, useState } from 'react'
import { useTodayReview, useSaveReview } from './api'
import { useTasks } from '../overview/api'
import { useFocusSessions } from '../study/api'
import { useHabitLogs, useHealthLogs } from '../health/api'
import { useExams } from '../study/api'
import { buildDailySummary } from '../../lib/review-summary'
import { todayStr } from '../../lib/db/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CheckCircle2, Timer, Flame, Scale, BookOpen, Heart } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const MOODS = ['很差', '较差', '一般', '不错', '很棒']

export default function Review() {
  const { data: review } = useTodayReview()
  const save = useSaveReview()
  const today = todayStr()
  const { data: tasks } = useTasks()
  const { data: sessions } = useFocusSessions()
  const { data: logs } = useHabitLogs()
  const { data: health } = useHealthLogs()
  const { data: exams } = useExams()
  const [mood, setMood] = useState(3)
  const [summary, setSummary] = useState('')
  const [plan, setPlan] = useState('')

  // 异步加载的今日复盘就绪后同步到表单（useState 初始值只取首渲染）
  useEffect(() => {
    if (review) { setMood(review.mood); setSummary(review.summary); setPlan(review.planTomorrow) }
  }, [review])

  const s = buildDailySummary(today, { tasks: tasks ?? [], focusSessions: sessions ?? [], habitLogs: logs ?? [], healthLogs: health ?? [], exams: exams ?? [] })

  function doSave() {
    save.mutate({ mood, summary, planTomorrow: plan }, { onSuccess: () => toast.success('今日复盘已保存') })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">今日复盘</h1>
        <p className="text-xs text-muted-foreground mt-0.5">数据自动汇总 · 睡前 5 分钟</p>
      </div>

      {/* 自动汇总 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Stat icon={CheckCircle2} label="完成任务" value={`${s.tasksDone}`} sub={`累计 ${s.tasksTotal}`} />
        <Stat icon={Timer} label="专注时长" value={`${Math.floor(s.focusMinutes / 60)}h ${s.focusMinutes % 60}m`} sub="今天" />
        <Stat icon={Flame} label="打卡" value={`${s.habitChecks}`} sub="次" />
        <Stat icon={Scale} label="体重" value={s.weightLog ? `${s.weightLog.value}kg` : '—'} sub={s.weightLog?.logDate === today ? '今天' : '未记录'} />
      </div>

      {/* 心情 */}
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="text-sm font-semibold mb-3 flex items-center gap-2"><Heart className="size-4 text-primary" strokeWidth={1.7} />今天心情如何？</div>
        <div className="flex gap-2">
          {MOODS.map((m, i) => (
            <button key={m} onClick={() => setMood(i + 1)} className={cn('flex-1 py-2 rounded-xl border text-xs', mood === i + 1 ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{m}</button>
          ))}
        </div>
      </div>

      <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
        <div className="space-y-1.5">
          <div className="text-sm font-semibold">今日总结</div>
          <Textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4} placeholder="今天做了什么？有什么收获和遗憾？" />
        </div>
        <div className="space-y-1.5">
          <div className="text-sm font-semibold">明日计划</div>
          <Textarea value={plan} onChange={e => setPlan(e.target.value)} rows={3} placeholder="明天最重要的 1-3 件事…" />
        </div>
        <Button className="w-full" onClick={doSave} disabled={save.isPending}>{save.isPending ? '保存中…' : '保存复盘'}</Button>
      </div>

      {s.upcomingExams.length > 0 && (
        <div className="bg-card border border-border rounded-2xl p-4 text-sm flex items-center gap-2">
          <BookOpen className="size-4 text-primary shrink-0" strokeWidth={1.7} />
          <span className="text-muted-foreground text-xs">最近考试：</span>
          {s.upcomingExams.map(e => <span key={e.id} className="text-xs">{e.title}（{e.examDate}）</span>)}
        </div>
      )}
    </div>
  )
}

function Stat({ icon: Icon, label, value, sub }: { icon: typeof CheckCircle2; label: string; value: string; sub: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-3">
      <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground"><Icon className="size-3" strokeWidth={1.7} />{label}</div>
      <div className="text-lg font-extrabold font-numeric mt-1">{value}</div>
      <div className="text-[10px] text-muted-foreground">{sub}</div>
    </div>
  )
}
