import { describe, it, expect } from 'vitest'
import {
  timeSegmentOf, seededRandom, SEGMENT_BOUNDS,
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
  it('恶劣天气天体减淡但保持可见（下限 0.55：主角不能被环境粒子层洗掉）', () => {
    expect(heroOpacity('clear')).toBe(1)
    // 雷暴 dim 最重 → 触底取下限，不再继续变淡
    expect(heroOpacity('thunder')).toBeCloseTo(0.55)
    expect(heroOpacity('rain')).toBeGreaterThan(heroOpacity('heavy-rain'))
    for (const k of WEATHER_KINDS) expect(heroOpacity(k)).toBeGreaterThanOrEqual(0.55)
  })
  it('四时段调色板齐全（天空 4 色标 + 两层山）', () => {
    for (const seg of ['dawn', 'noon', 'dusk', 'night'] as const) {
      expect(SEGMENT_PALETTES[seg].sky).toHaveLength(4)
      expect(SEGMENT_PALETTES[seg].hillFar).toBeTruthy()
      expect(SEGMENT_PALETTES[seg].hillNear).toBeTruthy()
    }
  })
})

// 注：粒子生成（星/雨/雪/雾）已迁至 boot-atmosphere.ts 的 Canvas 版，对应测试见 tests/boot-atmosphere.test.ts
describe('种子随机（环境粒子确定性的基础）', () => {
  it('同种子输出完全一致（StrictMode 双挂载/E2E 稳定）', () => {
    const a = seededRandom(42)
    const b = seededRandom(42)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
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
