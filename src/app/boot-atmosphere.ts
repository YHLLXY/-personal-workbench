/**
 * 启动动画的「环境氛围层」数据配置（纯函数层，零 DOM 依赖）。
 *
 * 与 boot-scene.ts 的分工：
 * - boot-scene.ts  → 天空调色板、天气染色、伴飞元素配置（图标层）
 * - 本文件        → 光源、雨雪雾星闪电等环境粒子的生成与参数（Canvas 层）
 *
 * 设计由来：原实现用 DOM 节点做粒子（雨 46 / 雪 34 / 星 64 个 div），密度与帧率直接冲突，
 * 质量上限被实现手段锁死。改为 Canvas 2D 程序化绘制后，粒子数可提升一个量级且能做出景深。
 * 视觉层次继续沿用「配置表 + 纯函数」的既有做法，便于单测与调参。
 */
import type { WeatherKind } from '@/lib/weather'
import { seededRandom } from './boot-scene'
import type { BootSegment } from './boot-scene'

/** 光源：统一主角投影方向与粒子高光朝向（x/y 为场景百分比坐标，与 CSS 中天体位置对齐） */
export interface LightSource {
  x: number
  y: number
  /** 主角投影偏移（px，已按主角位置折算），供 CSS 变量使用 */
  shadowDx: number
  shadowDy: number
  /** 光晕颜色 */
  glow: string
}

/** 日间太阳在 left 5% / top 5%（.boot-big-sun），夜间月亮在 right 9% / top 8%（.boot-big-moon） */
export const LIGHT_BY_SEGMENT: Record<BootSegment, LightSource> = {
  dawn: { x: 14, y: 66, shadowDx: 14, shadowDy: 22, glow: 'rgba(255, 196, 148, 0.34)' },
  noon: { x: 12, y: 10, shadowDx: 16, shadowDy: 20, glow: 'rgba(255, 248, 214, 0.4)' },
  dusk: { x: 26, y: 68, shadowDx: 12, shadowDy: 24, glow: 'rgba(255, 150, 92, 0.32)' },
  night: { x: 80, y: 15, shadowDx: -12, shadowDy: 22, glow: 'rgba(190, 214, 255, 0.3)' },
}

/** 颜色分量 [r, g, b]，便于按不同 alpha 组装渐变色标 */
export type RGB = [number, number, number]

/** 辉光层：颜色 + 峰值不透明度 + 相对圆盘半径的倍率 */
export interface GlowSpec { rgb: RGB; alpha: number; scale: number }
/** 月海（月面暗斑）：dx/dy/r 均为相对圆盘半径的比例 */
export interface MariaSpec { dx: number; dy: number; r: number; alpha: number }

/**
 * 天体（太阳 / 月亮）的程序化参数。
 *
 * 取代 Meteocons 卡通太阳：素材是「渐变圆盘 + 8 条硬边射线 + 6s 匀速自转」，
 * 放大到 46vmin 后在全屏氛围场景里过于抢戏，且高饱和 #F8AF18 与冷调天空撞色
 * （详见 docs/plans/RESEARCH_BOOT_SUN.md）。改为由时段调色板派生的渐变光源：
 * 视觉重量靠多层辉光撑，不靠大圆盘；用极缓呼吸替代机械旋转。
 */
export interface CelestialSpec {
  kind: 'sun' | 'moon'
  /** 圆盘半径（vmin 百分比） */
  coreR: number
  /** 圆盘径向渐变（偏心，模拟球体受光）：中心色 → 边缘色 */
  core: { center: RGB; edge: RGB }
  /** 内辉 */
  glowInner: GlowSpec
  /** 外辉（大气散射） */
  glowOuter: GlowSpec
  /** 月海，仅月亮有；太阳为空数组 */
  maria: MariaSpec[]
  /** 呼吸周期（秒）与幅度（半径缩放比例） */
  breathSec: number
  breathAmount: number
}

/** 月海颜色：比月盘更冷的灰蓝，仅略深，避免显脏 */
export const MARIA_RGB: RGB = [148, 166, 200]

