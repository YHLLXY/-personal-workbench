/**
 * 天气领域逻辑（启动动画与首页天气卡共用）。
 * 纯函数、可单测；WMO 码规则与 Open-Meteo 文档对齐（https://open-meteo.com/en/docs）。
 */

/** 天气种类：按动画/卡片展示需要划分 12 类（比 7 类多了强度档与雨夹雪） */
export type WeatherKind =
  | 'clear' | 'mostly-clear' | 'partly' | 'overcast' | 'fog'
  | 'drizzle' | 'rain' | 'heavy-rain' | 'sleet'
  | 'snow' | 'heavy-snow' | 'thunder'

export const WEATHER_KINDS: readonly WeatherKind[] = [
  'clear', 'mostly-clear', 'partly', 'overcast', 'fog',
  'drizzle', 'rain', 'heavy-rain', 'sleet', 'snow', 'heavy-snow', 'thunder',
]

/** WMO weather code → 12 类；缺失/未知码按晴天（宁要晴天，不要报错） */
export function mapWmoKind(code: number | null | undefined): WeatherKind {
  if (code == null || !Number.isFinite(code)) return 'clear'
  const c = Math.round(code)
  if (c === 0) return 'clear'
  if (c === 1) return 'mostly-clear'
  if (c === 2) return 'partly'
  if (c === 3) return 'overcast'
  if (c === 45 || c === 48) return 'fog'
  if (c >= 51 && c <= 55) return 'drizzle'
  if (c === 56 || c === 57) return 'sleet' // 冻毛毛雨
  if (c === 61 || c === 63 || c === 80 || c === 81) return 'rain'
  if (c === 65 || c === 82) return 'heavy-rain'
  if (c === 66 || c === 67) return 'sleet' // 冻雨
  if (c === 71 || c === 73 || c === 85) return 'snow'
  if (c === 75 || c === 77 || c === 86) return 'heavy-snow'
  if (c >= 95 && c <= 99) return 'thunder'
  return 'clear'
}

/** 卡片/动画旁的中文描述 */
export const WEATHER_LABELS: Record<WeatherKind, string> = {
  'clear': '晴',
  'mostly-clear': '晴间少云',
  'partly': '多云',
  'overcast': '阴',
  'fog': '雾',
  'drizzle': '毛毛雨',
  'rain': '小雨',
  'heavy-rain': '大雨',
  'sleet': '雨夹雪',
  'snow': '小雪',
  'heavy-snow': '大雪',
  'thunder': '雷阵雨',
}

/** Open-Meteo forecast 接口的原始响应（我们只取用到的字段） */
export interface OpenMeteoRaw {
  current?: {
    weather_code?: number
    temperature_2m?: number
    relative_humidity_2m?: number
    apparent_temperature?: number
    is_day?: number
    wind_speed_10m?: number
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    weather_code?: number[]
    precipitation_probability?: number[]
  }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
    sunrise?: string[]
    sunset?: string[]
    uv_index_max?: number[]
    precipitation_probability_max?: number[]
  }
}

/** Open-Meteo Air Quality 接口的原始响应 */
export interface OpenMeteoAirRaw {
  current?: { pm2_5?: number; pm10?: number; us_aqi?: number }
}

export interface HourPoint { time: string; hourLabel: string; kind: WeatherKind; temp: number | null; precip: number | null }
export interface DailyForecast {
  date: string
  kind: WeatherKind
  max: number | null
  min: number | null
  /** 'YYYY-MM-DDTHH:mm' 本地时间 */
  sunrise: string | null
  sunset: string | null
  uvMax: number | null
  precipMax: number | null
}
export interface AirNow { aqi: number | null; pm25: number | null; pm10: number | null }
export interface WeatherNow {
  kind: WeatherKind
  temperature: number | null
  isDay: boolean
  humidity: number | null
  apparent: number | null
  wind: number | null
  daily: DailyForecast[]
  /** 从当前小时起 24 个整点（含当前小时） */
  hourly: HourPoint[]
  air: AirNow | null
}

/** 'YYYY-MM-DDTHH:mm' → 'HH:mm' */
export function hhmm(iso: string | null | undefined): string {
  return iso && iso.length >= 16 ? iso.slice(11, 16) : '--:--'
}

/** 紫外线指数 → 等级文案（WHO 分级） */
export function uvLabel(uv: number | null | undefined): string {
  if (uv == null || !Number.isFinite(uv)) return '—'
  if (uv < 3) return '低'
  if (uv < 6) return '中等'
  if (uv < 8) return '高'
  if (uv < 11) return '很高'
  return '极高'
}

