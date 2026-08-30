import { describe, it, expect } from 'vitest'
import {
  mapWmoKind, parseWeather, parseAir, sliceHourly, hhmm, uvLabel, aqiLabel,
  weatherIconName, WEATHER_KINDS, WEATHER_LABELS,
} from '../src/lib/weather'

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

describe('sliceHourly（逐小时切片：从当前小时起 24 个整点）', () => {
  const hours = (startH: number, count: number) =>
    Array.from({ length: count }, (_, i) => `2026-08-30T${String((startH + i) % 24).padStart(2, '0')}:00`)
  const raw = {
    time: hours(0, 48),
    weather_code: hours(0, 48).map((_, i) => (i % 2 === 0 ? 0 : 3)),
    temperature_2m: hours(0, 48).map((_, i) => 20 + (i % 10) * 0.6),
    precipitation_probability: hours(0, 48).map((_, i) => (i % 3 === 0 ? 40 : 0)),
  }
  it('从当前小时起切 24 个（含当前小时）', () => {
    const out = sliceHourly(raw, new Date(2026, 7, 30, 15, 30))
    expect(out).toHaveLength(24)
    expect(out[0].time).toBe('2026-08-30T15:00')
    expect(out[0].hourLabel).toBe('15')
    expect(out[23].hourLabel).toBe('14') // 次日 14 时（wrap 后仍正确切片）
  })
  it('找不到当前小时（脏数据）从头切片不炸', () => {
    const out = sliceHourly({ time: ['bad'], weather_code: [1] }, new Date(2026, 7, 30, 15, 0))
    expect(out).toHaveLength(1)
    expect(out[0].kind).toBe('mostly-clear')
  })
  it('空 hourly 返回空数组', () => {
    expect(sliceHourly(undefined)).toEqual([])
  })
})

describe('详情辅助（hhmm/uvLabel/aqiLabel/parseAir）', () => {
  it('hhmm 截取本地时间串；坏值回退 --:--', () => {
    expect(hhmm('2026-08-30T06:12')).toBe('06:12')
    expect(hhmm(null)).toBe('--:--')
    expect(hhmm('bad')).toBe('--:--')
  })
  it('紫外线 WHO 分级', () => {
    expect(uvLabel(0)).toBe('低')
    expect(uvLabel(3)).toBe('中等')
    expect(uvLabel(6)).toBe('高')
    expect(uvLabel(9)).toBe('很高')
    expect(uvLabel(11)).toBe('极高')
    expect(uvLabel(null)).toBe('—')
  })
  it('AQI 国内习惯分级', () => {
    expect(aqiLabel(35)).toBe('优')
    expect(aqiLabel(80)).toBe('良')
    expect(aqiLabel(120)).toBe('轻度污染')
    expect(aqiLabel(180)).toBe('中度污染')
    expect(aqiLabel(250)).toBe('重度污染')
    expect(aqiLabel(320)).toBe('严重污染')
    expect(aqiLabel(undefined)).toBe('—')
  })
  it('parseAir 归一化并取整；缺失返回 null', () => {
    expect(parseAir({ current: { us_aqi: 56.4, pm2_5: 18.2, pm10: 40.7 } })).toEqual({ aqi: 56, pm25: 18, pm10: 41 })
    expect(parseAir(null)).toBeNull()
    expect(parseAir({})).toBeNull()
  })
})

describe('parseWeather 详情字段（湿度/体感/风/日出日落/UV/降水）', () => {
  it('完整字段解析，日出日落透传、UV/降水取整', () => {
    const w = parseWeather({
      current: { weather_code: 0, temperature_2m: 23, relative_humidity_2m: 61.4, apparent_temperature: 24.8, is_day: 1, wind_speed_10m: 9.5 },
      daily: {
        time: ['2026-08-30'],
        weather_code: [0],
        temperature_2m_max: [31], temperature_2m_min: [23],
        sunrise: ['2026-08-30T06:12'], sunset: ['2026-08-30T19:35'],
        uv_index_max: [7.2], precipitation_probability_max: [12.5],
      },
    })
    expect(w!.humidity).toBe(61)
    expect(w!.apparent).toBe(25)
    expect(w!.wind).toBe(10)
    expect(w!.daily[0].sunrise).toBe('2026-08-30T06:12')
    expect(w!.daily[0].uvMax).toBe(7)
    expect(w!.daily[0].precipMax).toBe(13)
  })
  it('air 参数挂到结果上（默认 null 不炸）', () => {
    const raw = { current: { weather_code: 2, is_day: 1 } }
    expect(parseWeather(raw)!.air).toBeNull()
    expect(parseWeather(raw, { aqi: 60, pm25: 20, pm10: 45 })!.air?.aqi).toBe(60)
  })
})