export const CELESTIAL_BY_SEGMENT: Record<BootSegment, CelestialSpec> = {
  // 晨光：低角度暖橙，边缘散射更开
  dawn: {
    kind: 'sun', coreR: 6.5,
    core: { center: [255, 252, 240], edge: [255, 206, 140] },
    glowInner: { rgb: [255, 196, 130], alpha: 0.4, scale: 2.3 },
    glowOuter: { rgb: [255, 170, 110], alpha: 0.18, scale: 4.4 },
    maria: [], breathSec: 5.4, breathAmount: 0.05,
  },
  // 正午：白金色，辉光收敛（顶光下大气散射范围小）
  noon: {
    kind: 'sun', coreR: 6,
    core: { center: [255, 255, 252], edge: [255, 241, 196] },
    glowInner: { rgb: [255, 246, 214], alpha: 0.34, scale: 2.0 },
    glowOuter: { rgb: [255, 238, 190], alpha: 0.15, scale: 3.8 },
    maria: [], breathSec: 4.8, breathAmount: 0.055,
  },
  // 黄昏：橙红，辉光最开（低角度穿越大层路径最长）
  dusk: {
    kind: 'sun', coreR: 7,
    core: { center: [255, 248, 232], edge: [255, 168, 96] },
    glowInner: { rgb: [255, 150, 80], alpha: 0.44, scale: 2.5 },
    glowOuter: { rgb: [255, 130, 70], alpha: 0.2, scale: 4.8 },
    maria: [], breathSec: 6.0, breathAmount: 0.045,
  },
  // 夜月：冷白圆盘 + 月海（暗斑是月亮独有的识别特征，同时提供质感）
  night: {
    kind: 'moon', coreR: 6,
    core: { center: [250, 252, 255], edge: [200, 216, 244] },
    glowInner: { rgb: [176, 204, 255], alpha: 0.26, scale: 2.2 },
    glowOuter: { rgb: [140, 172, 236], alpha: 0.13, scale: 4.2 },
    maria: [
      { dx: -0.30, dy: -0.16, r: 0.30, alpha: 0.17 },
      { dx: 0.24, dy: -0.30, r: 0.22, alpha: 0.13 },
      { dx: -0.08, dy: 0.30, r: 0.26, alpha: 0.15 },
      { dx: 0.36, dy: 0.14, r: 0.17, alpha: 0.11 },
    ],
    breathSec: 6.8, breathAmount: 0.03, // 月亮更静谧，呼吸幅度更小
  },
}

/** 单类天气的环境氛围参数（密度为 1280×800 视口下的基准值，实际按面积缩放） */
export interface AtmoSpec {
  /** 雨滴数；0 = 无雨 */
  rain: number
  /** 雨滴长度范围（px，近景层再按景深放大） */
  rainLen: [number, number]
  /** 雨滴速度范围（px/s） */
  rainSpeed: [number, number]
  /** 雨的倾角（度），与 Meteocons 图标内部雨滴角度对齐，避免「两套雨」 */
  rainTilt: number
  /** 雪花数 */
  snow: number
  snowSize: [number, number]
  snowSpeed: [number, number]
  /** 雾带数量 */
  fog: number
  fogAlpha: number
  /** 是否闪电 */
  lightning: boolean
  /** 星空数量（仅夜晚生效） */
  stars: number
  meteors: number
}

