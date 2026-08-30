import { parseWeather, type WeatherKind } from '@/lib/weather'

const CACHE_KEY = 'wb-boot-weather'
const CACHE_TTL_MS = 24 * 3600_000
/** 开场等待上限：超过则先用本地缓存/晴天开播，请求留在后台刷新缓存供下次启动用 */
export const BOOT_WEATHER_WAIT_MS = 600

function readCache(): WeatherKind | null {
  try {
    const j = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '') as { kind?: string; ts?: number }
    if (j && typeof j.kind === 'string' && typeof j.ts === 'number' && Date.now() - j.ts < CACHE_TTL_MS) {
      return j.kind as WeatherKind
    }
  } catch { /* 隐私模式/坏 JSON：忽略 */ }
  return null
}

function writeCache(kind: WeatherKind): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ kind, ts: Date.now() })) } catch { /* 忽略 */ }
}

/** 拉 /api/weather（生产=同域薄代理；dev=vite proxy 直连 Open-Meteo），返回原始 JSON */
async function fetchRaw(): Promise<unknown> {
  const r = await fetch('/api/weather', { signal: AbortSignal.timeout(2500) })
  if (!r.ok) throw new Error(`weather ${r.status}`)
  return r.json()
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** 启动动画天气解析：竞速 600ms → 本地缓存 → 晴天兜底，永不为 null、永不抛错 */
export async function resolveBootWeather(): Promise<WeatherKind> {
  const cached = readCache()
  const fetching = fetchRaw()
    .then(raw => {
      const w = parseWeather(raw as Parameters<typeof parseWeather>[0])
      if (w) writeCache(w.kind)
      return w?.kind ?? null
    })
    .catch(() => null)
  const ready = await Promise.race([fetching, sleep(BOOT_WEATHER_WAIT_MS).then(() => null)])
  return ready ?? cached ?? 'clear'
}
