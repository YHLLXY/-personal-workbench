import { describe, it, expect } from 'vitest'
import { timeSegmentOf, makeStars, makeParticles, seededRandom, SEGMENT_BOUNDS, WEATHER_DIM } from '../src/app/boot-scene'
import { mapWmoKind } from '../api/weather'

describe('timeSegmentOf（四时段划分）', () => {
  const at = (h: number, m = 0) => new Date(2026, 7, 30, h, m)
  it('清晨 5:00–8:59；5 点前与 19 点后是夜晚', () => {
    expect(timeSegmentOf(at(5, 0))).toBe('dawn')
    expect(timeSegmentOf(at(8, 59))).toBe('dawn')
    expect(timeSegmentOf(at(4, 59))).toBe('night')
    expect(timeSegmentOf(at(19, 0))).toBe('night')
    expect(timeSegmentOf(at(0, 0))).toBe('night')
  })
  it('正午 9:00–14:59；黄昏 15:00–18:59', () => {
    expect(timeSegmentOf(at(9, 0))).toBe('noon')
    expect(timeSegmentOf(at(14, 59))).toBe('noon')
    expect(timeSegmentOf(at(15, 0))).toBe('dusk')
    expect(timeSegmentOf(at(18, 59))).toBe('dusk')
  })
  it('边界常量与划分一致（防止改表改漏）', () => {
    expect(timeSegmentOf(at(SEGMENT_BOUNDS.noonStart))).toBe('noon')
    expect(timeSegmentOf(at(SEGMENT_BOUNDS.duskStart))).toBe('dusk')
    expect(timeSegmentOf(at(SEGMENT_BOUNDS.nightStart))).toBe('night')
  })
})

describe('mapWmoKind（WMO 天气码 → 七类动画效果）', () => {
  it('晴/少云/阴', () => {
    expect(mapWmoKind(0)).toBe('clear')
    expect(mapWmoKind(1)).toBe('partly')
    expect(mapWmoKind(2)).toBe('partly')
    expect(mapWmoKind(3)).toBe('overcast')
  })
  it('雾/雨/雪/雷暴', () => {
    expect(mapWmoKind(45)).toBe('fog')
    expect(mapWmoKind(48)).toBe('fog')
    expect(mapWmoKind(51)).toBe('rain')
    expect(mapWmoKind(65)).toBe('rain')
    expect(mapWmoKind(67)).toBe('rain')
    expect(mapWmoKind(80)).toBe('rain')
    expect(mapWmoKind(82)).toBe('rain')
    expect(mapWmoKind(71)).toBe('snow')
    expect(mapWmoKind(77)).toBe('snow')
    expect(mapWmoKind(85)).toBe('snow')
    expect(mapWmoKind(86)).toBe('snow')
    expect(mapWmoKind(95)).toBe('thunder')
    expect(mapWmoKind(99)).toBe('thunder')
  })
  it('缺失/非法/未知码一律按晴天（宁要晴天，不要报错）', () => {
    expect(mapWmoKind(null)).toBe('clear')
    expect(mapWmoKind(undefined)).toBe('clear')
    expect(mapWmoKind(Number.NaN)).toBe('clear')
    expect(mapWmoKind(-5)).toBe('clear')
    expect(mapWmoKind(68)).toBe('clear')
    expect(mapWmoKind(4.6)).toBe('clear') // 5 不在任何区间（WMO 无此码）
  })
})

describe('种子随机与粒子生成', () => {
  it('同种子输出完全一致（StrictMode 双挂载/E2E 稳定）', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
    expect(makeStars(64, 20260830)).toEqual(makeStars(64, 20260830))
  })
  it('星星数量与分布约束（top ≤ 65%）', () => {
    const stars = makeStars(64, 20260830)
    expect(stars).toHaveLength(64)
    expect(stars.every(s => s.top >= 0 && s.top <= 65)).toBe(true)
  })
  it('雨雪粒子带 sway 档位（0–2）', () => {
    const drops = makeParticles(42, 3, { sizeMin: 14, sizeMax: 24, durMin: 0.55, durMax: 1 })
    expect(drops).toHaveLength(42)
    expect(drops.every(d => d.drift >= 0 && d.drift <= 2)).toBe(true)
  })
})

describe('WEATHER_DIM（天气压暗系数）', () => {
  it('晴/少云不压暗，雷暴压得最狠，雨重于阴天', () => {
    expect(WEATHER_DIM.clear).toBe(0)
    expect(WEATHER_DIM.partly).toBe(0)
    expect(WEATHER_DIM.thunder).toBeGreaterThan(WEATHER_DIM.rain)
    expect(WEATHER_DIM.rain).toBeGreaterThan(WEATHER_DIM.overcast)
  })
})
