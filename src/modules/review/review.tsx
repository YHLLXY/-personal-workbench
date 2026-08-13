import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useReviews, useSaveReview } from './api'
import { useTasks } from '../overview/api'
import { useFocusSessions } from '../study/api'
import { useHabitLogs, useHealthLogs } from '../health/api'
import { useExams } from '../study/api'
import { buildDailySummary } from '../../lib/review-summary'
import { todayStr } from '../../lib/db/types'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookOpen, CalendarClock, ChevronDown, CheckCircle2, FileText, Flame, Heart, HeartHandshake, Lightbulb, Scale, Timer, Trophy, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const MOODS = ['很差', '较差', '一般', '不错', '很棒']

export default function Review() {
  const { data: reviews } = useReviews()
  const save = useSaveReview()
  const today = todayStr()
  const { data: tasks } = useTasks()
  const { data: sessions } = useFocusSessions()
  const { data: logs } = useHabitLogs()
  const { data: health } = useHealthLogs()
  const { data: exams } = useExams()

  const [tab, setTab] = useState('today')
  const [activeDate, setActiveDate] = useState(today)
  const [mood, setMood] = useState(3)
  const [score, setScore] = useState<number | null>(null)
  const [summary, setSummary] = useState('')
  const [plan, setPlan] = useState('')
  const [achievements, setAchievements] = useState('')
  const [reflection, setReflection] = useState('')
  const [gratitude, setGratitude] = useState('')
  const [learnings, setLearnings] = useState('')

  const review = reviews?.find(r => r.reviewDate === activeDate) ?? null
  // 只在「该日期对应的复盘首次就绪」时回填表单，避免查询刷新（refetch/invalidate）覆盖用户正在输入的字段
  const lastSynced = useRef('')
  useEffect(() => {
    const key = `${activeDate}:${review?.id ?? 'none'}`
    if (lastSynced.current === key) return
    lastSynced.current = key
    setMood(review?.mood ?? 3)
    setScore(review?.score ?? null)
    setSummary(review?.summary ?? '')
    setPlan(review?.planTomorrow ?? '')
    setAchievements(review?.achievements ?? '')
    setReflection(review?.reflection ?? '')
    setGratitude(review?.gratitude ?? '')
    setLearnings(review?.learnings ?? '')
  }, [review, activeDate])

  const s = buildDailySummary(today, { tasks: tasks ?? [], focusSessions: sessions ?? [], habitLogs: logs ?? [], healthLogs: health ?? [], exams: exams ?? [] })
  const history = [...(reviews ?? [])].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))
  const isToday = activeDate === today

  function doSave() {
    save.mutate({ reviewDate: activeDate, mood, score, summary, planTomorrow: plan, achievements, reflection, gratitude, learnings }, {
      onSuccess: () => toast.success(isToday ? '今日复盘已保存' : `${activeDate} 的复盘已保存`),
    })
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

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="max-w-full overflow-x-auto">
          <TabsTrigger value="today">今日复盘</TabsTrigger>
          <TabsTrigger value="history">历史复盘</TabsTrigger>
        </TabsList>

        <TabsContent value="today" className="space-y-4 pt-4">
          {!isToday && (
            <div className="flex items-center justify-between gap-2 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2">
              <span className="text-xs text-primary">正在编辑 {activeDate} 的复盘</span>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setActiveDate(today)}>回到今天</Button>
            </div>
          )}

          {/* 心情 + 评分 */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <div>
              <div className="text-sm font-semibold mb-3 flex items-center gap-2"><Heart className="size-4 text-primary" strokeWidth={1.7} />今天心情如何？</div>
              <div className="flex gap-2">
                {MOODS.map((m, i) => (
                  <button key={m} onClick={() => setMood(i + 1)} className={cn('flex-1 py-2 rounded-xl border text-xs', mood === i + 1 ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground')}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="text-sm font-semibold mb-2">今日评分 <span className="text-xs font-normal text-muted-foreground">（1-10，可留空，再点取消）</span></div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                  <button key={n} onClick={() => setScore(score === n ? null : n)}
                    className={cn('size-9 rounded-lg border text-sm font-numeric transition-colors', score === n ? 'border-primary bg-primary/10 text-primary font-bold' : 'border-border text-muted-foreground hover:border-primary/40')}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 分区表单（可折叠） */}
          <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
            <FormSection icon={Trophy} title="今日成就" defaultOpen={false}>
              <Textarea value={achievements} onChange={e => setAchievements(e.target.value)} rows={2} placeholder="今天完成了什么？值得记录的小胜利…" />
            </FormSection>
            <FormSection icon={Scale} title="今日反思" defaultOpen={false}>
              <Textarea value={reflection} onChange={e => setReflection(e.target.value)} rows={2} placeholder="哪里做得不好？原因是什么？下次怎么改进…" />
            </FormSection>
            <FormSection icon={HeartHandshake} title="今日感恩" defaultOpen={false}>
              <Textarea value={gratitude} onChange={e => setGratitude(e.target.value)} rows={2} placeholder="今天想感谢的人或事…" />
            </FormSection>
            <FormSection icon={Lightbulb} title="今日收获" defaultOpen={false}>
              <Textarea value={learnings} onChange={e => setLearnings(e.target.value)} rows={2} placeholder="学到了什么？新认知、新技能、新方法…" />
            </FormSection>
            <FormSection icon={FileText} title="今日总结">
              <Textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4} placeholder="今天做了什么？有什么收获和遗憾？" />
            </FormSection>
            <FormSection icon={CalendarClock} title="明日计划">
              <Textarea value={plan} onChange={e => setPlan(e.target.value)} rows={3} placeholder="明天最重要的 1-3 件事…" />
            </FormSection>
            <Button className="w-full" onClick={doSave} disabled={save.isPending}>{save.isPending ? '保存中…' : '保存复盘'}</Button>
          </div>
        </TabsContent>

        <TabsContent value="history" className="pt-4">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">还没有历史复盘，坚持每天睡前 5 分钟</p>
          ) : (
            <div className="space-y-2">
              {history.map(r => (
                <button key={r.id} onClick={() => { setActiveDate(r.reviewDate); setTab('today') }}
                  className="w-full text-left bg-card border border-border rounded-xl px-4 py-3 transition-colors hover:border-primary/40">
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="font-semibold font-numeric">{r.reviewDate}</span>
                    <span className="flex items-center gap-2 text-xs text-muted-foreground shrink-0">
                      {r.mood >= 1 && r.mood <= 5 ? MOODS[r.mood - 1] : '—'}
                      {r.score != null && <span className="font-numeric text-primary">{r.score}/10</span>}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{r.summary || r.achievements || r.reflection || '（无内容）'}</p>
                </button>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

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

function FormSection({ icon: Icon, title, defaultOpen = true, children }: { icon: LucideIcon; title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="space-y-2">
      <button type="button" onClick={() => setOpen(o => !o)} className="flex w-full items-center gap-1.5 text-sm font-semibold">
        <Icon className="size-4 text-primary shrink-0" strokeWidth={1.7} />
        {title}
        <ChevronDown className={cn('ml-auto size-4 text-muted-foreground transition-transform', open && 'rotate-180')} />
      </button>
      {open && children}
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
