import { describe, it, expect } from 'vitest'
import { mapWmoKind, parseWeather, weatherIconName, WEATHER_KINDS, WEATHER_LABELS } from '../src/lib/weather'

describe('mapWmoKind（WMO 天气码 → 12 类）', () => {
  it('晴/少云/多云/阴', () => {
    expect(mapWmoKind(0)).toBe('clear')
    expect(mapWmoKind(1)).toBe('mostly-clear')
    expect(mapWmoKind(2)).toBe('partly')
    expect(mapWmoKind(3)).toBe('overcast')
  })
  it('雾/毛毛雨/雨/大雨', () => {
    expect(mapWmoKind(45)).toBe('fog')
    expect(mapWmoKind(48)).toBe('fog')
    expect(mapWmoKind(51)).toBe('drizzle')
    expect(mapWmoKind(55)).toBe('drizzle')
    expect(mapWmoKind(53)).toBe('drizzle')
    expect(mapWmoKind(61)).toBe('rain')
    expect(mapWmoKind(63)).toBe('rain')
    expect(mapWmoKind(80)).toBe('rain')
    expect(mapWmoKind(81)).toBe('rain')
    expect(mapWmoKind(65)).toBe('heavy-rain')
    expect(mapWmoKind(82)).toBe('heavy-rain')
  })
  it('冻雨/雨夹雪归并到 sleet', () => {
    expect(mapWmoKind(56)).toBe('sleet')
    expect(mapWmoKind(57)).toBe('sleet')
    expect(mapWmoKind(66)).toBe('sleet')
    expect(mapWmoKind(67)).toBe('sleet')
  })
  it('雪/大雪/雷暴', () => {
    expect(mapWmoKind(71)).toBe('snow')
    expect(mapWmoKind(73)).toBe('snow')
    expect(mapWmoKind(85)).toBe('snow')
    expect(mapWmoKind(75)).toBe('heavy-snow')
    expect(mapWmoKind(77)).toBe('heavy-snow')
    expect(mapWmoKind(86)).toBe('heavy-snow')
    expect(mapWmoKind(95)).toBe('thunder')
    expect(mapWmoKind(99)).toBe('thunder')
  })
  it('缺失/非法/未知码一律晴天（宁要晴天，不要报错）', () => {
    expect(mapWmoKind(null)).toBe('clear')
    expect(mapWmoKind(undefined)).toBe('clear')
    expect(mapWmoKind(Number.NaN)).toBe('clear')
    expect(mapWmoKind(-5)).toBe('clear')
    expect(mapWmoKind(68)).toBe('clear')
    expect(mapWmoKind(4.6)).toBe('clear') // WMO 无码 4
  })
  it('12 类齐全且中文标签齐备（防漏映射导致 UI 空白）', () => {
    for (const k of WEATHER_KINDS) expect(WEATHER_LABELS[k]).toBeTruthy()
  })
})

describe('parseWeather（Open-Meteo 原始响应归一化）', () => {
  it('实况 + 三日预报完整解析，温度取整', () => {
    const w = parseWeather({
      current: { weather_code: 61, temperature_2m: 22.4, is_day: 1 },
      daily: {
        time: ['2026-08-30', '2026-08-31', '2026-09-01'],
        weather_code: [61, 3, 0],
        temperature_2m_max: [27.6, 28.1, 30],
        temperature_2m_min: [20.2, 21, 22],
      },
    })
    expect(w).not.toBeNull()
    expect(w!.kind).toBe('rain')
    expect(w!.temperature).toBe(22)
    expect(w!.isDay).toBe(true)
    expect(w!.daily.map(d => d.kind)).toEqual(['rain', 'overcast', 'clear'])
    expect(w!.daily[0].max).toBe(28) // 27.6 → 28（Math.round）
    expect(w!.daily).toHaveLength(3)
  })
  it('仅实况、无 daily 时不炸（daily 为空数组）', () => {
    const w = parseWeather({ current: { weather_code: 0, temperature_2m: 30, is_day: 0 } })
    expect(w!.kind).toBe('clear')
    expect(w!.isDay).toBe(false)
    expect(w!.daily).toEqual([])
  })
  it('结构缺失返回 null（调用方走降级）', () => {
    expect(parseWeather(null)).toBeNull()
    expect(parseWeather(undefined)).toBeNull()
    expect(parseWeather({})).toBeNull()
    expect(parseWeather({ daily: { time: ['2026-08-30'] } })).toBeNull()
  })
  it('daily 字段级缺失容错（码缺省按晴天、温度缺省 null）', () => {
    const w = parseWeather({ current: { weather_code: 2 }, daily: { time: ['2026-08-30', '2026-08-31'], weather_code: [2] } })
    expect(w!.daily[0].kind).toBe('partly')
    expect(w!.daily[1].kind).toBe('clear')
    expect(w!.daily[1].max).toBeNull()
  })
})

describe('weatherIconName（天气 → Meteocons 图标名）', () => {
  it('昼/夜变体', () => {
    expect(weatherIconName('clear', true)).toBe('clear-day')
    expect(weatherIconName('clear', false)).toBe('clear-night')
    expect(weatherIconName('partly', true)).toBe('partly-cloudy-day')
    expect(weatherIconName('partly', false)).toBe('partly-cloudy-night')
    expect(weatherIconName('fog', false)).toBe('fog-night')
    expect(weatherIconName('rain', false)).toBe('partly-cloudy-night-rain')
    expect(weatherIconName('thunder', true)).toBe('thunderstorms-rain')
    expect(weatherIconName('thunder', false)).toBe('thunderstorms-night-rain')
  })
  it('强度档共用素材', () => {
    expect(weatherIconName('heavy-rain', true)).toBe('rain')
    expect(weatherIconName('heavy-snow', true)).toBe('snow')
    expect(weatherIconName('drizzle', true)).toBe('drizzle')
  })
})
