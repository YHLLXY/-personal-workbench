/**
 * 启动动画的纯逻辑层：时段判定、天气种类、四场景调色板、粒子生成。
 * 全部是可单测的纯函数/常量；组件层（boot-animation.tsx）只做渲染与交互。
 */

export type BootSegment = 'dawn' | 'noon' | 'dusk' | 'night'
export type BootWeather = 'clear' | 'partly' | 'overcast' | 'rain' | 'snow' | 'fog' | 'thunder'

/** 预览钩子（?boot=dusk&wx=rain 强制指定时段/天气）与测试用 */
export const BOOT_SEGMENTS: readonly BootSegment[] = ['dawn', 'noon', 'dusk', 'night']
export const BOOT_WEATHERS: readonly BootWeather[] = ['clear', 'partly', 'overcast', 'rain', 'snow', 'fog', 'thunder']

/** 四段划分（本地时刻）：清晨 5–9 / 正午 9–15 / 黄昏 15–19 / 夜晚 19–5，左闭右开 */
export const SEGMENT_BOUNDS = { dawnStart: 5, noonStart: 9, duskStart: 15, nightStart: 19 } as const

export function timeSegmentOf(now: Date): BootSegment {
  const h = now.getHours()
  if (h >= SEGMENT_BOUNDS.dawnStart && h < SEGMENT_BOUNDS.noonStart) return 'dawn'
  if (h >= SEGMENT_BOUNDS.noonStart && h < SEGMENT_BOUNDS.duskStart) return 'noon'
  if (h >= SEGMENT_BOUNDS.duskStart && h < SEGMENT_BOUNDS.nightStart) return 'dusk'
  return 'night'
}

export interface ScenePalette {
  /** 天空渐变（顶 → 地平线），4 个色标 */
  sky: [string, string, string, string]
  /** 天体（太阳/月亮）主色与光晕 */
  body: string
  glow: string
  /** 云的基色 / 黄昏云的染色（rgba） */
  cloud: string
  cloudTint?: string
  /** 远山两层颜色 */
  hillFar: string
  hillNear: string
  /** 品牌文字颜色 */
  title: string
}

/** 四时段场景调色板：调观感只改这张表 */
export const SEGMENT_PALETTES: Record<BootSegment, ScenePalette> = {
  dawn: {
    sky: ['#1d2a52', '#5c5a92', '#d97f6a', '#ffd9a3'],
    body: '#ffdf8f',
    glow: 'rgba(255, 196, 118, 0.65)',
    cloud: 'linear-gradient(180deg, #fdf3e7 0%, #f3d9c4 100%)',
    hillFar: '#3a3550',
    hillNear: '#262338',
    title: '#ffffff',
  },
  noon: {
    sky: ['#1663c7', '#4d9ae9', '#a5d3f7', '#eaf7ff'],
    body: '#fff6d8',
    glow: 'rgba(255, 244, 200, 0.8)',
    cloud: 'linear-gradient(180deg, #ffffff 0%, #e8f2fb 100%)',
    hillFar: '#5d7f9e',
    hillNear: '#33526b',
    title: '#ffffff',
  },
  dusk: {
    sky: ['#2f2350', '#8f3660', '#e05f38', '#ffb168'],
    body: '#ffb45e',
    glow: 'rgba(255, 132, 60, 0.7)',
    cloud: 'linear-gradient(180deg, #ffc9a0 0%, #e87a6a 100%)',
    hillFar: '#3c2440',
    hillNear: '#221428',
    title: '#fff3e8',
  },
  night: {
    sky: ['#04070f', '#0a1226', '#15224a', '#27395f'],
    body: '#eef2fa',
    glow: 'rgba(210, 225, 255, 0.5)',
    cloud: 'linear-gradient(180deg, #2a3352 0%, #1b2340 100%)',
    hillFar: '#0b1128',
    hillNear: '#050810',
    title: '#e8edf8',
  },
}

/** 雨/雪/雷暴/阴天的整体压暗与天体减弱（叠在场景上的气氛系数） */
export const WEATHER_DIM: Record<BootWeather, number> = {
  clear: 0,
  partly: 0,
  overcast: 0.28,
  rain: 0.4,
  snow: 0.35,
  fog: 0.3,
  thunder: 0.52,
}