/** US AQI → 等级文案（对照国内习惯分级） */
export function aqiLabel(aqi: number | null | undefined): string {
  if (aqi == null || !Number.isFinite(aqi)) return '—'
  if (aqi <= 50) return '优'
  if (aqi <= 100) return '良'
  if (aqi <= 150) return '轻度污染'
  if (aqi <= 200) return '中度污染'
  if (aqi <= 300) return '重度污染'
  return '严重污染'
}

export function parseAir(raw: OpenMeteoAirRaw | null | undefined): AirNow | null {
  const c = raw?.current
  if (!c) return null
  return {
    aqi: typeof c.us_aqi === 'number' ? Math.round(c.us_aqi) : null,
    pm25: typeof c.pm2_5 === 'number' ? Math.round(c.pm2_5) : null,
    pm10: typeof c.pm10 === 'number' ? Math.round(c.pm10) : null,
  }
}

/** 逐小时切片：从当前小时起 24 个整点（含当前小时，标签「现在」由 UI 决定） */
export function sliceHourly(raw: OpenMeteoRaw['hourly'], now: Date = new Date()): HourPoint[] {
  const times = raw?.time ?? []
  const pad = (n: number) => String(n).padStart(2, '0')
  const nowKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:00`
  let start = times.findIndex(t => t >= nowKey)
  if (start < 0) start = 0
  return times.slice(start, start + 24).map((time, i) => {
    const k = start + i
    return {
      time,
      hourLabel: time.slice(11, 13),
      kind: mapWmoKind(raw?.weather_code?.[k]),
      temp: typeof raw?.temperature_2m?.[k] === 'number' ? Math.round(raw.temperature_2m[k]) : null,
      precip: typeof raw?.precipitation_probability?.[k] === 'number' ? Math.round(raw.precipitation_probability[k]) : null,
    }
  })
}

/** 归一化；结构缺失返回 null（调用方走降级），字段级缺失容错 */
export function parseWeather(raw: OpenMeteoRaw | null | undefined, air: AirNow | null = null): WeatherNow | null {
  if (!raw || !raw.current) return null
  const d = raw.daily ?? {}
  const daily: DailyForecast[] = (d.time ?? []).map((date, i) => ({
    date,
    kind: mapWmoKind(d.weather_code?.[i]),
    max: typeof d.temperature_2m_max?.[i] === 'number' ? Math.round(d.temperature_2m_max[i]) : null,
    min: typeof d.temperature_2m_min?.[i] === 'number' ? Math.round(d.temperature_2m_min[i]) : null,
    sunrise: d.sunrise?.[i] ?? null,
    sunset: d.sunset?.[i] ?? null,
    uvMax: typeof d.uv_index_max?.[i] === 'number' ? Math.round(d.uv_index_max[i]) : null,
    precipMax: typeof d.precipitation_probability_max?.[i] === 'number' ? Math.round(d.precipitation_probability_max[i]) : null,
  }))
  const c = raw.current
  return {
    kind: mapWmoKind(c.weather_code),
    temperature: typeof c.temperature_2m === 'number' ? Math.round(c.temperature_2m) : null,
    isDay: c.is_day !== 0,
    humidity: typeof c.relative_humidity_2m === 'number' ? Math.round(c.relative_humidity_2m) : null,
    apparent: typeof c.apparent_temperature === 'number' ? Math.round(c.apparent_temperature) : null,
    wind: typeof c.wind_speed_10m === 'number' ? Math.round(c.wind_speed_10m) : null,
    daily,
    hourly: sliceHourly(raw.hourly),
    air,
  }
}

/** 天气 → Meteocons 图标名（不带 .svg；URL 转换见 src/lib/weather-icons.ts） */
export function weatherIconName(kind: WeatherKind, isDay: boolean): string {
  if (kind === 'clear' || kind === 'mostly-clear') return isDay ? 'clear-day' : 'clear-night'
  if (kind === 'partly') return isDay ? 'partly-cloudy-day' : 'partly-cloudy-night'
  if (kind === 'overcast') return 'cloudy'
  if (kind === 'fog') return isDay ? 'fog-day' : 'fog-night'
  if (kind === 'drizzle') return 'drizzle'
  if (kind === 'rain' || kind === 'heavy-rain') return isDay ? 'rain' : 'partly-cloudy-night-rain'
  if (kind === 'sleet') return 'sleet'
  if (kind === 'snow' || kind === 'heavy-snow') return 'snow'
  return isDay ? 'thunderstorms-rain' : 'thunderstorms-night-rain' // thunder
}
