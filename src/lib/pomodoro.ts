export type Phase = 'focus' | 'short' | 'long'
export const FOCUS_MIN = 25
export const SHORT_BREAK_MIN = 5
export const LONG_BREAK_MIN = 15

export interface CyclePlan { focusMinutes: number; breakMinutes: number; focusIndex: number; totalFocus: number }

/** 第 focusIndex 个（1 起）专注后的休息类型：每 4 个一次长休息 */
export function breakForFocusIndex(focusIndex: number): Phase {
  return focusIndex % 4 === 0 ? 'long' : 'short'
}
export function planFor(focusIndex: number): CyclePlan {
  return { focusMinutes: FOCUS_MIN, breakMinutes: breakForFocusIndex(focusIndex) === 'long' ? LONG_BREAK_MIN : SHORT_BREAK_MIN, focusIndex, totalFocus: focusIndex }
}
export function formatSeconds(total: number): string {
  const m = Math.floor(total / 60); const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}
