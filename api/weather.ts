/**
 * 启动动画天气接口（单文件）
 *
 * ⚠️ 必须保持单文件：Vercel 函数环境（Node 原生 TS 运行）不支持跨文件相对导入
 * （2026-08-05 线上 FUNCTION_INVOCATION_FAILED 排障结论）。禁止 import src/ 任何文件。
 *
 * GET /api/weather → 服务端代理 Open-Meteo（非商用免费、无需 key），
 * 浏览器只请求同域接口，国内可达性与本站一致。非敏感公共数据，无鉴权。
 * 响应被 Vercel CDN 缓存 30 分钟（s-maxage），冷启动频繁调用也不会打爆上游。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

/** 启动动画天气种类（前端渲染层的七种叠加效果） */
export type WeatherKind = 'clear' | 'partly' | 'overcast' | 'rain' | 'snow' | 'fog' | 'thunder'
export const WEATHER_KINDS: readonly WeatherKind[] = ['clear', 'partly', 'overcast', 'rain', 'snow', 'fog', 'thunder'] as const

/** 用户指定：按重庆取天气（山城） */
const CITY = { name: '重庆', latitude: 29.563, longitude: 106.5516 }

/** WMO weather code → 七类动画效果；未知/缺失码按晴天处理（宁要晴天，不要报错） */
export function mapWmoKind(code: number | null | undefined): WeatherKind {
  if (code == null || !Number.isFinite(code)) return 'clear'
  const c = Math.round(code)
  if (c === 0) return 'clear'
  if (c === 1 || c === 2) return 'partly'
  if (c === 3) return 'overcast'
  if (c === 45 || c === 48) return 'fog'
  if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'rain'
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'snow'
  if (c >= 95 && c <= 99) return 'thunder'
  return 'clear'
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000) // 上游 4s 不回来就放弃，前端有自己的降级链
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${CITY.latitude}&longitude=${CITY.longitude}` +
      `&current=weather_code,temperature_2m,is_day&timezone=Asia%2FShanghai`
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`open-meteo ${r.status}`)
    const j = (await r.json()) as { current?: { weather_code?: number; temperature_2m?: number; is_day?: number } }
    const cur = j.current ?? {}
    const body = {
      city: CITY.name,
      kind: mapWmoKind(cur.weather_code),
      wmo: cur.weather_code ?? null,
      temperature: typeof cur.temperature_2m === 'number' ? Math.round(cur.temperature_2m) : null,
      isDay: cur.is_day !== 0,
      updatedAt: new Date().toISOString(),
    }
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400')
    res.status(200).json(body)
  } catch (e) {
    // 失败不缓存：CDN 不留 502，前端降级为纯时间场景
    res.status(502).json({ error: e instanceof Error ? e.message : 'weather upstream failed' })
  } finally {
    clearTimeout(timer)
  }
}
