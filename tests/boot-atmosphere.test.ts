import { describe, it, expect } from 'vitest'
import {
  ATMO_PRESETS, CELESTIAL_BY_SEGMENT, LIGHTNING_AT, LIGHT_BY_SEGMENT, METEORS,
  makeDrops, makeFlakes, makeFog, makeStars, sceneAtmosphere, scaleCount,
  type Viewport,
} from '../src/app/boot-atmosphere'
import { WEATHER_KINDS } from '../src/lib/weather'

const VP: Viewport = { w: 1280, h: 800 } // 基准视口：ratio = 1，粒子数不缩放
const SMALL: Viewport = { w: 640, h: 400 }
const BIG: Viewport = { w: 2560, h: 1600 }

describe('光源表（统一投影方向）', () => {
  it('四时段都有光源，坐标在画面内', () => {
    for (const seg of ['dawn', 'noon', 'dusk', 'night'] as const) {
      const l = LIGHT_BY_SEGMENT[seg]
      expect(l).toBeDefined()
      expect(l.x).toBeGreaterThanOrEqual(0)
      expect(l.x).toBeLessThanOrEqual(100)
      expect(l.y).toBeGreaterThanOrEqual(0)
      expect(l.y).toBeLessThanOrEqual(100)
      expect(l.glow).toBeTruthy()
    }
  })
  it('投影始终朝下（dy > 0），昼夜水平方向相反（太阳在左 / 月亮在右）', () => {
    for (const seg of ['dawn', 'noon', 'dusk', 'night'] as const) {
      expect(LIGHT_BY_SEGMENT[seg].shadowDy).toBeGreaterThan(0)
    }
    expect(LIGHT_BY_SEGMENT.noon.shadowDx).toBeGreaterThan(0)
    expect(LIGHT_BY_SEGMENT.night.shadowDx).toBeLessThan(0)
  })
})

describe('ATMO_PRESETS（12 类天气的环境参数）', () => {
  it('12 类天气全部有配置（防漏映射）', () => {
    for (const k of WEATHER_KINDS) expect(ATMO_PRESETS[k]).toBeDefined()
  })
  it('晴无降水无雾；雷暴雨最密；雪类有雪无雨', () => {
    expect(ATMO_PRESETS.clear.rain).toBe(0)
    expect(ATMO_PRESETS.clear.snow).toBe(0)
    expect(ATMO_PRESETS['heavy-rain'].rain).toBeGreaterThan(ATMO_PRESETS.rain.rain)
    expect(ATMO_PRESETS.rain.rain).toBeGreaterThan(ATMO_PRESETS.drizzle.rain)
    expect(ATMO_PRESETS.snow.snow).toBeGreaterThan(0)
    expect(ATMO_PRESETS.snow.rain).toBe(0)
    expect(ATMO_PRESETS['heavy-snow'].snow).toBeGreaterThan(ATMO_PRESETS.snow.snow)
  })
  it('只有雷暴有闪电；雨夹雪同时有雨和雪', () => {
    for (const k of WEATHER_KINDS) {
      expect(ATMO_PRESETS[k].lightning).toBe(k === 'thunder')
    }
    expect(ATMO_PRESETS.sleet.rain).toBeGreaterThan(0)
    expect(ATMO_PRESETS.sleet.snow).toBeGreaterThan(0)
  })
  it('降水类的速度/尺寸区间合法（min < max 且为正）', () => {
    for (const k of WEATHER_KINDS) {
      const s = ATMO_PRESETS[k]
      if (s.rain > 0) {
        expect(s.rainLen[0]).toBeLessThan(s.rainLen[1])
        expect(s.rainSpeed[0]).toBeGreaterThan(0)
        expect(s.rainSpeed[0]).toBeLessThan(s.rainSpeed[1])
        expect(s.rainTilt).toBeGreaterThan(0)
        expect(s.rainTilt).toBeLessThan(45)
      }
      if (s.snow > 0) {
        expect(s.snowSize[0]).toBeLessThan(s.snowSize[1])
        expect(s.snowSpeed[0]).toBeGreaterThan(0)
        expect(s.snowSpeed[0]).toBeLessThan(s.snowSpeed[1])
      }
    }
  })
})

