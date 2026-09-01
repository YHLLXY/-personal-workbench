/**
 * 启动动画的纯逻辑层：时段判定、天气种类、四场景调色板、天气叠加参数、粒子生成。
 * 全部是可单测的纯函数/常量；组件层（boot-animation.tsx）只做渲染与交互。
 * 天气种类映射与解析在 src/lib/weather.ts（与天气卡共用）。
 */
import type { WeatherKind } from '@/lib/weather'

export type BootSegment = 'dawn' | 'noon' | 'dusk' | 'night'

/** 预览钩子（?boot=dusk&wx=rain 强制指定时段/天气）与测试用 */
export const BOOT_SEGMENTS: readonly BootSegment[] = ['dawn', 'noon', 'dusk', 'night']
export const BOOT_WEATHERS: readonly WeatherKind[] = [
  'clear', 'mostly-clear', 'partly', 'overcast', 'fog',
  'drizzle', 'rain', 'heavy-rain', 'sleet', 'snow', 'heavy-snow', 'thunder',
]

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
  /** 远山两层颜色 */
  hillFar: string
  hillNear: string
  /** 品牌文字颜色 */
  title: string
}

/** 四时段场景调色板：调观感只改这张表（天体/天气图标来自 Meteocons 资产） */
export const SEGMENT_PALETTES: Record<BootSegment, ScenePalette> = {
  dawn: {
    sky: ['#1d2a52', '#5c5a92', '#d97f6a', '#ffd9a3'],
    hillFar: '#3a3550',
    hillNear: '#262338',
    title: '#ffffff',
  },
  noon: {
    sky: ['#1663c7', '#4d9ae9', '#a5d3f7', '#eaf7ff'],
    hillFar: '#5d7f9e',
    hillNear: '#33526b',
    title: '#ffffff',
  },
  dusk: {
    sky: ['#2f2350', '#8f3660', '#e05f38', '#ffb168'],
    hillFar: '#3c2440',
    hillNear: '#221428',
    title: '#fff3e8',
  },
  night: {
    sky: ['#04070f', '#0a1226', '#15224a', '#27395f'],
    hillFar: '#0b1128',
    hillNear: '#050810',
    title: '#e8edf8',
  },
}

/** 恶劣天气的整体气氛：压暗系数 + 天空染色（rgba 叠加层，改变天空「天气感」而非只加黑） */
export interface WeatherMood { dim: number; tint: string }
export const WEATHER_MOOD: Record<WeatherKind, WeatherMood> = {
  'clear': { dim: 0, tint: 'transparent' },
  'mostly-clear': { dim: 0, tint: 'transparent' },
  'partly': { dim: 0.04, tint: 'transparent' },
  'overcast': { dim: 0.22, tint: 'rgba(96, 108, 128, 0.42)' },
  'fog': { dim: 0.2, tint: 'rgba(190, 198, 212, 0.38)' },
  'drizzle': { dim: 0.26, tint: 'rgba(72, 88, 114, 0.4)' },
  'rain': { dim: 0.34, tint: 'rgba(52, 68, 96, 0.46)' },
  'heavy-rain': { dim: 0.46, tint: 'rgba(36, 50, 76, 0.55)' },
  'sleet': { dim: 0.34, tint: 'rgba(88, 100, 122, 0.45)' },
  'snow': { dim: 0.22, tint: 'rgba(196, 208, 226, 0.34)' },
  'heavy-snow': { dim: 0.32, tint: 'rgba(170, 184, 206, 0.46)' },
  'thunder': { dim: 0.5, tint: 'rgba(28, 36, 58, 0.58)' },
}

/** 恶劣天气下主角图标的减淡（dim 越大越隐没）；tint 型天气（雪/雾）不减。
 *  下限由 0.35 提到 0.55：原版在 canvas 粒子层提上来后，主角过淡会与环境层混在一起"洗"掉 */
export function heroOpacity(kind: WeatherKind): number {
  return Math.max(0.55, 1 - WEATHER_MOOD[kind].dim * 1.05)
}

/** 主角图标入场：延迟与浮动幅度由场景统一编排（秒） */
export const HERO_ENTER_DELAY_S = 0.15
export const HERO_FLOAT_S = 4.2

