/**
 * 空气质量接口（单文件薄代理）
 *
 * ⚠️ 必须保持单文件：Vercel 函数环境（Node 原生 TS 运行）不支持跨文件相对导入
 * （2026-08-05 线上 FUNCTION_INVOCATION_FAILED 排障结论）。禁止 import src/ 任何文件。
 *
 * GET /api/air-quality → 转发 Open-Meteo Air Quality API 原始 JSON（非商用免费、无需 key）。
 * 与 /api/weather 拆成两个接口：各自独立 CDN 缓存，且 dev 环境 vite proxy 可一一直连。
 * 前端 Promise.allSettled 并行拉取，空气质量失败只隐藏对应详情块，不影响天气主数据。
 * 坐标=重庆——改动时同步 vite.config.ts 的 dev 代理 query。
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'

const UPSTREAM = 'https://air-quality-api.open-meteo.com/v1/air-quality' +
  '?latitude=29.563&longitude=106.5516' +
  '&current=pm2_5,pm10,us_aqi' +
  '&timezone=Asia%2FShanghai'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'method not allowed' }); return }
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 4000)
  try {
    const r = await fetch(UPSTREAM, { signal: ctrl.signal })
    if (!r.ok) throw new Error(`air-quality ${r.status}`)
    const body = await r.json()
    res.setHeader('Cache-Control', 'public, s-maxage=1800, stale-while-revalidate=86400')
    res.status(200).json(body)
  } catch (e) {
    res.status(502).json({ error: e instanceof Error ? e.message : 'air-quality upstream failed' })
  } finally {
    clearTimeout(timer)
  }
}
