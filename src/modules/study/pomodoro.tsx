import { useEffect, useRef, useState } from 'react'
import { Play, Pause, RotateCcw } from 'lucide-react'
import { formatSeconds, breakForFocusIndex, type Phase } from '@/lib/pomodoro'
import { useCreateFocus } from './api'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export default function Pomodoro() {
  const [phase, setPhase] = useState<Phase>('focus')
  const [remaining, setRemaining] = useState(25 * 60)
  const [running, setRunning] = useState(false)
  const [focusIndex, setFocusIndex] = useState(1)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const create = useCreateFocus()

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current) }, [])

  // 阶段完成：切换阶段并（专注结束时）记录一条专注
  useEffect(() => {
    if (remaining > 0) return
    if (phase === 'focus') {
      create.mutate({ minutes: 25 })
      const nextPhase = breakForFocusIndex(focusIndex)
      setPhase(nextPhase)
      setRemaining(nextPhase === 'long' ? 15 * 60 : 5 * 60)
      setFocusIndex(i => i + 1)
    } else {
      setPhase('focus')
      setRemaining(25 * 60)
    }
    setRunning(false)
  }, [remaining, phase, focusIndex, create])

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => setRemaining(prev => prev - 1), 1000)
    return () => clearInterval(id)
  }, [running])

  const pct = phase === 'focus' ? remaining / (25 * 60) : remaining / (phase === 'long' ? 15 * 60 : 5 * 60)

  return (
    <div className="mx-auto max-w-md flex flex-col items-center gap-6 pt-6">
      <h1 className="text-xl font-bold">番茄钟</h1>
      <div className="flex gap-1 bg-muted rounded-full p-1">
        {(['focus', 'short', 'long'] as const).map(p => (
          <button key={p} onClick={() => { setPhase(p); setRemaining(p === 'focus' ? 25 * 60 : p === 'long' ? 15 * 60 : 5 * 60); setRunning(false) }}
            className={cn('px-4 py-1.5 text-xs rounded-full', phase === p ? 'bg-card shadow-sm font-medium' : 'text-muted-foreground')}>
            {p === 'focus' ? '专注' : p === 'short' ? '短休息' : '长休息'}
          </button>
        ))}
      </div>
      <div className="relative size-56">
        <div className="absolute inset-0 rounded-full" style={{ background: `conic-gradient(var(--primary) ${pct * 360}deg, var(--muted) 0deg)` }} />
        <div className="absolute inset-3 rounded-full bg-card flex flex-col items-center justify-center">
          <div className="text-5xl font-extrabold font-numeric tabular-nums">{formatSeconds(remaining)}</div>
          <div className="text-xs text-muted-foreground mt-2">第 {focusIndex} 个专注</div>
        </div>
      </div>
      <div className="flex gap-3">
        <Button size="lg" onClick={() => setRunning(r => !r)} className="min-w-28">{running ? <Pause className="size-4 mr-1.5" /> : <Play className="size-4 mr-1.5" />}{running ? '暂停' : '开始'}</Button>
        <Button size="lg" variant="outline" onClick={() => { setRunning(false); setRemaining(25 * 60); setPhase('focus') }}><RotateCcw className="size-4 mr-1.5" />重置</Button>
      </div>
      <p className="text-xs text-muted-foreground">完成一个专注自动记录 · 每 4 个专注一次长休息</p>
    </div>
  )
}
