import { useEffect, useState } from 'react'
import { Play, Pause, RotateCcw, Minus, Plus } from 'lucide-react'
import { formatSeconds, breakForFocusIndex, FOCUS_MIN_MINUTES, FOCUS_MAX_MINUTES, SHORT_BREAK_MIN, LONG_BREAK_MIN, getPomodoroSettings, savePomodoroSettings, type Phase, type PomodoroSettings } from '@/lib/pomodoro'
import { useCreateFocus } from './api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const STATE_KEY = 'wb:pomodoro-state'
const FOCUS_STEP = 5
/** 运行中会话超过 12 小时视为陈旧，挂载时重置 */
const STALE_MS = 12 * 60 * 60 * 1000

/** 持久化的计时状态：running 时 startedAt 为真实起点、elapsed 为暂停前累计；暂停时 startedAt=null、elapsed 冻结（保留剩余） */
interface PersistedPomodoroState {
  phase: Phase
  focusIndex: number
  totalSeconds: number
  elapsed: number
  startedAt: number | null
  running: boolean
}

function loadState(): PersistedPomodoroState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(STATE_KEY) ?? 'null') as Partial<PersistedPomodoroState> | null
    if (!raw || typeof raw !== 'object') return null
    if (raw.phase !== 'focus' && raw.phase !== 'short' && raw.phase !== 'long') return null
    if (typeof raw.focusIndex !== 'number' || typeof raw.totalSeconds !== 'number' || typeof raw.elapsed !== 'number') return null
    if (typeof raw.running !== 'boolean') return null
    if (raw.running && typeof raw.startedAt !== 'number') return null
    return { phase: raw.phase, focusIndex: raw.focusIndex, totalSeconds: raw.totalSeconds, elapsed: raw.elapsed, startedAt: raw.running ? (raw.startedAt as number) : null, running: raw.running }
  } catch {
    return null
  }
}

function saveState(s: PersistedPomodoroState): void {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(s)) } catch { /* 隐私模式等忽略 */ }
}

function freshState(focusMinutes: number): PersistedPomodoroState {
  return { phase: 'focus', focusIndex: 1, totalSeconds: focusMinutes * 60, elapsed: 0, startedAt: null, running: false }
}

