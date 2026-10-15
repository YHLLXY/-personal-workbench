export type Phase = 'focus' | 'short' | 'long'
export const FOCUS_MIN = 25
export const SHORT_BREAK_MIN = 5
export const LONG_BREAK_MIN = 15
/** 专注时长步进器允许范围（5 分钟步进） */
export const FOCUS_MIN_MINUTES = 15
export const FOCUS_MAX_MINUTES = 60

export interface CyclePlan { focusMinutes: number; breakMinutes: number; focusIndex: number; totalFocus: number }
export interface PomodoroSettings { focusMinutes: number }

const SETTINGS_KEY = 'wb:pomodoro-settings'

/** 读取专注时长设置，非法/越界值回退到默认并钳制到 [15, 60] */
export function getPomodoroSettings(): PomodoroSettings {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}') as Partial<PomodoroSettings>
    if (typeof raw.focusMinutes === 'number' && Number.isFinite(raw.focusMinutes)) {
      return { focusMinutes: Math.min(Math.max(Math.round(raw.focusMinutes), FOCUS_MIN_MINUTES), FOCUS_MAX_MINUTES) }
    }
    return { focusMinutes: FOCUS_MIN }
  } catch {
    return { focusMinutes: FOCUS_MIN }
  }
}

export function savePomodoroSettings(s: PomodoroSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify({ focusMinutes: s.focusMinutes })) } catch { /* 隐私模式等忽略 */ }
}

/** 第 focusIndex 个（1 起）专注后的休息类型：每 4 个一次长休息 */
export function breakForFocusIndex(focusIndex: number): Phase {
  return focusIndex % 4 === 0 ? 'long' : 'short'
}
export function planFor(focusIndex: number, focusMinutes: number = FOCUS_MIN): CyclePlan {
  return { focusMinutes, breakMinutes: breakForFocusIndex(focusIndex) === 'long' ? LONG_BREAK_MIN : SHORT_BREAK_MIN, focusIndex, totalFocus: focusIndex }
}
export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60); const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/* ---------- 计时状态持久化 ---------- */

export const POMODORO_STATE_KEY = 'wb:pomodoro-state'

/** 持久化的计时状态：running 时 startedAt 为真实起点、elapsed 为暂停前累计；暂停时 startedAt=null、elapsed 冻结（保留剩余）。
 *  note = 本次专注主题，**必须与计时一起持久化**：旧实现把它放在组件内 state，切页 / 刷新 / 切后台重建组件后
 *  计时器活下来而主题丢了，专注在后台跑完就会写入一条没有主题的记录（v1.26 修复）。 */
export interface PersistedPomodoroState {
  phase: Phase
  focusIndex: number
  totalSeconds: number
  elapsed: number
  startedAt: number | null
  running: boolean
  note: string
}

/** 读取持久化状态；损坏或字段类型不符返回 null。
 *  旧数据缺 note 时补空串——升级不该让正在跑的计时作废。 */
export function loadPomodoroState(): PersistedPomodoroState | null {
  try {
    const raw = JSON.parse(localStorage.getItem(POMODORO_STATE_KEY) ?? 'null') as Partial<PersistedPomodoroState> | null
    if (!raw || typeof raw !== 'object') return null
    if (raw.phase !== 'focus' && raw.phase !== 'short' && raw.phase !== 'long') return null
    if (typeof raw.focusIndex !== 'number' || typeof raw.totalSeconds !== 'number' || typeof raw.elapsed !== 'number') return null
    if (typeof raw.running !== 'boolean') return null
    if (raw.running && typeof raw.startedAt !== 'number') return null
    return {
      phase: raw.phase, focusIndex: raw.focusIndex, totalSeconds: raw.totalSeconds, elapsed: raw.elapsed,
      startedAt: raw.running ? (raw.startedAt as number) : null, running: raw.running,
      note: typeof raw.note === 'string' ? raw.note : '',
    }
  } catch {
    return null
  }
}

export function savePomodoroState(s: PersistedPomodoroState): void {
  try { localStorage.setItem(POMODORO_STATE_KEY, JSON.stringify(s)) } catch { /* 隐私模式等忽略 */ }
}

export function freshPomodoroState(focusMinutes: number): PersistedPomodoroState {
  return { phase: 'focus', focusIndex: 1, totalSeconds: focusMinutes * 60, elapsed: 0, startedAt: null, running: false, note: '' }
}
