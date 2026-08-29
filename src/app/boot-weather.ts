import type { BootWeather } from './boot-scene'

const KINDS: readonly BootWeather[] = ['clear', 'partly', 'overcast', 'rain', 'snow', 'fog', 'thunder']
const CACHE_KEY = 'wb-boot-weather'
const CACHE_TTL_MS = 24 * 3600_000
/** 开场等待上限：超过则先用本地缓存/晴天开播，请求留在后台刷新缓存供下次启动用 */
export const BOOT_WEATHER_WAIT_MS = 600

function readCache(): BootWeather | null {
  try {
    const j = JSON.parse(localStorage.getItem(CACHE_KEY) ?? '') as { kind?: string; ts?: number }
    if (j && typeof j.kind === 'string' && (KINDS as readonly string[]).includes(j.kind) && typeof j.ts === 'number' && Date.now() - j.ts < CACHE_TTL_MS) {
      return j.kind as BootWeather
    }
  } catch { /* 隐私模式/坏 JSON：忽略 */ }
  return null
}

function writeCache(kind: BootWeather): void {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify({ kind, ts: Date.now() })) } catch { /* 忽略 */ }
}

async function fetchKind(): Promise<BootWeather | null> {
  const r = await fetch('/api/weather', { signal: AbortSignal.timeout(2500) })
  if (!r.ok) return null
  const j = (await r.json()) as { kind?: string }
  return (KINDS as readonly string[]).includes(j.kind ?? '') ? (j.kind as BootWeather) : null
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

/** 启动动画天气解析：/api/weather 竞速 600ms → 本地缓存 → 晴天兜底，永不为null、永不抛错 */
export async function resolveBootWeather(): Promise<BootWeather> {
  const cached = readCache()
  const fetching = fetchKind()
    .then(k => { if (k) writeCache(k); return k })
    .catch(() => null)
  const ready = await Promise.race([fetching, sleep(BOOT_WEATHER_WAIT_MS).then(() => null)])
  return ready ?? cached ?? 'clear'
}
