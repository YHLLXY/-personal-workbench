/**
 * 启动动画的环境氛围渲染层（Canvas 2D，零依赖）。
 *
 * 为什么是两层 canvas：空间关系要求「星/远景雨在主角之下、近景雨/雾/闪电在主角之上」，
 * 单层 canvas 无法插到 DOM 主角的两侧，故按景深拆 back / front 两层，共用一个 rAF 驱动。
 *
 * 与 DOM 粒子版相比：粒子数提升一个量级（雨 46 → 150~340），且能按 depth 统一决定
 * 大小/速度/透明度，形成真正的远-中-近景深，而不是手调的散点。
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { LIGHTNING_AT, MARIA_RGB, sceneAtmosphere, type Atmosphere, type Drop, type Flake, type FogBand, type RGB, type Viewport } from './boot-atmosphere'
import type { BootSegment } from './boot-scene'
import type { WeatherKind } from '@/lib/weather'

/** 闪电折线的折点（相对宽度/高度比例），固定形状避免每帧随机 */
const BOLT: readonly [number, number][] = [
  [0, 0], [0.035, 0.1], [-0.015, 0.19], [0.05, 0.29], [0.01, 0.4], [0.045, 0.5],
]

/** 景深分档：0 远 / 1 中 / 2 近——同档共用一次 stroke/fill，控制绘制调用次数 */
function depthTier(depth: number): 0 | 1 | 2 {
  return depth < 0.34 ? 0 : depth < 0.67 ? 1 : 2
}

const RAIN_COLOR = ['rgba(198, 219, 252, ', 'rgba(210, 228, 255, ', 'rgba(232, 242, 255, ']

function drawDrops(ctx: CanvasRenderingContext2D, drops: Drop[], tilt: number, h: number, t: number) {
  const dx = -Math.tan((tilt * Math.PI) / 180)
  for (let tier = 0; tier < 3; tier++) {
    const group = drops.filter(d => depthTier(d.depth) === tier)
    if (!group.length) continue
    ctx.strokeStyle = `${RAIN_COLOR[tier]}${0.22 + tier * 0.2})`
    ctx.lineWidth = 0.9 + tier * 0.75
    ctx.beginPath()
    for (const d of group) {
      // 匀速下落 + 斜向位移；越界回绕（用取模保证长时间播放也不漂）
      const y = ((d.y + d.speed * t) % (h + 160)) - 80
      const len = d.len
      const x = d.x + dx * d.speed * t
      ctx.moveTo(x, y)
      ctx.lineTo(x + dx * len, y + len)
    }
    ctx.stroke()
  }
}

function drawFlakes(ctx: CanvasRenderingContext2D, flakes: Flake[], h: number, t: number) {
  for (let tier = 0; tier < 3; tier++) {
    const group = flakes.filter(f => depthTier(f.depth) === tier)
    if (!group.length) continue
    ctx.fillStyle = `rgba(255, 255, 255, ${0.45 + tier * 0.2})`
    ctx.beginPath()
    for (const f of group) {
      // 垂直匀速 + 正弦摇摆：近层摇摆幅度更大（sway 已按 depth 放大）
      const y = ((f.y + f.speed * t) % (h + 40)) - 20
      const x = f.x + Math.sin(t * 0.9 + f.phase) * f.sway
      ctx.moveTo(x + f.r, y)
      ctx.arc(x, y, f.r, 0, Math.PI * 2)
    }
    ctx.fill()
  }
}

function drawStars(ctx: CanvasRenderingContext2D, atmo: Atmosphere, t: number) {
  for (const s of atmo.stars) {
    const twinkle = 0.45 + 0.55 * Math.sin((t / s.period) * Math.PI * 2 + s.phase)
    ctx.fillStyle = `rgba(255, 255, 255, ${(s.alpha * twinkle).toFixed(3)})`
    ctx.beginPath()
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2)
    ctx.fill()
  }
}

const rgba = (c: RGB, a: number) => `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${a})`

/** 径向渐隐圆：中心峰值 → 三段衰减到透明，用于辉光 / 大气散射层 */
function drawGlow(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, rgb: RGB, alpha: number) {
  if (r <= 0) return
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r)
  g.addColorStop(0, rgba(rgb, alpha))
  g.addColorStop(0.42, rgba(rgb, alpha * 0.42))
  g.addColorStop(0.72, rgba(rgb, alpha * 0.14))
  g.addColorStop(1, rgba(rgb, 0))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
}

