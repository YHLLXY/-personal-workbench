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
