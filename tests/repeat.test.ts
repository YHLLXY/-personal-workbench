import { describe, it, expect } from 'vitest'
import { nextOccurrence, prevOccurrence, repeatLabel, addDays, nextMonday } from '../src/lib/repeat'
import type { TaskRepeat } from '../src/lib/db/types'

// 2026-08-31=周一、09-02=周三、09-04=周五、09-07=周一、09-14=周一
// anchor='complete' 的时间戳统一用 T10:00:00Z（UTC-10…UTC+12 内本地日期都落同一天，测试与时区解耦）

const daily = (interval = 1): TaskRepeat => ({ freq: 'daily', interval, anchor: 'due' })
const weekly = (interval = 1, weekdays?: number[]): TaskRepeat => ({ freq: 'weekly', interval, weekdays, anchor: 'due' })
const monthly = (interval = 1): TaskRepeat => ({ freq: 'monthly', interval, anchor: 'due' })

describe('repeat：addDays / nextMonday', () => {
  it('addDays 跨月跨年安全', () => {
    expect(addDays('2026-08-31', 1)).toBe('2026-09-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-09-01', -1)).toBe('2026-08-31')
  })
  it('nextMonday 严格晚于当天（今天周一则返回下周一）', () => {
    expect(nextMonday('2026-09-04')).toBe('2026-09-07') // 周五 → 下周一
    expect(nextMonday('2026-09-07')).toBe('2026-09-14') // 周一 → 下下周一
  })
})

describe('repeat：nextOccurrence', () => {
  it('daily 按计划日推进', () => {
    expect(nextOccurrence('2026-09-01', daily(), null, '2026-09-02')).toBe('2026-09-02')
  })
  it('daily 跳过不补：错过几天后推进到首个 ≥ today 的槽位', () => {
    expect(nextOccurrence('2026-09-01', daily(), null, '2026-09-05')).toBe('2026-09-05')
  })
  it('daily interval=3', () => {
    expect(nextOccurrence('2026-09-01', daily(3), null, '2026-09-03')).toBe('2026-09-04')
    expect(nextOccurrence('2026-09-01', daily(3), null, '2026-09-10')).toBe('2026-09-10')
  })
  it('weekly 多选（周一/周三）：取 base 之后最近选中星期，跳过不补', () => {
    expect(nextOccurrence('2026-08-31', weekly(1, [1, 3]), null, '2026-09-02')).toBe('2026-09-02')
    expect(nextOccurrence('2026-08-31', weekly(1, [1, 3]), null, '2026-09-04')).toBe('2026-09-07')
  })
  it('weekly interval=2 整周步进且保持星期', () => {
    expect(nextOccurrence('2026-08-31', weekly(2, [1]), null, '2026-09-01')).toBe('2026-09-14')
    expect(nextOccurrence('2026-08-28', weekly(2, [5]), null, '2026-09-01')).toBe('2026-09-11') // 周五
    expect(nextOccurrence('2026-08-31', weekly(2, [1]), null, '2026-09-16')).toBe('2026-09-28')
  })
  it('weekly weekdays 缺省 = 沿用 base 的星期', () => {
    expect(nextOccurrence('2026-08-31', weekly(), null, '2026-09-01')).toBe('2026-09-07')
  })
  it('monthly 月末钳制（1/31 → 2/28）', () => {
    expect(nextOccurrence('2026-01-31', monthly(), null, '2026-02-01')).toBe('2026-02-28')
    expect(nextOccurrence('2026-01-15', monthly(), null, '2026-02-01')).toBe('2026-02-15')
  })
  it("anchor='complete'：按完成日推进，提前完成不早于计划日", () => {
    // 完成于 09-02（晚于计划日 09-01）→ base=09-02 → 明天 09-03
    expect(nextOccurrence('2026-09-01', { ...daily(), anchor: 'complete' }, '2026-09-02T10:00:00Z', '2026-09-02')).toBe('2026-09-03')
    // 完成于 08-31（早于计划日 09-01）→ base=09-01 → 09-02
    expect(nextOccurrence('2026-09-01', { ...daily(), anchor: 'complete' }, '2026-08-31T10:00:00Z', '2026-09-01')).toBe('2026-09-02')
    // 多选星期：计划周一 08-31，周二完成 → base 周二 → 下一个选中星期周三 09-02
    expect(nextOccurrence('2026-08-31', { ...weekly(1, [1, 3]), anchor: 'complete' }, '2026-09-01T10:00:00Z', '2026-09-02')).toBe('2026-09-02')
  })
})

describe('repeat：prevOccurrence（撤销用回退一格）', () => {
  it('daily 对称回退', () => {
    expect(prevOccurrence('2026-09-04', daily(3))).toBe('2026-09-01')
  })
  it('weekly 多选回退到上一个选中星期', () => {
    expect(prevOccurrence('2026-09-02', weekly(1, [1, 3]))).toBe('2026-08-31')
    expect(prevOccurrence('2026-09-07', weekly(1, [1, 3]))).toBe('2026-09-02')
  })
  it('weekly interval=2 回退两周', () => {
    expect(prevOccurrence('2026-09-14', weekly(2, [1]))).toBe('2026-08-31')
  })
  it('monthly 回退（钳制按回退后月份）', () => {
    expect(prevOccurrence('2026-02-28', monthly())).toBe('2026-01-28')
  })
})

describe('repeat：repeatLabel', () => {
  it('daily 文案', () => {
    expect(repeatLabel(daily())).toBe('每天')
    expect(repeatLabel(daily(3))).toBe('每 3 天')
  })
  it('weekly 文案：工作日 / 多选 / 单选 / 缺省', () => {
    expect(repeatLabel(weekly(1, [1, 2, 3, 4, 5]))).toBe('每个工作日')
    expect(repeatLabel(weekly(1, [1, 3]))).toBe('每周·一/三')
    expect(repeatLabel(weekly(2, [3]))).toBe('每 2 周·周三')
    expect(repeatLabel(weekly(), '2026-08-31')).toBe('每周·一')
  })
  it('monthly 文案带 dueDate 的日', () => {
    expect(repeatLabel(monthly(), '2026-09-15')).toBe('每月 15 日')
    expect(repeatLabel(monthly())).toBe('每月')
    expect(repeatLabel(monthly(2), '2026-09-15')).toBe('每 2 月 15 日')
  })
})
