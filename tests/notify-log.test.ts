import { describe, it, expect, beforeEach } from 'vitest'
import { claimNotifications, reminderKey, resetNotificationLedger } from '../src/modules/reminders/notify-log'

const DAY = 24 * 60 * 60 * 1000

describe('claimNotifications（前台通知本机去重账本）', () => {
  beforeEach(() => localStorage.clear())

  it('第一次认领拿到全部键，同一批再认领一次为空（重挂载 / StrictMode 双执行不再弹）', () => {
    const keys = ['r1@2026-08-01T01:30:00.000Z']
    expect(claimNotifications(keys)).toEqual(keys)
    expect(claimNotifications(keys)).toEqual([])
  })

  it('只认领没弹过的：新旧混合时只返回新的那几个', () => {
    claimNotifications(['a@t1'])
    expect(claimNotifications(['a@t1', 'b@t2'])).toEqual(['b@t2'])
  })

  it('同一个提醒改期后算一条新提醒（键带计划时刻）', () => {
    claimNotifications([reminderKey('r1', '2026-08-01T01:30:00.000Z')])
    expect(claimNotifications([reminderKey('r1', '2026-08-01T10:00:00.000Z')])).toHaveLength(1)
  })

  it('账本 7 天后自动过期，不会永久吞掉提醒', () => {
    const t0 = 1_700_000_000_000
    expect(claimNotifications(['r1@t'], t0)).toEqual(['r1@t'])
    expect(claimNotifications(['r1@t'], t0 + 6 * DAY)).toEqual([])
    expect(claimNotifications(['r1@t'], t0 + 8 * DAY)).toEqual(['r1@t'])
  })

  it('账本损坏（非 JSON / 非对象）时当空账本处理，不抛错', () => {
    localStorage.setItem('wb-notified', 'not json')
    expect(claimNotifications(['r1@t'])).toEqual(['r1@t'])
    localStorage.setItem('wb-notified', '{"a":1}')
    expect(claimNotifications(['b@t'])).toEqual(['b@t'])
  })

  it('resetNotificationLedger 清空账本', () => {
    claimNotifications(['r1@t'])
    resetNotificationLedger()
    expect(claimNotifications(['r1@t'])).toEqual(['r1@t'])
  })
})
