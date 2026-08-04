import { describe, it, expect } from 'vitest'
import { breakForFocusIndex, formatSeconds, planFor } from '../src/lib/pomodoro'

describe('pomodoro', () => {
  it('每 4 个专注后长休息', () => { expect(breakForFocusIndex(1)).toBe('short'); expect(breakForFocusIndex(4)).toBe('long'); expect(breakForFocusIndex(8)).toBe('long') })
  it('格式化为 MM:SS', () => { expect(formatSeconds(1500)).toBe('25:00'); expect(formatSeconds(65)).toBe('01:05') })
  it('计划包含正确分钟数', () => { expect(planFor(4)).toEqual({ focusMinutes: 25, breakMinutes: 15, focusIndex: 4, totalFocus: 4 }) })
})
