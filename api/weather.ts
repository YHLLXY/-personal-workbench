/**
 * 天气接口（单文件薄代理）
 *
 * ⚠️ 必须保持单文件：Vercel 函数环境（Node 原生 TS 运行）不支持跨文件相对导入
 * （2026-08-05 线上 FUNCTION_INVOCATION_FAILED 排障结论）。禁止 import src/ 任何文件。
 *
 * GET /api/weather → 服务端转发 Open-Meteo 原始 JSON（非商用免费、无需 key）。
 * 浏览器只请求同域接口，国内可达性与本站一致。WMO 码归一化在前端 src/lib/weather.ts
 * （dev 环境 vite proxy 直连 Open-Meteo，与生产共用同一条前端解析路径）。
 * 坐标=重庆（29.563N, 106.5516E）——改动时同步 vite.config.ts 的 dev 代理 query。
 * 响应 CDN 缓存 30 分钟；上游失败返回 502（不缓存），前端降级为缓存/纯时间场景。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const UPSTREAM = 'https://api.open-meteo.com/v1/forecast' +
  '?latitude=29.563&longitude=106.5516' +
  '&current=weather_code,temperature_2m,is_day' +
  '&daily=weather_code,temperature_2m_max,temperature_2m_min' +
  '&forecast_days=3&timezone=Asia%2FShanghai'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const r = await fetch(UPSTREAM, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`open-meteo ${r.status}`)
    const body = await r.json()
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400')
    res.status(200).json(body)
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'weather upstream failed' })
  } finally {
    clearTimeout(timer)
  }
}
