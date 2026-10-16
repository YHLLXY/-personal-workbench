import { describe, it, expect } from 'vitest'
import * as SunCalc from 'suncalc'
import { CHONGQING, moonIllumination, moonPhaseName, moonProgress, moonTimes } from '../src/lib/moon'

/**
 * 月亮模块的验证策略（RESEARCH_月出月落.md §4）：**零依赖手写，但不由自己说了算**。
 * ① oracle 差分：suncalc 2.x（完整 ELP + 章动 + ΔT）只作为 devDependency 当裁判；
 * ② 独立锚点：日食/月食按定义就是新月/满月，与任何实现无关；
 * ③ 性质：相位周期连续、照度值域、极区不返回垃圾时间。
 *
 * 实测精度（2023-2026 × 1200 天 × 7 个纬度，8876 个升落时刻）：
 *   重庆 最大 0.73 分 / 均值 0.18 分 · 赤道 0.67 / 0.17 · 开普敦 0.77 / 0.18 · 南半球 45° 0.93 / 0.19
 *   漠河 53°N 最大 1.10 分 · **北极圈内（≥64°N）擦边日会与 oracle 差到小时级**——
 *   那里月亮可能连续 23 小时不落，高度曲线近乎相切，两种扫描法对「哪一次算月出」本就无共识。
 *   本应用只渲染重庆（29.563N），故按纬度分档断言；高纬度只保证「不返回垃圾时间」。
 */

const TZ_CN = 480 // Asia/Shanghai，分钟（东八区）
const DAY = 86400000

// 中低纬（|lat| ≤ 34°）实测零「有无不一致」样本，可用于严格比对
const SITES = [
  { name: '重庆', lat: 29.563, lon: 106.5516 },
  { name: '赤道', lat: 0, lon: 0 },
  { name: '开普敦', lat: -33.92, lon: 18.42 },
]

describe('月相：oracle 差分（suncalc 当裁判）', () => {
  it('2026 全年每 3 天：相位差 < 0.005、照度差 < 0.01', () => {
    let maxPhase = 0
    let maxFraction = 0
    for (let day = 0; day < 366; day += 3) {
      const date = new Date(Date.UTC(2026, 0, 1, 12) + day * DAY)
      const mine = moonIllumination(date)
      const ref = SunCalc.getMoonIllumination(date)
      maxFraction = Math.max(maxFraction, Math.abs(mine.fraction - ref.fraction))
      const raw = Math.abs(mine.phase - ref.phase)
      maxPhase = Math.max(maxPhase, Math.min(raw, 1 - raw)) // 相位在 0/1 交界处环绕
      expect(mine.waxing).toBe(ref.waxing)
    }
    expect(maxPhase).toBeLessThan(0.005)
    expect(maxFraction).toBeLessThan(0.01)
  })
})

