import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useReviews, useSaveReview } from './api'
import { useTasks, useTaskMutations } from '../overview/api'
import { useFocusSessions } from '../study/api'
import { useHabitLogs, useHealthLogs } from '../health/api'
import { useExams } from '../study/api'
import { buildDailySummary } from '../../lib/review-summary'
import { todayStr, type Review } from '../../lib/db/types'
import { streakFromLogDates } from '@/lib/heatmap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookOpen, CalendarClock, ChevronDown, CheckCircle2, ExternalLink, FileText, Flame, Heart, HeartHandshake, Lightbulb, ListTodo, Scale, Timer, TrendingUp, Trophy, type LucideIcon } from 'lucide-react'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { parsePlan, buildTrend, buildWeeklySummary, existingTitles, readSectionOpen, saveSectionOpen, tomorrowStr } from './review-utils'

const MOODS = ['很差', '较差', '一般', '不错', '很棒']

export default function Review() {
  const { data: reviews } = useReviews()
  const save = useSaveReview()
  const tasksMut = useTaskMutations()
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

  // v1.34 明日待办改成两段式：先给可编辑预览（每条一个勾选 + 可改文字），确认后才落库；
  // 落库后**就地列出生成结果** —— 旧版只弹一句 toast，而条目日期是明天、今日待办里根本看不到，
  // 于是「生成明日待办」看起来像没生效（图五）。
  const [draft, setDraft] = useState<Array<{ text: string; on: boolean }> | null>(null)
  const [result, setResult] = useState<{ items: string[]; skipped: number; due: string } | null>(null)

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
    setDraft(null) // 换日期/换复盘时预览与结果卡片不跟随（它们只属于当前这一天的计划）
    setResult(null)
  }, [review, activeDate])

  // v1.35：统计跟随正在看的日期（D-16）。原实现固定用 today，切到历史日期时上面的数字不动，
  // 用户会以为"那天什么都没做"——而这正是复盘最需要看清的一天。
  const s = buildDailySummary(activeDate, { tasks: tasks ?? [], focusSessions: sessions ?? [], habitLogs: logs ?? [], healthLogs: health ?? [], exams: exams ?? [] })
  const history = [...(reviews ?? [])].sort((a, b) => b.reviewDate.localeCompare(a.reviewDate))
  const isToday = activeDate === today
  const streak = streakFromLogDates((reviews ?? []).map(r => r.reviewDate)) // 连续复盘天数（复用打卡连击算法）
  const trend = buildTrend(reviews ?? [])
  const week = buildWeeklySummary(today, { tasks: tasks ?? [], focusSessions: sessions ?? [], habitLogs: logs ?? [], reviews: reviews ?? [] })

  function doSave() {
    save.mutate({ reviewDate: activeDate, mood, score, summary, planTomorrow: plan, achievements, reflection, gratitude, learnings }, {
      onSuccess: () => toast.success(isToday ? '今日复盘已保存' : `${activeDate} 的复盘已保存`),
    })
  }

  // 明日计划 → 待办：两段式。① 先展开可编辑预览（默认全选，可改文字/取消勾选）；
  // ② 确认后逐条创建（dueDate=明天），并**就地列出结果** + 「去待办查看」。
  // 去重只针对「同一天已存在」的任务（existingTitles）：批内重复保留（一天里两次「背单词」是合法用法），
  // 旧版那个「会话内只生成一次」的 Set 也一并不需要了 —— 重复生成会被判成「已存在」并明说跳过了几条。
  const planItems = parsePlan(plan)

  function startPreview() {
    if (planItems.length === 0) { toast.error('明日计划为空或没有有效条目'); return }
    setResult(null)
    setDraft(planItems.map(text => ({ text, on: true })))
  }

  async function confirmPreview() {
    const items = (draft ?? []).filter(d => d.on).map(d => d.text.trim()).filter(t => t.length > 1)
    if (items.length === 0) { toast.error('请至少勾选一条'); return }
    const due = tomorrowStr()
    const exists = existingTitles(tasks ?? [], due)
    const toCreate = items.filter(t => !exists.has(t))
    const skipped = items.length - toCreate.length
    try {
      await Promise.all(toCreate.map(title => tasksMut.create.mutateAsync({ title, dueDate: due })))
      setDraft(null)
      setResult({ items: toCreate, skipped, due })
      toast.success(toCreate.length > 0 ? `已生成 ${toCreate.length} 条明日待办` : '这些条目明天已经存在')
    } catch {
      toast.error('生成明日待办失败，请重试') // mutation 自身有逐条错误 toast，这里兜底汇总
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4 lg:max-w-5xl">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">今日复盘</h1>
          <p className="text-xs text-muted-foreground mt-0.5">数据自动汇总 · 睡前 5 分钟</p>
        </div>
        {streak > 0 && (
          <span className="flex shrink-0 items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-medium text-primary"><Flame className="size-3.5" strokeWidth={1.7} />连续 {streak} 天</span>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,320px)] lg:items-start">
        {/* 右栏（桌面 ≥lg）：汇总数据。移动端仍排在表单之前 —— 保持「先看数据再写」的顺序 */}
        <div className="space-y-4 lg:col-start-2 lg:row-start-1">
          {/* 自动汇总 */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {/* 「累计 N」歧义（D-26）：value 是当日完成，sub 是全历史完成，两者不该混在同一张卡里说不清 */}
            <Stat icon={CheckCircle2} label="完成任务" value={`${s.tasksDone}`} sub={`历史 ${s.tasksTotal}`} />
            <Stat icon={Timer} label="专注时长" value={`${Math.floor(s.focusMinutes / 60)}h ${s.focusMinutes % 60}m`} sub={isToday ? '今天' : activeDate} />
            <Stat icon={Flame} label="打卡" value={`${s.habitChecks}`} sub="次" />
            <Stat icon={Scale} label="体重" value={s.weightLog ? `${s.weightLog.value}kg` : '—'} sub={s.weightLog?.logDate === today ? '今天' : '未记录'} />
          </div>

          {/* 本周回顾：7 天聚合（待办/专注/打卡/复盘 + 心情评分均值） */}
          <div className="bg-card border border-border rounded-2xl p-4">
            <div className="text-sm font-semibold mb-2 flex items-center gap-2">
              <CalendarClock className="size-4 text-primary" strokeWidth={1.7} />本周回顾
              <span className="text-xs font-normal text-muted-foreground">近 7 天</span>
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
              {([['完成任务', `${week.tasksDone}`, '项'], ['专注', `${week.focusMinutes}`, '分钟'], ['打卡', `${week.habitChecks}`, '次'], ['复盘', `${week.reviewsWritten}`, '篇'], ['平均心情', week.avgMood != null ? `${week.avgMood}` : '—', '/5'], ['平均评分', week.avgScore != null ? `${week.avgScore}` : '—', '/10']] as [string, string, string][]).map(([label, v, unit]) => (
                <div key={label} className="rounded-xl bg-muted/60 px-2 py-2">
                  <div className="text-base font-bold font-numeric">{v}<span className="text-[10px] font-normal text-muted-foreground ml-0.5">{unit}</span></div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
                </div>
              ))}
            </div>
          </div>

          {/* 近 14 次复盘趋势迷你图（数据 <2 条不渲染） */}
          {trend.dates.length >= 2 && (
            <div className="bg-card border border-border rounded-2xl p-4">
              <div className="text-sm font-semibold mb-2 flex items-center gap-2">
                <TrendingUp className="size-4 text-primary" strokeWidth={1.7} />近 14 次趋势
                <span className="text-xs font-normal text-muted-foreground">心情（强调色）/ 评分（主色）</span>
              </div>
              <TrendChart trend={trend} />
            </div>
          )}
        </div>

        {/* 左栏：心情/评分 + 分区表单（历史复盘也在 Tabs 里，桌面与移动端共用同一套交互） */}
        <div className="space-y-4 lg:col-start-1 lg:row-start-1">
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
                <FormSection key={`${activeDate}:achievements`} icon={Trophy} title="今日成就" sectionId="achievements" date={activeDate} defaultOpen={false} hasContent={achievements.trim().length > 0}>
                  <Textarea value={achievements} onChange={e => setAchievements(e.target.value)} rows={2} placeholder="今天完成了什么？值得记录的小胜利…" />
                </FormSection>
                <FormSection key={`${activeDate}:reflection`} icon={Scale} title="今日反思" sectionId="reflection" date={activeDate} defaultOpen={false} hasContent={reflection.trim().length > 0}>
                  <Textarea value={reflection} onChange={e => setReflection(e.target.value)} rows={2} placeholder="哪里做得不好？原因是什么？下次怎么改进…" />
                </FormSection>
                <FormSection key={`${activeDate}:gratitude`} icon={HeartHandshake} title="今日感恩" sectionId="gratitude" date={activeDate} defaultOpen={false} hasContent={gratitude.trim().length > 0}>
                  <Textarea value={gratitude} onChange={e => setGratitude(e.target.value)} rows={2} placeholder="今天想感谢的人或事…" />
                </FormSection>
                <FormSection key={`${activeDate}:learnings`} icon={Lightbulb} title="今日收获" sectionId="learnings" date={activeDate} defaultOpen={false} hasContent={learnings.trim().length > 0}>
                  <Textarea value={learnings} onChange={e => setLearnings(e.target.value)} rows={2} placeholder="学到了什么？新认知、新技能、新方法…" />
                </FormSection>
                <FormSection key={`${activeDate}:summary`} icon={FileText} title="今日总结" sectionId="summary" date={activeDate} defaultOpen hasContent={summary.trim().length > 0}>
                  <Textarea value={summary} onChange={e => setSummary(e.target.value)} rows={4} placeholder="今天做了什么？有什么收获和遗憾？" />
                </FormSection>
                <FormSection key={`${activeDate}:plan`} icon={CalendarClock} title="明日计划" sectionId="plan" date={activeDate} defaultOpen hasContent={plan.trim().length > 0}>
                  <Textarea value={plan} onChange={e => { setPlan(e.target.value); setResult(null) }} rows={3} placeholder="明天最重要的 1-3 件事…" />
                  {/* 两段式：先预览（可改可勾选），确认后才落库；预览为空时按钮禁用 */}
                  {draft ? (
                    <div className="space-y-2 rounded-xl border border-primary/25 bg-primary/5 p-2.5">
                      <p className="text-[11px] text-muted-foreground">确认生成到「明天 · {tomorrowStr()}」的条目（可改文字、可取消勾选）：</p>
                      {draft.map((d, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input type="checkbox" checked={d.on} aria-label={`选择「${d.text}」`}
                            onChange={e => setDraft(draft.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))}
                            className="size-3.5 shrink-0 accent-primary" />
                          <Input value={d.text} className="h-8 text-xs"
                            onChange={e => setDraft(draft.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))} />
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button size="sm" className="h-8 flex-1 text-xs" onClick={confirmPreview} disabled={tasksMut.create.isPending}>
                          {tasksMut.create.isPending ? '生成中…' : `确认生成 ${draft.filter(d => d.on).length} 条`}
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={() => setDraft(null)}>取消</Button>
                      </div>
                    </div>
                  ) : (
                    <Button size="sm" variant="outline" className="w-full text-xs" onClick={startPreview} disabled={tasksMut.create.isPending || planItems.length === 0}>
                      <ListTodo className="size-3.5" strokeWidth={1.7} />生成明日待办{planItems.length > 0 ? `（${planItems.length} 条）` : ''}
                    </Button>
                  )}
                  {result && (
                    <div role="status" className="space-y-1 rounded-xl border border-primary/25 bg-primary/5 px-3 py-2">
                      <div className="flex items-center gap-1.5 text-xs font-medium text-primary">
                        <CheckCircle2 className="size-3.5 shrink-0" />
                        <span>已生成 {result.items.length} 条明日待办（{result.due}）{result.skipped > 0 ? ` · 跳过 ${result.skipped} 条（已存在）` : ''}</span>
                      </div>
                      {result.items.length > 0 && (
                        <ul className="space-y-0.5 pl-5 text-[11px] text-foreground/80">
                          {result.items.map(t => <li key={t} className="list-disc">{t}</li>)}
                        </ul>
                      )}
                      <div className="flex flex-wrap items-center gap-2 pl-5">
                        <Link to="/tasks" className="inline-flex items-center gap-0.5 text-[11px] text-primary hover:underline">去待办查看<ExternalLink className="size-3" /></Link>
                        <span className="text-[10px] text-muted-foreground">明天到期，明日起出现在「今日待办」</span>
                      </div>
                    </div>
                  )}
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
        </div>
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

/** 折叠分区：默认展开 = 显式 defaultOpen，或「该字段已经有内容」——编辑旧复盘时不用逐个点开找自己写过什么。
 *  用户手动开合后按「日期 + 分区」记 localStorage，刷新与切日期都不串味（v1.34）。 */
function FormSection({ icon: Icon, title, sectionId, date, defaultOpen = false, hasContent = false, children }: { icon: LucideIcon; title: string; sectionId: string; date: string; defaultOpen?: boolean; hasContent?: boolean; children: ReactNode }) {
  const [manual, setManual] = useState<boolean | null>(() => readSectionOpen(date, sectionId))
  const open = manual ?? (defaultOpen || hasContent)
  const toggle = () => { const next = !open; setManual(next); saveSectionOpen(date, sectionId, next) }
  return (
    <div className="space-y-2">
      <button type="button" onClick={toggle} aria-expanded={open} className="flex w-full items-center gap-1.5 text-sm font-semibold">
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

/** 14 条趋势迷你图：手绘 SVG 双系列折线（写法参考 weekly-trend-chart 但从简无交互），值已归一到 0-1 */
function TrendChart({ trend }: { trend: ReturnType<typeof buildTrend> }) {
  const W = 560, H = 64, PAD = 4 // 视口坐标，随 h-16 w-full 拉伸铺满
  const step = (W - PAD * 2) / (trend.dates.length - 1)
  const pts = (ys: number[]) => ys.map((y, i) => `${PAD + i * step},${H - PAD - y * (H - PAD * 2)}`).join(' ')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="block h-16 w-full" preserveAspectRatio="none" role="img" aria-label={`最近 ${trend.dates.length} 次复盘的心情与评分趋势`}>
      {/* mood 系列（强调色） */}
      <polyline fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={pts(trend.moodY)} />
      {/* score 系列（主色） */}
      <polyline fill="none" stroke="var(--primary)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={pts(trend.scoreY)} />
    </svg>
  )
}
