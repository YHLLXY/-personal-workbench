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
  current?: { weather_code?: number; temperature_2m?: number; is_day?: number }
  daily?: {
    time?: string[]
    weather_code?: number[]
    temperature_2m_max?: number[]
    temperature_2m_min?: number[]
  }
}

export interface DailyForecast { date: string; kind: WeatherKind; max: number | null; min: number | null }
export interface WeatherNow { kind: WeatherKind; temperature: number | null; isDay: boolean; daily: DailyForecast[] }

/** 归一化原始响应；结构缺失时返回 null（调用方走降级），字段级缺失容错 */
export function parseWeather(raw: OpenMeteoRaw | null | undefined): WeatherNow | null {
  if (!raw || !raw.current) return null
  const d = raw.daily ?? {}
  const daily: DailyForecast[] = (d.time ?? []).slice(0, 3).map((date, i) => ({
    date,
    kind: mapWmoKind(d.weather_code?.[i]),
    max: typeof d.temperature_2m_max?.[i] === 'number' ? Math.round(d.temperature_2m_max[i]) : null,
    min: typeof d.temperature_2m_min?.[i] === 'number' ? Math.round(d.temperature_2m_min[i]) : null,
  }))
  return {
    kind: mapWmoKind(raw.current.weather_code),
    temperature: typeof raw.current.temperature_2m === 'number' ? Math.round(raw.current.temperature_2m) : null,
    isDay: raw.current.is_day !== 0,
    daily,
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