describe('月出月落：oracle 差分 + 独立锚点', () => {
  it('中低纬 3 站 × 全年 24 天：有无与 oracle 一致，时刻差 < 2 分钟', () => {
    let maxDiffMin = 0
    let samples = 0
    for (const site of SITES) {
      for (let i = 0; i < 24; i++) {
        const date = new Date(Date.UTC(2026, 0, 3 + i * 15, 4))
        const mine = moonTimes(date, site.lat, site.lon, TZ_CN)
        const ref = SunCalc.getMoonTimes(date, site.lat, site.lon, TZ_CN)
        expect(mine.alwaysUp || mine.alwaysDown, `${site.name} ${i} 不应是极区`).toBe(false)
        expect(Boolean(mine.rise), `${site.name} ${i} 月出有无应与 oracle 一致`).toBe(Boolean(ref.rise))
        expect(Boolean(mine.set), `${site.name} ${i} 月落有无应与 oracle 一致`).toBe(Boolean(ref.set))
        if (mine.rise && ref.rise) { maxDiffMin = Math.max(maxDiffMin, Math.abs(mine.rise.getTime() - ref.rise.getTime()) / 60000); samples++ }
        if (mine.set && ref.set) { maxDiffMin = Math.max(maxDiffMin, Math.abs(mine.set.getTime() - ref.set.getTime()) / 60000); samples++ }
      }
    }
    expect(samples).toBeGreaterThanOrEqual(SITES.length * 24)
    expect(maxDiffMin).toBeLessThan(2)
  })

  it('重庆（本应用唯一渲染地点）全年每天：时刻差 < 1 分钟', () => {
    let maxDiffMin = 0
    const offEdgeMismatch: string[] = []
    let edgeDays = 0
    for (let day = 0; day < 365; day++) {
      const date = new Date(Date.UTC(2026, 0, 1, 4) + day * DAY)
      const winStart = Math.floor((date.getTime() + TZ_CN * 60000) / DAY) * DAY - TZ_CN * 60000
      // 「当地日」是硬边界：某次月落若正好压在午夜，40 秒的实现差就足以让它归到前一天。
      // 这是窗口法的固有性质，不是精度问题——故日界 5 分钟内的有无差异单独计数、不判失败。
      const nearEdge = (t: number) => Math.min(Math.abs(t - winStart), Math.abs(t - (winStart + DAY))) < 5 * 60000
      const mine = moonTimes(date, CHONGQING.lat, CHONGQING.lon, TZ_CN)
      const ref = SunCalc.getMoonTimes(date, CHONGQING.lat, CHONGQING.lon, TZ_CN)
      for (const k of ['rise', 'set'] as const) {
        const a = mine[k]
        const b = ref[k]
        if (Boolean(a) !== Boolean(b)) {
          if (nearEdge((b ?? a)!.getTime())) { edgeDays++; continue }
          offEdgeMismatch.push(`第 ${day} 天 ${k}：本实现 ${a ? '有' : '无'} / oracle ${b ? '有' : '无'}`)
          continue
        }
        if (a && b) maxDiffMin = Math.max(maxDiffMin, Math.abs(a.getTime() - b.getTime()) / 60000)
      }
    }
    expect(offEdgeMismatch).toEqual([])
    expect(edgeDays).toBeLessThanOrEqual(4) // 全年至多几次压在日界上的升落
    expect(maxDiffMin).toBeLessThan(1)
  })

  it('日食=新月、月食=满月（与任何实现无关的真值锚）', () => {
    // 2024-04-08 日全食（食甚 18:17 UTC）——日食只可能发生在新月
    const solar = moonIllumination(new Date('2024-04-08T18:17:00Z'))
    expect(Math.min(solar.phase, 1 - solar.phase)).toBeLessThan(0.02)
    expect(solar.fraction).toBeLessThan(0.02)
    // 2026-08-12 日全食（食甚 17:46 UTC）
    const solar2 = moonIllumination(new Date('2026-08-12T17:46:00Z'))
    expect(Math.min(solar2.phase, 1 - solar2.phase)).toBeLessThan(0.02)
    // 2025-03-14 月全食（食甚 06:58 UTC）——月食只可能发生在满月
    const lunar = moonIllumination(new Date('2025-03-14T06:58:00Z'))
    expect(Math.abs(lunar.phase - 0.5)).toBeLessThan(0.02)
    expect(lunar.fraction).toBeGreaterThan(0.98)
  })

  it('极区返回 alwaysUp / alwaysDown，而不是一个假时刻', () => {
    // 北极圈内（78°N，斯瓦尔巴）：月亮赤纬高时整日不落、低时整日不升，两者都会出现
    const flags = new Set<string>()
    for (let day = 0; day < 40; day++) {
      const t = moonTimes(new Date(Date.UTC(2026, 0, 1 + day, 12)), 78.2, 15.6, 60)
      if (t.alwaysUp || t.alwaysDown) flags.add(t.alwaysUp ? 'up' : 'down')
      else expect(t.rise ?? t.set).toBeTruthy()
    }
    expect(flags.size).toBeGreaterThan(0)
  })

  it('窗口是「当地零点起 24 小时」：时区偏移决定事件归属哪一天', () => {
    const date = new Date('2026-05-20T04:00:00Z') // 北京 12:00
    const cn = moonTimes(date, CHONGQING.lat, CHONGQING.lon, TZ_CN)
    const utc = moonTimes(date, CHONGQING.lat, CHONGQING.lon, 0)
    for (const x of [cn.rise, cn.set]) {
      expect(x!.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 4, 19, 16))
      expect(x!.getTime()).toBeLessThan(Date.UTC(2026, 4, 20, 16))
    }
    expect(utc.rise!.getTime()).toBeGreaterThanOrEqual(Date.UTC(2026, 4, 20))
  })
})

describe('月相名与轨道位置', () => {
  it('月相名覆盖八相且在边界上连续', () => {
    expect(moonPhaseName(0)).toBe('新月')
    expect(moonPhaseName(0.25)).toBe('上弦月')
    expect(moonPhaseName(0.5)).toBe('满月')
    expect(moonPhaseName(0.75)).toBe('下弦月')
    expect(moonPhaseName(0.99)).toBe('新月')
    expect(new Set([0, 0.1, 0.25, 0.4, 0.5, 0.6, 0.75, 0.9].map(moonPhaseName)).size).toBe(8)
  })

  it('moonProgress：升落之间在天空、之外不在；两端钳制', () => {
    const rise = new Date('2026-05-20T12:00:00Z') // 北京 20:00
    const set = new Date('2026-05-20T21:00:00Z')  // 北京次日 05:00
    const times = { rise, set, alwaysUp: false, alwaysDown: false }
    const mid = new Date('2026-05-20T16:30:00Z').getTime()
    const p = moonProgress(times, mid, TZ_CN)!
    expect(p.inSky).toBe(true)
    expect(p.t).toBeGreaterThan(0.4)
    expect(p.t).toBeLessThan(0.6)
    expect(moonProgress(times, rise.getTime() - DAY / 2, TZ_CN)!.inSky).toBe(false)
    expect(moonProgress(times, rise.getTime() - 10 * DAY, TZ_CN)!.t).toBe(0)
    expect(moonProgress(times, set.getTime() + 10 * DAY, TZ_CN)!.t).toBe(1)
  })

  it('moonProgress：整日不升起返回 null，整日不落返回满位', () => {
    expect(moonProgress({ rise: null, set: null, alwaysUp: false, alwaysDown: true }, Date.now(), TZ_CN)).toBeNull()
    const up = moonProgress({ rise: null, set: null, alwaysUp: true, alwaysDown: false }, Date.now(), TZ_CN)!
    expect(up.inSky).toBe(true)
    expect(up.t).toBe(1)
  })

  it('moonProgress：只有月落时区间从当地零点起', () => {
    const set = new Date('2026-05-20T02:00:00Z')          // 北京 10:00
    const now = new Date('2026-05-20T01:00:00Z').getTime() // 北京 09:00
    const p = moonProgress({ rise: null, set, alwaysUp: false, alwaysDown: false }, now, TZ_CN)!
    expect(p.inSky).toBe(true)
    // 当地零点 = 前一天 16:00Z；区间 8h→10h，t = 9/10
    expect(p.t).toBeCloseTo(0.9, 2)
  })
})