/** 恶劣天气下天体（日/月）的减淡系数：dim 越大天体越隐没 */
export function celestialOpacity(weather: BootWeather): number {
  return Math.max(0.3, 1 - WEATHER_DIM[weather] * 1.1)
}

/** mulberry32 种子随机：粒子布局每次挂载完全一致（StrictMode 双挂载/E2E 都稳定） */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface ParticleSpec { left: number; top: number; size: number; opacity: number; duration: number; delay: number; drift: number }

/** 星星（夜晚）：top 限定在天空上部 65% */
export function makeStars(count: number, seed: number): ParticleSpec[] {
  const rng = seededRandom(seed)
  return Array.from({ length: count }, () => ({
    left: rng() * 100,
    top: rng() * 65,
    size: 1 + rng() * 1.6,
    opacity: 0.35 + rng() * 0.6,
    duration: 1.6 + rng() * 2.8,
    delay: rng() * 3,
    drift: 0,
  }))
}

/** 雨/雪粒子：swayVariant 选雨丝倾角或雪花摆动曲线 */
export function makeParticles(count: number, seed: number, opts: { sizeMin: number; sizeMax: number; durMin: number; durMax: number }): ParticleSpec[] {
  const rng = seededRandom(seed)
  return Array.from({ length: count }, () => ({
    left: rng() * 104 - 2,
    top: -5 - rng() * 20,
    size: opts.sizeMin + rng() * (opts.sizeMax - opts.sizeMin),
    opacity: 0.35 + rng() * 0.55,
    duration: opts.durMin + rng() * (opts.durMax - opts.durMin),
    delay: rng() * 1.4,
    drift: Math.floor(rng() * 3),
  }))
}

export interface CloudSpec { left: number; top: number; width: number; height: number; opacity: number; duration: number; delay: number }

/** 云：ranges 限定漂移区域（percent），sizeRange 决定云团大小 */
export function makeClouds(specs: Array<[left: number, top: number, width: number, height: number, opacity: number]>, seed: number): CloudSpec[] {
  const rng = seededRandom(seed)
  return specs.map(([left, top, width, height, opacity]) => ({
    left, top, width, height, opacity,
    duration: 6 + rng() * 5,
    delay: -rng() * 6,
  }))
}

/**
 * 每个时段的云布局（相对全屏 percent）。
 * dawn 特意在地平线中部留「云洞」：太阳从缺口升起。
 */
export const CLOUD_LAYOUTS: Record<BootSegment, Array<[number, number, number, number, number]>> = {
  dawn: [
    [-4, 46, 38, 13, 0.95], [26, 44, 18, 10, 0.85], // 左侧云墙（留缺口）
    [66, 45, 40, 14, 0.95], [50, 47, 14, 8, 0.8],   // 右侧云墙
    [14, 26, 22, 8, 0.45], [78, 20, 18, 7, 0.4],    // 高空薄云
  ],
  noon: [
    [8, 12, 26, 9, 0.9], [64, 20, 30, 10, 0.8], [38, 30, 20, 7, 0.55],
  ],
  dusk: [
    [-2, 34, 34, 12, 0.95], [30, 30, 26, 10, 0.85], [58, 36, 30, 11, 0.9], [84, 28, 22, 9, 0.8], [18, 16, 20, 7, 0.5],
  ],
  night: [
    [6, 14, 24, 8, 0.5], [70, 26, 28, 9, 0.4],
  ],
}

/** 流星参数（夜晚彩蛋）：出现延迟与起点，2 颗错开 */
export const METEORS = [
  { delay: 0.5, left: 72, top: 8, length: 110 },
  { delay: 1.45, left: 38, top: 4, length: 90 },
] as const

/** 播放节奏（ms）：主动画 → 开始淡出 → 卸载 */
export const BOOT_PLAY_MS = 2600
export const BOOT_FADE_MS = 650
/** 从后台恢复时，隐藏超过该时长才视为「重新打开」并重播（短暂切窗口不重播） */
export const REPLAY_AFTER_HIDDEN_MS = 5 * 60_000
