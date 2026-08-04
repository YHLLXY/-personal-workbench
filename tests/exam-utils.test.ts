import { describe, it, expect } from 'vitest'
import { daysUntil } from '../src/modules/study/api'
import { localDateOfISO } from '../src/lib/db/types'

describe('daysUntil', () => {
  it('未来日期为正数', () => {
    const d = new Date(); d.setDate(d.getDate() + 10)
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(daysUntil(s)).toBe(10)
  })
  it('今天为 0', () => {
    const d = new Date(); const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(daysUntil(s)).toBe(0)
  })
  it('过去日期为负数', () => {
    const d = new Date(); d.setDate(d.getDate() - 3)
    const s = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    expect(daysUntil(s)).toBe(-3)
  })
})

describe('localDateOfISO', () => {
  it('localDateOfISO：UTC ISO 转本地日期（修复 slice(0,10) 时区错位）', () => {
    const d = new Date(2026, 7, 4, 0, 0, 0) // 本地 2026-08-04 00:00
    expect(localDateOfISO(d.toISOString())).toBe('2026-08-04')
  })
})