/**
 * 天体（太阳 / 月亮）：外辉 → 内辉 → 偏心渐变圆盘 → 月海。
 * 取代 Meteocons 卡通太阳（渐变圆盘 + 8 条硬边射线 + 6s 匀速自转）；
 * 这里没有射线、没有机械旋转，只有极缓的呼吸，视觉重量交给辉光而不是大圆盘。
 */
function drawCelestial(ctx: CanvasRenderingContext2D, atmo: Atmosphere, vp: Viewport, t: number) {
  const c = atmo.celestial
  if (!c) return
  const cx = (atmo.light.x / 100) * vp.w
  const cy = (atmo.light.y / 100) * vp.h
  const r = (c.coreR / 100) * Math.min(vp.w, vp.h)
  const breath = 1 + Math.sin((t / c.breathSec) * Math.PI * 2) * c.breathAmount

  // 由外向内叠加：大气散射 → 内辉 → 圆盘
  drawGlow(ctx, cx, cy, r * c.glowOuter.scale * breath, c.glowOuter.rgb, c.glowOuter.alpha)
  drawGlow(ctx, cx, cy, r * c.glowInner.scale * breath, c.glowInner.rgb, c.glowInner.alpha)

  const cr = r * breath
  // 偏心渐变：光源偏左上，让圆盘有球体受光的立体感而不是一张平贴纸
  const g = ctx.createRadialGradient(cx - cr * 0.22, cy - cr * 0.22, cr * 0.06, cx, cy, cr)
  g.addColorStop(0, rgba(c.core.center, 1))
  g.addColorStop(0.62, rgba(c.core.center, 0.98))
  g.addColorStop(1, rgba(c.core.edge, 0.92))
  ctx.fillStyle = g
  ctx.beginPath()
  ctx.arc(cx, cy, cr, 0, Math.PI * 2)
  ctx.fill()

  // 月海：clip 在月盘内，避免暗斑溢出成毛边椭圆
  if (c.maria.length) {
    ctx.save()
    ctx.beginPath()
    ctx.arc(cx, cy, cr, 0, Math.PI * 2)
    ctx.clip()
    for (const m of c.maria) {
      const mx = cx + m.dx * cr
      const my = cy + m.dy * cr
      const mr = m.r * cr
      const mg = ctx.createRadialGradient(mx, my, 0, mx, my, mr)
      mg.addColorStop(0, rgba(MARIA_RGB, m.alpha))
      mg.addColorStop(0.6, rgba(MARIA_RGB, m.alpha * 0.7))
      mg.addColorStop(1, rgba(MARIA_RGB, 0))
      ctx.fillStyle = mg
      ctx.beginPath()
      ctx.arc(mx, my, mr, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

function drawMeteors(ctx: CanvasRenderingContext2D, atmo: Atmosphere, vp: Viewport, t: number) {
  for (const m of atmo.meteors) {
    const p = (t - m.delay) / m.duration
    if (p < 0 || p > 1) continue
    const x = (m.left / 100) * vp.w - p * vp.w * 0.32
    const y = (m.top / 100) * vp.h + p * vp.h * 0.2
    const fade = Math.sin(Math.PI * p) // 两头淡出
    const g = ctx.createLinearGradient(x, y, x + m.length, y - m.length * 0.7)
    g.addColorStop(0, `rgba(255, 255, 255, ${0.9 * fade})`)
    g.addColorStop(1, 'rgba(255, 255, 255, 0)')
    ctx.strokeStyle = g
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + m.length, y - m.length * 0.7)
    ctx.stroke()
  }
}

function drawFog(ctx: CanvasRenderingContext2D, bands: FogBand[], vp: Viewport, t: number) {
  for (const band of bands) {
    // 横向拉伸的软边椭圆：比 DOM 的 blur 横条更自然，且无滤镜开销
    const drift = Math.sin(t * 0.16 + band.phase) * vp.w * 0.06
    const rx = vp.w * 0.72
    ctx.save()
    ctx.translate(vp.w / 2 + drift, band.y)
    ctx.scale(1, band.h / rx)
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx)
    g.addColorStop(0, `rgba(226, 234, 244, ${band.alpha})`)
    g.addColorStop(0.55, `rgba(226, 234, 244, ${band.alpha * 0.5})`)
    g.addColorStop(1, 'rgba(226, 234, 244, 0)')
    ctx.fillStyle = g
    ctx.beginPath()
    ctx.arc(0, 0, rx, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/** 闪电：全屏补光 + 一道折线；alpha 由主闪→余闪的双段曲线给出 */
function drawLightning(ctx: CanvasRenderingContext2D, vp: Viewport, t: number) {
  for (const at of LIGHTNING_AT) {
    const dt = t - at
    if (dt < 0 || dt > 0.42) continue
    const p = dt / 0.42
    const flash = p < 0.05 ? p / 0.05 * 0.9 : p < 0.12 ? 0.9 - (p - 0.05) / 0.07 * 0.78 : p < 0.2 ? 0.12 + (p - 0.12) / 0.08 * 0.4 : Math.max(0, 0.52 * (1 - (p - 0.2) / 0.8))
    if (flash <= 0.001) continue
    ctx.fillStyle = `rgba(238, 244, 255, ${flash * 0.7})`
    ctx.fillRect(0, 0, vp.w, vp.h)
    if (p < 0.16) {
      const bx = vp.w * 0.58
      ctx.strokeStyle = `rgba(255, 255, 255, ${0.9 - p * 3})`
      ctx.lineWidth = 2.4
      ctx.beginPath()
      BOLT.forEach(([fx, fy], i) => {
        const px = bx + fx * vp.w
        const py = fy * vp.h
        if (i === 0) ctx.moveTo(px, py)
        else ctx.lineTo(px, py)
      })
      ctx.stroke()
    }
  }
}

function paint(ctx: CanvasRenderingContext2D, atmo: Atmosphere, vp: Viewport, layer: 'back' | 'front', t: number) {
  ctx.clearRect(0, 0, vp.w, vp.h)
  if (layer === 'back') {
    // 最上面一条雾带属于高空远景，压在主角之下；其余（低空雾）属于近景，压在主角之上
    drawFog(ctx, atmo.fog.slice(0, 1), vp, t)
    drawStars(ctx, atmo, t)
    // 天体压在星空之上（更近更亮），流星再压在天体之上（大气层现象）
    drawCelestial(ctx, atmo, vp, t)
    drawMeteors(ctx, atmo, vp, t)
    // 远景降水（depth < 0.5）画在主角之下
    drawDrops(ctx, atmo.drops.filter(d => d.depth < 0.5), atmo.spec.rainTilt, vp.h, t)
    drawFlakes(ctx, atmo.flakes.filter(f => f.depth < 0.5), vp.h, t)
    return
  }
  // 近景降水 + 低空雾 + 闪电画在主角之上
  drawDrops(ctx, atmo.drops.filter(d => d.depth >= 0.5), atmo.spec.rainTilt, vp.h, t)
  drawFlakes(ctx, atmo.flakes.filter(f => f.depth >= 0.5), vp.h, t)
  drawFog(ctx, atmo.fog.slice(1), vp, t)
  if (atmo.spec.lightning) drawLightning(ctx, vp, t)
}

export default function BootAtmosphere({ weather, seg, paused }: { weather: WeatherKind; seg: BootSegment; paused: boolean }) {
  const backRef = useRef<HTMLCanvasElement | null>(null)
  const frontRef = useRef<HTMLCanvasElement | null>(null)
  const [vp, setVp] = useState<Viewport>(() => ({ w: window.innerWidth, h: window.innerHeight }))
  const atmo = useMemo(() => sceneAtmosphere(weather, seg, vp), [weather, seg, vp])

  useEffect(() => {
    const onResize = () => setVp({ w: window.innerWidth, h: window.innerHeight })
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  useEffect(() => {
    const back = backRef.current
    const front = frontRef.current
    if (!back || !front) return
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    for (const c of [back, front]) {
      c.width = Math.round(vp.w * dpr)
      c.height = Math.round(vp.h * dpr)
      const ctx = c.getContext('2d')
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    const bctx = back.getContext('2d')
    const fctx = front.getContext('2d')
    if (!bctx || !fctx) return

    // 系统减弱动态：只渲染一帧静态画面（组件层已整段跳过，此处兜底）
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced || paused) {
      paint(bctx, atmo, vp, 'back', 0)
      paint(fctx, atmo, vp, 'front', 0)
      return
    }

    let raf = 0
    // 用累积时间而非绝对时间：切后台再回来时粒子不会瞬移（dt 上限 50ms 自动吸收这段空档）
    let elapsed = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      elapsed += dt
      paint(bctx, atmo, vp, 'back', elapsed)
      paint(fctx, atmo, vp, 'front', elapsed)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => cancelAnimationFrame(raf)
  }, [atmo, vp, paused])

  return (
    <>
      <canvas ref={backRef} className="boot-atmo boot-atmo-back" aria-hidden />
      <canvas ref={frontRef} className="boot-atmo boot-atmo-front" aria-hidden />
    </>
  )
}