export default function Pomodoro() {
  const [settings, setSettings] = useState<PomodoroSettings>(() => getPomodoroSettings())
  const create = useCreateFocus()
  const mutate = create.mutate   // stable across renders

  // 挂载时恢复持久化状态：损坏数据或陈旧会话（running 超 12h）→ 全新状态
  const [state, setState] = useState<PersistedPomodoroState>(() => {
    const saved = loadState()
    const focusMinutes = getPomodoroSettings().focusMinutes
    if (!saved) return freshState(focusMinutes)
    if (saved.running && saved.startedAt != null && Date.now() - saved.startedAt > STALE_MS) return freshState(focusMinutes)
    return saved
  })
  const { phase, focusIndex, totalSeconds, startedAt, running } = state

  // running 时每秒重渲染；剩余秒数由 startedAt 实时推导，切后台/休眠不漂移
  const [, setTick] = useState(0)
  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setTick(t => t + 1), 1000)
    return () => clearInterval(id)
  }, [running])

  // 实际已用秒数：暂停时 = elapsed（冻结）；运行时 = 暂停前累计 + 自 startedAt 起的真实经过时间
  const liveElapsed = running && startedAt != null ? state.elapsed + Math.floor(Math.max(Date.now() - startedAt, 0) / 1000) : state.elapsed
  const remaining = Math.max(totalSeconds - liveElapsed, 0)

  // 状态转换即持久化（运行中的每秒 tick 不触发，因为 state 对象不变）
  useEffect(() => { saveState(state) }, [state])

  // 阶段完成：切换阶段并（专注结束时）按实际时长记录一条专注
  useEffect(() => {
    if (remaining > 0) return
    if (phase === 'focus') {
      mutate({ minutes: Math.round(liveElapsed / 60) })
      const nextPhase = breakForFocusIndex(focusIndex)
      setState(s => ({ phase: nextPhase, focusIndex: s.focusIndex + 1, totalSeconds: (nextPhase === 'long' ? LONG_BREAK_MIN : SHORT_BREAK_MIN) * 60, elapsed: 0, startedAt: null, running: false }))
    } else {
      setState(s => ({ phase: 'focus', focusIndex: s.focusIndex, totalSeconds: settings.focusMinutes * 60, elapsed: 0, startedAt: null, running: false }))
    }
  }, [remaining, phase, focusIndex, liveElapsed, settings.focusMinutes, mutate])

  const toggleRunning = () => {
    if (running) {
      // 暂停：把自 startedAt 起的用时并入 elapsed，剩余值冻结
      setState(s => ({ ...s, running: false, elapsed: s.elapsed + Math.floor(Math.max(Date.now() - (s.startedAt ?? Date.now()), 0) / 1000), startedAt: null }))
    } else {
      setState(s => ({ ...s, running: true, startedAt: Date.now() }))
    }
  }

  const adjustFocusMinutes = (delta: number) => {
    const next = Math.min(Math.max(settings.focusMinutes + delta, FOCUS_MIN_MINUTES), FOCUS_MAX_MINUTES)
    if (next === settings.focusMinutes) return
    savePomodoroSettings({ focusMinutes: next })
    setSettings({ focusMinutes: next })
    if (phase === 'focus') {
      // 当前专注阶段同步伸缩：总长与已用同增同减，剩余不变
      const deltaSec = (next - settings.focusMinutes) * 60
      setState(s => ({ ...s, totalSeconds: next * 60, elapsed: s.elapsed + deltaSec }))
    }
  }

  const switchPhase = (p: Phase) => {
    setState(s => ({ ...s, phase: p, totalSeconds: p === 'focus' ? settings.focusMinutes * 60 : (p === 'long' ? LONG_BREAK_MIN : SHORT_BREAK_MIN) * 60, elapsed: 0, startedAt: null, running: false }))
  }

  const reset = () => {
    setState(s => ({ ...s, phase: 'focus', totalSeconds: settings.focusMinutes * 60, elapsed: 0, startedAt: null, running: false }))
  }

  const pct = totalSeconds > 0 ? remaining / totalSeconds : 0

  return (
    <div className="mx-auto max-w-md flex flex-col items-center gap-6 pt-6">
      <h1 className="text-xl font-bold">番茄钟</h1>
      <div className="flex gap-1 bg-muted rounded-full p-1">
        {(['focus', 'short', 'long'] as const).map(p => (
          <button key={p} onClick={() => switchPhase(p)}
            className={cn('px-4 py-1.5 text-xs rounded-full', phase === p ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground')}>
            {p === 'focus' ? '专注' : p === 'short' ? '短休息' : '长休息'}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-3">
        <span className="text-xs text-muted-foreground">专注时长</span>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" aria-label="减少专注时长" disabled={settings.focusMinutes <= FOCUS_MIN_MINUTES} onClick={() => adjustFocusMinutes(-FOCUS_STEP)}><Minus className="size-3.5" /></Button>
          <span className="w-14 text-center text-sm font-medium tabular-nums">{settings.focusMinutes} 分钟</span>
          <Button size="sm" variant="outline" aria-label="增加专注时长" disabled={settings.focusMinutes >= FOCUS_MAX_MINUTES} onClick={() => adjustFocusMinutes(FOCUS_STEP)}><Plus className="size-3.5" /></Button>
        </div>
      </div>
      <div className="relative size-56">
        <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(var(--primary) ${pct * 360}deg, var(--muted) 0deg)` }} />
        <div className="absolute inset-3 rounded-full bg-card flex flex-col items-center justify-center">
          <div className="text-5xl font-extrabold font-numeric tabular-nums">{formatSeconds(remaining)}</div>
          <div className="text-xs text-muted-foreground mt-2">第 {focusIndex} 个专注</div>
        </div>
      </div>
      <div className="flex gap-3">
        <Button size="lg" onClick={toggleRunning} className="min-w-28">{running ? <Pause className="size-4 mr-1.5" /> : <Play className="size-4 mr-1.5" />}{running ? '暂停' : '开始'}</Button>
        <Button size="lg" variant="outline" onClick={reset}><RotateCcw className="size-4 mr-1.5" />重置</Button>
      </div>
      <p className="text-xs text-muted-foreground">完成一个专注自动记录 · 每 4 个专注一次长休息</p>
    </div>
  )
}
