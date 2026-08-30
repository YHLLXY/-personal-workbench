import { useQuery } from '@tanstack/react-query'
import { parseAir, parseWeather, WEATHER_KINDS, type WeatherNow } from '@/lib/weather'

/**
 * 重庆天气（实况 + 逐小时 + 7 日 + 日出日落/UV），空气质量并行拉取可选失败。
 * 生产：/api/weather + /api/air-quality 两个薄代理；dev：vite proxy 同构直连。
 * 10 分钟新鲜期 + 失败重试 1 次（上游偶发瞬时抖动），CDN 侧另有 30 分钟缓存。
 */
async function fetchWeather(): Promise<WeatherNow | null> {
  const [w, a] = await Promise.allSettled([
    fetch('/api/weather', { signal: AbortSignal.timeout(4000) }),
    fetch('/api/air-quality', { signal: AbortSignal.timeout(4000) }),
  ])
  if (w.status !== 'fulfilled' || !w.value.ok) throw new Error('weather fetch failed')
  const raw = await w.value.json()
  const air = a.status === 'fulfilled' && a.value.ok ? parseAir(await a.value.json()) : null
  return parseWeather(raw, air)
}

/** 预览钩子：?wx=rain 强制天气种类、?boot=night 强制昼夜（调弹窗/卡片观感用，不影响正常用户） */
function applyWxOverride(w: WeatherNow | null | undefined): WeatherNow | null | undefined {
  if (!w || typeof window === 'undefined') return w
  const q = new URLSearchParams(window.location.search)
  const wx = q.get('wx')
  const boot = q.get('boot')
  const kind = (WEATHER_KINDS as readonly string[]).includes(wx ?? '') ? (wx as WeatherNow['kind']) : w.kind
  const isDay = boot === 'night' ? false : boot ? true : w.isDay
  if (kind === w.kind && isDay === w.isDay) return w
  return { ...w, kind, isDay }
}

/** 卡片与详情弹窗共用同一个 queryKey，弹窗打开即命中缓存秒出 */
export function useWeatherQuery() {
  return useQuery({ queryKey: ['weather'], queryFn: fetchWeather, staleTime: 10 * 60_000, retry: 1, select: applyWxOverride })
}
