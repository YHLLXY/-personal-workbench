import { describe, it, expect } from 'vitest'
import {
  timeSegmentOf, makeStars, makeParticles, seededRandom, SEGMENT_BOUNDS,
  WEATHER_MOOD, heroOpacity, EXTRA_ELEMENTS, BOOT_WEATHERS, SEGMENT_PALETTES,
} from '../src/app/boot-scene'
import { WEATHER_KINDS } from '../src/lib/weather'

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

describe('天气氛围参数（WEATHER_MOOD）', () => {
  it('12 类天气全部有氛围参数（防漏映射）', () => {
    for (const k of WEATHER_KINDS) {
      expect(WEATHER_MOOD[k]).toBeDefined()
      expect(WEATHER_MOOD[k].dim).toBeGreaterThanOrEqual(0)
      expect(WEATHER_MOOD[k].dim).toBeLessThanOrEqual(1)
    }
  })
  it('晴不压暗；雷暴压得最狠；雨重于阴天', () => {
    expect(WEATHER_MOOD.clear.dim).toBe(0)
    expect(WEATHER_MOOD['mostly-clear'].dim).toBe(0)
    expect(WEATHER_MOOD.thunder.dim).toBeGreaterThan(WEATHER_MOOD.rain.dim)
    expect(WEATHER_MOOD.rain.dim).toBeGreaterThan(WEATHER_MOOD.overcast.dim)
  })
  it('恶劣天气天体减淡但不完全消失（下限 0.35）', () => {
    expect(heroOpacity('clear')).toBe(1)
    expect(heroOpacity('thunder')).toBeCloseTo(1 - WEATHER_MOOD.thunder.dim * 1.05)
    for (const k of WEATHER_KINDS) expect(heroOpacity(k)).toBeGreaterThanOrEqual(0.35)
  })
  it('四时段调色板齐全（天空 4 色标 + 两层山）', () => {
    for (const seg of ['dawn', 'noon', 'dusk', 'night'] as const) {
      expect(SEGMENT_PALETTES[seg].sky).toHaveLength(4)
      expect(SEGMENT_PALETTES[seg].hillFar).toBeTruthy()
      expect(SEGMENT_PALETTES[seg].hillNear).toBeTruthy()
    }
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
  it('雨雪增强粒子带 sway 档位（0–2）', () => {
    const drops = makeParticles(42, 3, { sizeMin: 14, sizeMax: 24, durMin: 0.55, durMax: 1 })
    expect(drops).toHaveLength(42)
    expect(drops.every(d => d.drift >= 0 && d.drift <= 2)).toBe(true)
  })
  it('预览钩子候选表与天气全集一致', () => {
    expect(BOOT_WEATHERS).toEqual(WEATHER_KINDS)
  })
})

describe('EXTRA_ELEMENTS（伴飞云层：多元素复合场景）', () => {
  it('12 类天气都有配置且字段在界内', () => {
    for (const k of WEATHER_KINDS) {
      const extras = EXTRA_ELEMENTS[k]
      expect(Array.isArray(extras)).toBe(true)
      for (const e of extras) {
        expect(e.left).toBeGreaterThanOrEqual(-10)
        expect(e.left).toBeLessThanOrEqual(80)
        expect(e.top).toBeGreaterThanOrEqual(0)
        expect(e.top).toBeLessThanOrEqual(70)
        expect(e.size).toBeGreaterThan(8)
        expect(e.size).toBeLessThanOrEqual(36)
        expect(e.opacity).toBeGreaterThan(0)
        expect(e.opacity).toBeLessThanOrEqual(0.8)
        expect(e.drift).toBeGreaterThanOrEqual(6)
      }
    }
  })
  it('阴/雨类至少两层伴飞（层次感），晴不超过一朵（不喧宾夺主）', () => {
    expect(EXTRA_ELEMENTS.overcast.length).toBeGreaterThanOrEqual(3)
    expect(EXTRA_ELEMENTS['heavy-rain'].length).toBeGreaterThanOrEqual(2)
    expect(EXTRA_ELEMENTS.clear.length).toBeLessThanOrEqual(1)
    expect(EXTRA_ELEMENTS['mostly-clear'].length).toBeLessThanOrEqual(1)
  })
})
