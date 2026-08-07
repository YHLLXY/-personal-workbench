import { describe, it, expect } from 'vitest'
import { countUnread, kindLabel, reminderText, type ReminderLike } from '../src/modules/reminders/format'

const r = (over: Partial<ReminderLike>): ReminderLike => ({
  id: 'r1', refType: 'task', refId: 't1', kind: 'due', scheduledAt: '2026-08-08T01:30:00.000Z', sentAt: null, dismissedAt: null, createdAt: '2026-08-08T00:00:00.000Z', ...over,
})

describe('reminders/format', () => {
  it('countUnread：未忽略且已到期才计数；已忽略/未到期不计', () => {
    const now = Date.parse('2026-08-08T04:00:00.000Z')
    expect(countUnread([
      r({ id: 'a', scheduledAt: '2026-08-08T01:30:00.000Z' }),
      r({ id: 'b', scheduledAt: '2026-08-08T01:30:00.000Z', dismissedAt: '2026-08-08T02:00:00.000Z' }),
      r({ id: 'c', scheduledAt: '2026-08-09T01:30:00.000Z' }),
    ], now)).toBe(1)
  })
  it('kindLabel 中文标签', () => {
    expect(kindLabel('due')).toBe('任务到期')
    expect(kindLabel('exam-3d')).toBe('考前 3 天')
    expect(kindLabel('exam-1d')).toBe('考前 1 天')
    expect(kindLabel('exam-1h')).toBe('考前 1 小时')
  })
  it('reminderText 四种文案（前端版）', () => {
    expect(reminderText('due', '交报告', '2026-08-08', '09:30')).toContain('交报告')
    expect(reminderText('exam-3d', '四级', '2026-08-10', null)).toContain('3 天')
    expect(reminderText('exam-1d', '四级', '2026-08-10', null)).toContain('明天')
    expect(reminderText('exam-1h', '四级', '2026-08-10', '09:00')).toContain('1 小时')
  })
})