export const ATMO_PRESETS: Record<WeatherKind, AtmoSpec> = {
  'clear': { rain: 0, rainLen: [0, 0], rainSpeed: [0, 0], rainTilt: 12, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 0, fogAlpha: 0, lightning: false, stars: 90, meteors: 2 },
  'mostly-clear': { rain: 0, rainLen: [0, 0], rainSpeed: [0, 0], rainTilt: 12, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 0, fogAlpha: 0, lightning: false, stars: 80, meteors: 2 },
  'partly': { rain: 0, rainLen: [0, 0], rainSpeed: [0, 0], rainTilt: 12, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 1, fogAlpha: 0.05, lightning: false, stars: 60, meteors: 1 },
  'overcast': { rain: 0, rainLen: [0, 0], rainSpeed: [0, 0], rainTilt: 12, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 2, fogAlpha: 0.07, lightning: false, stars: 0, meteors: 0 },
  'fog': { rain: 0, rainLen: [0, 0], rainSpeed: [0, 0], rainTilt: 12, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 4, fogAlpha: 0.13, lightning: false, stars: 0, meteors: 0 },
  'drizzle': { rain: 70, rainLen: [7, 13], rainSpeed: [420, 640], rainTilt: 8, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 1, fogAlpha: 0.06, lightning: false, stars: 0, meteors: 0 },
  'rain': { rain: 150, rainLen: [12, 22], rainSpeed: [720, 1040], rainTilt: 12, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 2, fogAlpha: 0.07, lightning: false, stars: 0, meteors: 0 },
  'heavy-rain': { rain: 320, rainLen: [18, 34], rainSpeed: [1120, 1560], rainTilt: 14, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 3, fogAlpha: 0.09, lightning: false, stars: 0, meteors: 0 },
  'sleet': { rain: 110, rainLen: [9, 16], rainSpeed: [560, 820], rainTilt: 10, snow: 45, snowSize: [1.8, 3.4], snowSpeed: [90, 150], fog: 2, fogAlpha: 0.07, lightning: false, stars: 0, meteors: 0 },
  'snow': { rain: 0, rainLen: [0, 0], rainSpeed: [0, 0], rainTilt: 12, snow: 100, snowSize: [2, 4.6], snowSpeed: [70, 140], fog: 1, fogAlpha: 0.05, lightning: false, stars: 0, meteors: 0 },
  'heavy-snow': { rain: 0, rainLen: [0, 0], rainSpeed: [0, 0], rainTilt: 12, snow: 240, snowSize: [2.4, 6], snowSpeed: [95, 180], fog: 2, fogAlpha: 0.07, lightning: false, stars: 0, meteors: 0 },
  'thunder': { rain: 340, rainLen: [18, 32], rainSpeed: [1150, 1600], rainTilt: 14, snow: 0, snowSize: [0, 0], snowSpeed: [0, 0], fog: 3, fogAlpha: 0.1, lightning: true, stars: 0, meteors: 0 },
}

/** 闪电时刻表（秒，相对动画开始）：一次主闪 + 一次余闪，节奏与 CSS 版一致但不刺眼 */
export const LIGHTNING_AT: readonly number[] = [0.62, 0.78, 1.9]

/** 流星参数（夜晚）：出发延迟 / 起点 / 长度 */
export const METEORS = [
  { delay: 0.5, left: 72, top: 8, length: 120, duration: 1.5 },
  { delay: 1.6, left: 40, top: 4, length: 96, duration: 1.3 },
] as const

export interface Drop { x: number; y: number; len: number; speed: number; depth: number; alpha: number }
export interface Flake { x: number; y: number; r: number; speed: number; sway: number; phase: number; depth: number; alpha: number }
export interface FogBand { y: number; h: number; alpha: number; speed: number; phase: number }
export interface Star { x: number; y: number; r: number; alpha: number; period: number; phase: number }
export interface Meteor { left: number; top: number; length: number; delay: number; duration: number }

export interface Viewport { w: number; h: number }

/** 基准视口面积（1280×800）：粒子数按面积线性缩放，移动端自动减负 */
const BASE_AREA = 1280 * 800

