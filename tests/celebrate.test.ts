import { describe, it, expect, vi, beforeEach } from 'vitest'
import { celebrate, prefersReducedMotion, streakMilestone } from '../src/modules/growth/celebrate'

const confettiMock = vi.fn()
vi.mock('canvas-confetti', () => ({ default: (...args: unknown[]) => confettiMock(...args) }))

function stubMatchMedia(reduced: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: reduced && query.includes('reduce'), addEventListener: () => {}, removeEventListener: () => {} }),
  })
}

describe('streakMilestone', () => {
  it('命中 7/30/100 档，其余返回 null', () => {
    expect(streakMilestone(7)).toBe(7)
    expect(streakMilestone(30)).toBe(30)
    expect(streakMilestone(100)).toBe(100)
    expect(streakMilestone(200)).toBe(100)
    expect(streakMilestone(3)).toBeNull()
    expect(streakMilestone(0)).toBeNull()
  })
})

describe('celebrate', () => {
  beforeEach(() => {
    confettiMock.mockClear()
    stubMatchMedia(false)
    // jsdom 无 vibrate：补一个可断言的 stub
    Object.defineProperty(navigator, 'vibrate', { writable: true, value: vi.fn() })
  })

  it('single 档：1 次喷发 + 轻震动', async () => {
    await celebrate(null, 'single')
    expect(confettiMock).toHaveBeenCalledTimes(1)
    expect(navigator.vibrate).toHaveBeenCalledWith(15)
  })

  it('grand 档：3 次喷发（中央+两翼）+ 强震动', async () => {
    await celebrate(null, 'grand')
    expect(confettiMock).toHaveBeenCalledTimes(3)
    expect(navigator.vibrate).toHaveBeenCalledWith([30, 50, 30])
  })

  it('prefers-reduced-motion：跳过纸屑，保留震动', async () => {
    stubMatchMedia(true)
    await celebrate(null, 'single')
    expect(confettiMock).not.toHaveBeenCalled()
    expect(prefersReducedMotion()).toBe(true)
    expect(navigator.vibrate).toHaveBeenCalled()
  })

  it('按钮位置作为喷发原点', async () => {
    const el = document.createElement('button')
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ left: 0, top: 0, right: 40, bottom: 40, width: 40, height: 40, x: 0, y: 0, toJSON: () => ({}) } as DOMRect)
    Object.defineProperty(window, 'innerWidth', { writable: true, value: 800 })
    Object.defineProperty(window, 'innerHeight', { writable: true, value: 600 })
    await celebrate(el, 'single')
    expect(confettiMock).toHaveBeenCalledWith(expect.objectContaining({ origin: { x: 0.025, y: 1 / 30 } }))
  })
})
