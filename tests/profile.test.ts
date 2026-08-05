import { describe, it, expect, beforeEach } from 'vitest'
import { AVATAR_COLORS, getLocalProfile, setLocalProfile } from '../src/lib/profile'

describe('profile (local)', () => {
  beforeEach(() => localStorage.clear())

  it('默认昵称空、头像色为色板第一个', () => {
    expect(getLocalProfile()).toEqual({ nickname: '', avatarColor: AVATAR_COLORS[0] })
  })

  it('setLocalProfile 后读回一致', () => {
    setLocalProfile({ nickname: '翰林', avatarColor: AVATAR_COLORS[3] })
    expect(getLocalProfile()).toEqual({ nickname: '翰林', avatarColor: AVATAR_COLORS[3] })
  })

  it('损坏数据降级为默认值', () => {
    localStorage.setItem('wb:profile', '{oops')
    expect(getLocalProfile()).toEqual({ nickname: '', avatarColor: AVATAR_COLORS[0] })
  })

  it('非法头像色降级为色板第一个', () => {
    localStorage.setItem('wb:profile', JSON.stringify({ nickname: 'x', avatarColor: '#123456' }))
    expect(getLocalProfile()).toEqual({ nickname: 'x', avatarColor: AVATAR_COLORS[0] })
  })
})