/** 按视口面积缩放粒子数；限制在 [0.45, 1.35] 倍，避免小屏太稀、大屏爆炸 */
export function scaleCount(base: number, vp: Viewport): number {
  if (base <= 0) return 0
  const ratio = (vp.w * vp.h) / BASE_AREA
  return Math.max(1, Math.round(base * Math.min(1.35, Math.max(0.45, ratio))))
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t

/**
 * 雨滴：depth 决定大小/速度/透明度，形成远-中-近三层景深。
 * y 初始铺满整屏（含屏外），避免开场「雨从顶部齐刷刷涌下」。
 */
export function makeDrops(spec: AtmoSpec, vp: Viewport, seed = 7): Drop[] {
  const n = scaleCount(spec.rain, vp)
  const rng = seededRandom(seed)
  return Array.from({ length: n }, () => {
    const depth = rng()
    return {
      x: rng() * (vp.w + 120) - 60,
      y: rng() * vp.h,
      len: lerp(spec.rainLen[0], spec.rainLen[1], rng()) * (0.55 + depth * 0.9),
      speed: lerp(spec.rainSpeed[0], spec.rainSpeed[1], rng()) * (0.5 + depth * 0.85),
      depth,
      alpha: 0.2 + depth * 0.55,
    }
  })
}

/** 雪花：近层大且快，远层小且淡；sway 控制左右摇摆幅度 */
export function makeFlakes(spec: AtmoSpec, vp: Viewport, seed = 11): Flake[] {
  const n = scaleCount(spec.snow, vp)
  const rng = seededRandom(seed)
  return Array.from({ length: n }, () => {
    const depth = rng()
    return {
      x: rng() * vp.w,
      y: rng() * vp.h,
      r: lerp(spec.snowSize[0], spec.snowSize[1], rng()) * (0.6 + depth * 0.8),
      speed: lerp(spec.snowSpeed[0], spec.snowSpeed[1], rng()) * (0.55 + depth * 0.8),
      sway: (8 + rng() * 26) * (0.5 + depth),
      phase: rng() * Math.PI * 2,
      depth,
      alpha: 0.35 + depth * 0.6,
    }
  })
}

/** 雾带：横向铺满的软边椭圆，靠位移漂移，比 DOM blur 横条更自然且零滤镜开销 */
export function makeFog(spec: AtmoSpec, vp: Viewport, seed = 13): FogBand[] {
  const n = spec.fog
  const rng = seededRandom(seed)
  return Array.from({ length: n }, (_, i) => ({
    y: vp.h * (0.42 + i * 0.14 + rng() * 0.04),
    h: vp.h * (0.1 + rng() * 0.12),
    alpha: spec.fogAlpha * (0.6 + rng() * 0.7),
    speed: 16 + rng() * 22,
    phase: rng() * Math.PI * 2,
  }))
}

/** 星空：仅夜晚上部 62% 区域；period/phase 决定闪烁节奏。
 *  半径下限从 0.5 提到 0.9 —— 之前在 DPR=1 显示器上是亚像素，肉眼几乎看不见。 */
export function makeStars(count: number, vp: Viewport, seed = 20260830): Star[] {
  const n = scaleCount(count, vp)
  const rng = seededRandom(seed)
  return Array.from({ length: n }, () => ({
    x: rng() * vp.w,
    y: rng() * vp.h * 0.62,
    r: 0.9 + rng() * 1.4,
    alpha: 0.5 + rng() * 0.5,
    period: 1.6 + rng() * 2.8,
    phase: rng() * Math.PI * 2,
  }))
}

export interface Atmosphere {
  spec: AtmoSpec
  light: LightSource
  /** 天体（太阳 / 月亮）；阴雨等看不见太阳的天气为 null —— 不画 */
  celestial: CelestialSpec | null
  drops: Drop[]
  flakes: Flake[]
  fog: FogBand[]
  stars: Star[]
  meteors: Meteor[]
}

/** 组装一帧场景所需的全部氛围数据（纯函数，同参数输出完全一致） */
export function sceneAtmosphere(weather: WeatherKind, seg: BootSegment, vp: Viewport): Atmosphere {
  const spec = ATMO_PRESETS[weather]
  const isNight = seg === 'night'
  // 天体只在晴 / 晴间少云出现：阴天雨天本就看不见太阳，画出来反而假
  const isClear = weather === 'clear' || weather === 'mostly-clear'
  return {
    spec,
    light: LIGHT_BY_SEGMENT[seg],
    celestial: isClear ? CELESTIAL_BY_SEGMENT[seg] : null,
    drops: makeDrops(spec, vp),
    flakes: makeFlakes(spec, vp),
    fog: makeFog(spec, vp),
    stars: isNight ? makeStars(spec.stars, vp) : [],
    meteors: isNight ? METEORS.map(m => ({ ...m })) : [],
  }
}
