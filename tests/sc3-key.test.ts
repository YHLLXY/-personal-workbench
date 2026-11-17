import { describe, it, expect } from 'vitest'
import { isSc3Key } from '../src/lib/sc3'

describe('isSc3Key（Server酱³ SendKey 形态，保存前校验）', () => {
  it('sctp<uid>t… → true（大小写不敏感，Token 本身仍原样保留）', () => {
    expect(isSc3Key('sctp123tAbCdEf')).toBe(true)
    expect(isSc3Key('SCTP456TXyZ')).toBe(true)
    expect(isSc3Key('  sctp789tQ  ')).toBe(true)
  })
  it('旧 Turbo 的 SCT… / 无关文本 / 空值 → false', () => {
    expect(isSc3Key('SCT123456Tabcdef')).toBe(false)
    expect(isSc3Key('hello')).toBe(false)
    expect(isSc3Key('')).toBe(false)
    expect(isSc3Key(null)).toBe(false)
    expect(isSc3Key(undefined)).toBe(false)
  })
})