/** 伴飞元素：主角之外的第二/第三层云（视差深度感）。icon 是图标名记号，组件层解析昼夜变体 */
export interface ExtraEl { icon: 'cloudy' | 'partly' | 'drizzle' | 'rain' | 'snow' | 'sleet' | 'thunder'; left: number; top: number; size: number; opacity: number; drift: number }

/** 每种天气的伴飞云层配置（left/top %，size vmin，drift 秒）。晴留一朵远云，阴雨雪给足层次 */
export const EXTRA_ELEMENTS: Record<WeatherKind, ExtraEl[]> = {
  'clear': [{ icon: 'partly', left: 8, top: 60, size: 17, opacity: 0.4, drift: 13 }],
  'mostly-clear': [{ icon: 'partly', left: 78, top: 56, size: 14, opacity: 0.38, drift: 12 }],
  'partly': [
    { icon: 'cloudy', left: -4, top: 60, size: 23, opacity: 0.55, drift: 12 },
    { icon: 'cloudy', left: 74, top: 18, size: 14, opacity: 0.42, drift: 9 },
  ],
  'overcast': [
    { icon: 'cloudy', left: -6, top: 52, size: 34, opacity: 0.7, drift: 10 },
    { icon: 'cloudy', left: 66, top: 10, size: 24, opacity: 0.55, drift: 14 },
    { icon: 'cloudy', left: 74, top: 46, size: 18, opacity: 0.45, drift: 8 },
  ],
  'fog': [{ icon: 'cloudy', left: 58, top: 30, size: 20, opacity: 0.3, drift: 12 }],
  'drizzle': [
    { icon: 'drizzle', left: 66, top: 14, size: 20, opacity: 0.55, drift: 11 },
    { icon: 'cloudy', left: -4, top: 58, size: 22, opacity: 0.45, drift: 13 },
  ],
  'rain': [
    { icon: 'rain', left: 66, top: 12, size: 22, opacity: 0.55, drift: 11 },
    { icon: 'cloudy', left: -6, top: 56, size: 24, opacity: 0.45, drift: 13 },
  ],
  'heavy-rain': [
    { icon: 'rain', left: 68, top: 10, size: 24, opacity: 0.6, drift: 9 },
    { icon: 'rain', left: -8, top: 54, size: 20, opacity: 0.5, drift: 12 },
    { icon: 'cloudy', left: 30, top: 20, size: 16, opacity: 0.38, drift: 10 },
  ],
  'sleet': [
    { icon: 'sleet', left: 66, top: 14, size: 20, opacity: 0.5, drift: 11 },
    { icon: 'cloudy', left: -6, top: 56, size: 20, opacity: 0.42, drift: 13 },
  ],
  'snow': [
    { icon: 'snow', left: 66, top: 12, size: 22, opacity: 0.5, drift: 11 },
    { icon: 'cloudy', left: -6, top: 56, size: 22, opacity: 0.42, drift: 13 },
  ],
  'heavy-snow': [
    { icon: 'snow', left: 68, top: 10, size: 24, opacity: 0.55, drift: 9 },
    { icon: 'snow', left: -8, top: 54, size: 20, opacity: 0.45, drift: 12 },
  ],
  'thunder': [
    { icon: 'thunder', left: 66, top: 12, size: 24, opacity: 0.55, drift: 10 },
    { icon: 'cloudy', left: -8, top: 56, size: 24, opacity: 0.45, drift: 12 },
  ],
}

/** mulberry32 种子随机：粒子布局每次挂载完全一致（StrictMode 双挂载/E2E 都稳定）。
 *  环境粒子生成已迁至 boot-atmosphere.ts（Canvas 版），本函数被其复用。 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 播放节奏（ms）：主动画 → 开始淡出（组件内卸载 = 开始淡出后 680ms） */
export const BOOT_PLAY_MS = 3000
/** 从后台恢复时，隐藏超过该时长才视为「重新打开」并重播（短暂切窗口不重播） */
export const REPLAY_AFTER_HIDDEN_MS = 5 * 60_000
