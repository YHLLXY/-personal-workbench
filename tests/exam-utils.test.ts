import { describe, it, expect } from 'vitest'
import { daysUntil } from '../src/modules/study/api'

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
})