describe('scaleCount（按视口面积缩放密度）', () => {
  it('基准视口不缩放；0 一律返回 0', () => {
    expect(scaleCount(100, VP)).toBe(100)
    expect(scaleCount(0, VP)).toBe(0)
  })
  it('小屏按比例减负，且有下限（不低于 45%）', () => {
    expect(scaleCount(100, SMALL)).toBe(45)
  })
  it('大屏放大但有上限（不超过 135%，防粒子爆炸）', () => {
    expect(scaleCount(100, BIG)).toBe(135)
  })
})

describe('粒子生成（Canvas 版）', () => {
  it('雨滴数量按密度缩放，字段在界内且景深分层齐全', () => {
    const spec = ATMO_PRESETS['heavy-rain']
    const drops = makeDrops(spec, VP)
    expect(drops).toHaveLength(spec.rain)
    for (const d of drops) {
      expect(d.depth).toBeGreaterThanOrEqual(0)
      expect(d.depth).toBeLessThanOrEqual(1)
      expect(d.len).toBeGreaterThan(0)
      expect(d.speed).toBeGreaterThan(0)
      expect(d.alpha).toBeGreaterThan(0)
      expect(d.alpha).toBeLessThanOrEqual(1)
    }
    // 景深必须覆盖远/中/近三档，否则画不出层次
    expect(drops.some(d => d.depth < 0.34)).toBe(true)
    expect(drops.some(d => d.depth >= 0.67)).toBe(true)
  })
  it('雪花带摇摆相位与景深', () => {
    const flakes = makeFlakes(ATMO_PRESETS.snow, VP)
    expect(flakes).toHaveLength(ATMO_PRESETS.snow.snow)
    for (const f of flakes) {
      expect(f.r).toBeGreaterThan(0)
      expect(f.sway).toBeGreaterThan(0)
      expect(f.phase).toBeGreaterThanOrEqual(0)
      expect(f.phase).toBeLessThanOrEqual(Math.PI * 2)
    }
  })
  it('无降水天气不生成粒子（省算力）', () => {
    expect(makeDrops(ATMO_PRESETS.clear, VP)).toHaveLength(0)
    expect(makeFlakes(ATMO_PRESETS.clear, VP)).toHaveLength(0)
  })
  it('雾带数量与配置一致，且分布在画面中下部', () => {
    const fog = makeFog(ATMO_PRESETS.fog, VP)
    expect(fog).toHaveLength(ATMO_PRESETS.fog.fog)
    for (const b of fog) {
      expect(b.y).toBeGreaterThan(VP.h * 0.3)
      expect(b.alpha).toBeGreaterThan(0)
    }
  })
  it('星星只出现在画面上部 62% 且带闪烁周期', () => {
    const stars = makeStars(80, VP)
    expect(stars).toHaveLength(80)
    for (const s of stars) {
      expect(s.y).toBeGreaterThanOrEqual(0)
      expect(s.y).toBeLessThanOrEqual(VP.h * 0.62)
      expect(s.period).toBeGreaterThan(0)
      expect(s.alpha).toBeGreaterThan(0)
    }
  })
})

describe('sceneAtmosphere（整场组装）', () => {
  it('同参数两次生成完全一致（StrictMode 双挂载 / E2E 稳定）', () => {
    const a = sceneAtmosphere('thunder', 'night', VP)
    const b = sceneAtmosphere('thunder', 'night', VP)
    expect(a.drops).toEqual(b.drops)
    expect(a.stars).toEqual(b.stars)
  })
  it('星空与流星只在夜晚出现', () => {
    for (const k of WEATHER_KINDS) {
      expect(sceneAtmosphere(k, 'noon', VP).stars).toHaveLength(0)
      expect(sceneAtmosphere(k, 'noon', VP).meteors).toHaveLength(0)
    }
    const night = sceneAtmosphere('clear', 'night', VP)
    expect(night.stars.length).toBeGreaterThan(0)
    expect(night.meteors).toHaveLength(METEORS.length)
  })
  it('光源随时段注入，供 CSS 投影变量使用', () => {
    expect(sceneAtmosphere('rain', 'dusk', VP).light).toBe(LIGHT_BY_SEGMENT.dusk)
  })
  it('闪电时刻表在播放时长内且递增', () => {
    expect(LIGHTNING_AT.length).toBeGreaterThan(0)
    for (const at of LIGHTNING_AT) expect(at).toBeGreaterThan(0)
    expect([...LIGHTNING_AT].sort((a, b) => a - b)).toEqual(LIGHTNING_AT)
  })
})

