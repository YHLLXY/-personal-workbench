import { describe, it, expect } from 'vitest'
import { breakForFocusIndex, formatSeconds, planFor, getPomodoroSettings, savePomodoroSettings } from '../src/lib/pomodoro'

const SETTINGS_KEY = 'wb:pomodoro-settings'

describe('pomodoro', () => {
  it('每 4 个专注后长休息', () => { expect(breakForFocusIndex(1)).toBe('short'); expect(breakForFocusIndex(4)).toBe('long'); expect(breakForFocusIndex(8)).toBe('long') })
  it('格式化为 MM:SS', () => { expect(formatSeconds(1500)).toBe('25:00'); expect(formatSeconds(65)).toBe('01:05') })
  it('计划包含正确分钟数', () => { expect(planFor(4)).toEqual({ focusMinutes: 25, breakMinutes: 15, focusIndex: 4, totalFocus: 4 }) })
})

describe('pomodoro settings', () => {
  it('无存储时默认专注 25 分钟', () => {
    localStorage.removeItem(SETTINGS_KEY)
    expect(getPomodoroSettings()).toEqual({ focusMinutes: 25 })
  })
  it('读写专注时长设置', () => {
    savePomodoroSettings({ focusMinutes: 40 })
    expect(getPomodoroSettings()).toEqual({ focusMinutes: 40 })
    savePomodoroSettings({ focusMinutes: 25 })
    expect(getPomodoroSettings()).toEqual({ focusMinutes: 25 })
    localStorage.removeItem(SETTINGS_KEY)
  })
  it('损坏/非数字数据回退默认 25 分钟', () => {
    localStorage.setItem(SETTINGS_KEY, 'not-json')
    expect(getPomodoroSettings()).toEqual({ focusMinutes: 25 })
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ focusMinutes: '四十' }))
    expect(getPomodoroSettings()).toEqual({ focusMinutes: 25 })
    localStorage.removeItem(SETTINGS_KEY)
  })
  it('越界值钳制到 [15, 60]', () => {
    savePomodoroSettings({ focusMinutes: 5 })
    expect(getPomodoroSettings()).toEqual({ focusMinutes: 15 })
    savePomodoroSettings({ focusMinutes: 120 })
    expect(getPomodoroSettings()).toEqual({ focusMinutes: 60 })
    localStorage.removeItem(SETTINGS_KEY)
  })
})

describe('planFor 可选参数', () => {
  it('不传专注时长仍默认 25 分钟（向后兼容）', () => {
    expect(planFor(2)).toEqual({ focusMinutes: 25, breakMinutes: 5, focusIndex: 2, totalFocus: 2 })
  })
  it('传入自定义专注时长后按新值计算', () => {
    expect(planFor(2, 40)).toEqual({ focusMinutes: 40, breakMinutes: 5, focusIndex: 2, totalFocus: 2 })
    expect(planFor(4, 30)).toEqual({ focusMinutes: 30, breakMinutes: 15, focusIndex: 4, totalFocus: 4 })
  })
})
