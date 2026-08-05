import { useState, useEffect } from 'react'
import { LayoutDashboard, Zap, ShieldCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { HOTKEYS, formatShortcut } from '@/lib/hotkeys'
import { cn } from '@/lib/utils'
import { useUiStore } from './store'

const ONBOARD_KEY = 'wb-onboarded'

interface Step { icon: typeof LayoutDashboard; title: string; desc: (shortcut: string) => string }
const STEPS: Step[] = [
  { icon: LayoutDashboard, title: '欢迎使用工作台', desc: () => '总览、待办、专注、打卡、复盘，一站式安放你的日常。' },
  { icon: Zap, title: '快速输入', desc: s => `按 ${s} 打开命令面板；速记停笔自动保存。` },
  { icon: ShieldCheck, title: '数据安全', desc: () => '「我的 → 数据管理」可导出备份；配置后支持云端同步。' },
]

export function OnboardingOverlay() {
  const [visible, setVisible] = useState(() => localStorage.getItem(ONBOARD_KEY) !== '1')
  const [step, setStep] = useState(0)
  const setOnboardingActive = useUiStore(s => s.setOnboardingActive)
  useEffect(() => {
    if (!visible) return
    setOnboardingActive(true)
    return () => setOnboardingActive(false)
  }, [visible, setOnboardingActive])
  if (!visible) return null
  const paletteShortcut = formatShortcut(HOTKEYS.find(h => h.id === 'palette')!)
  const last = step === STEPS.length - 1
  const finish = () => { localStorage.setItem(ONBOARD_KEY, '1'); setVisible(false) }
  const s = STEPS[step]
  const desc = s.desc(paletteShortcut)
  const Icon = s.icon
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center px-4" role="dialog" aria-modal="true" aria-label="首次引导">
      <div className="relative w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl">
        <button onClick={finish} aria-label="跳过引导"
          className="absolute top-3 left-4 text-xs text-muted-foreground hover:text-foreground">跳过</button>
        <div className="flex flex-col items-center pt-6 text-center">
          <div className="flex size-14 items-center justify-center rounded-2xl bg-primary/12 text-primary mb-4">
            <Icon className="size-7" strokeWidth={1.7} />
          </div>
          <h2 className="text-lg font-bold">{s.title}</h2>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
          <div className="mt-4 flex gap-1.5">
            {STEPS.map((_, i) => (
              <span key={i} className={cn('size-1.5 rounded-full', i === step ? 'bg-primary' : 'bg-muted')} />
            ))}
          </div>
          <div className="mt-6 flex w-full items-center justify-end gap-2">
            {step > 0 && <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>上一步</Button>}
            <Button size="sm" onClick={last ? finish : () => setStep(step + 1)}>{last ? '开始使用' : '下一步'}</Button>
          </div>
        </div>
      </div>
    </div>
  )
}