describe('CELESTIAL_BY_SEGMENT（程序化天体，取代卡通太阳）', () => {
  const SEGS = ['dawn', 'noon', 'dusk', 'night'] as const

  it('四时段都有天体：白天是太阳，夜晚是月亮', () => {
    expect(CELESTIAL_BY_SEGMENT.dawn.kind).toBe('sun')
    expect(CELESTIAL_BY_SEGMENT.noon.kind).toBe('sun')
    expect(CELESTIAL_BY_SEGMENT.dusk.kind).toBe('sun')
    expect(CELESTIAL_BY_SEGMENT.night.kind).toBe('moon')
  })

  it('圆盘半径适中：过小失去辨识度，过大又喧宾夺主', () => {
    for (const seg of SEGS) {
      const r = CELESTIAL_BY_SEGMENT[seg].coreR
      expect(r).toBeGreaterThanOrEqual(4)
      expect(r).toBeLessThanOrEqual(10)
    }
  })

  it('辉光两层：外辉范围更大，内辉更浓；都不许糊成一片', () => {
    for (const seg of SEGS) {
      const c = CELESTIAL_BY_SEGMENT[seg]
      expect(c.glowOuter.scale).toBeGreaterThan(c.glowInner.scale)
      expect(c.glowInner.alpha).toBeGreaterThan(c.glowOuter.alpha)
      expect(c.glowInner.alpha).toBeLessThanOrEqual(0.5)
      expect(c.glowOuter.alpha).toBeLessThanOrEqual(0.3)
    }
  })

  it('月海只属于月亮，且全部落在月盘内、浓度不脏', () => {
    for (const seg of ['dawn', 'noon', 'dusk'] as const) {
      expect(CELESTIAL_BY_SEGMENT[seg].maria).toHaveLength(0)
    }
    const moon = CELESTIAL_BY_SEGMENT.night
    expect(moon.maria.length).toBeGreaterThan(0)
    for (const m of moon.maria) {
      // 偏移距离 + 半径 ≤ 1（相对圆盘半径），否则会溢出月盘
      expect(Math.hypot(m.dx, m.dy) + m.r).toBeLessThanOrEqual(1)
      expect(m.alpha).toBeGreaterThan(0)
      expect(m.alpha).toBeLessThan(0.2)
    }
  })

  it('呼吸幅度温和（≤8%），不用机械旋转抢戏', () => {
    for (const seg of SEGS) {
      expect(CELESTIAL_BY_SEGMENT[seg].breathAmount).toBeLessThanOrEqual(0.08)
      expect(CELESTIAL_BY_SEGMENT[seg].breathSec).toBeGreaterThan(0)
    }
  })

  it('天体只在晴天出现：阴雨等看不见太阳的天气不画', () => {
    const noSun: Parameters<typeof sceneAtmosphere>[0][] = [
      'partly', 'overcast', 'fog', 'drizzle', 'rain', 'heavy-rain', 'sleet', 'snow', 'heavy-snow', 'thunder',
    ]
    for (const k of noSun) expect(sceneAtmosphere(k, 'noon', VP).celestial).toBeNull()
    expect(sceneAtmosphere('clear', 'noon', VP).celestial).toBe(CELESTIAL_BY_SEGMENT.noon)
    expect(sceneAtmosphere('mostly-clear', 'night', VP).celestial).toBe(CELESTIAL_BY_SEGMENT.night)
  })
})
