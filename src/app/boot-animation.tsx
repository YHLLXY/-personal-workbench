import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  BOOT_PLAY_MS, BOOT_SEGMENTS, BOOT_WEATHERS, EXTRA_ELEMENTS, HERO_ENTER_DELAY_S, HERO_FLOAT_S, REPLAY_AFTER_HIDDEN_MS,
  SEGMENT_PALETTES, WEATHER_MOOD, heroOpacity, timeSegmentOf,
  type BootSegment,
} from './boot-scene'
import { resolveBootWeather } from './boot-weather'
import { weatherIconUrl } from '@/lib/weather-icons'
import { LIGHT_BY_SEGMENT } from './boot-atmosphere'
import BootAtmosphere from './boot-atmosphere-canvas'
import type { WeatherKind } from '@/lib/weather'
import { cn } from '@/lib/utils'
import './boot-animation.css'

/** 伴飞元素记号 → 实际图标（partly 按场景昼夜取变体；其余用通用图标，夜间靠滤镜压暗） */
function extraIconUrl(icon: string, isDay: boolean): string {
  if (icon === 'partly') return weatherIconUrl('partly', isDay)
  if (icon === 'rain') return weatherIconUrl('rain', true)
  if (icon === 'drizzle') return weatherIconUrl('drizzle', true)
  if (icon === 'snow') return weatherIconUrl('snow', true)
  if (icon === 'sleet') return weatherIconUrl('sleet', true)
  if (icon === 'thunder') return weatherIconUrl('thunder', true)
  return weatherIconUrl('overcast', true) // cloudy
}

/** E2E 测试钩子：设为 '1' 时整段跳过（不然每个用例都多等 3 秒） */
const E2E_SKIP_KEY = 'wb-boot-skip'

function shouldSkip(): boolean {
  try {
    if (localStorage.getItem(E2E_SKIP_KEY) === '1') return true
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch { return false }
}

/**
 * 启动进场动画（时间 × 天气驱动）。
 * 分层编排：天空先亮 → 环境氛围层（Canvas 双层景深）→ Meteocons 主角天气图标入场 → 远山 → 品牌。
 * 播放策略：每次冷启动播放；从后台恢复时，隐藏 ≥5 分钟才视为「重新打开」重播。
 * 点击任意处跳过（含天气未就绪的垫场天空）；系统减弱动态时整段跳过。
 * 天气来自 /api/weather（重庆），失败自动降级为纯时间场景。
 */
export default function BootAnimation() {
  const [disabled] = useState(shouldSkip)
  const [weather, setWeather] = useState<WeatherKind | null>(null)
  const [playing, setPlaying] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [runId, setRunId] = useState(0)
  const hiddenAt = useRef(0)
  // 预览钩子：?boot=dusk&wx=rain 强制指定时段与天气（调观感/截图用，不影响正常用户）
  const wxOverride = useMemo(() => {
    const wx = new URLSearchParams(window.location.search).get('wx')
    return (BOOT_WEATHERS as readonly string[]).includes(wx ?? '') ? (wx as WeatherKind) : null
  }, [])
  // 垫场时段：天气未就绪（≤600ms）先渲染该时段纯天空，避免先露出应用再突然切动画
  const seg = useMemo(() => {
    const q = new URLSearchParams(window.location.search)
    const boot = q.get('boot')
    return (BOOT_SEGMENTS as readonly string[]).includes(boot ?? '') ? (boot as BootSegment) : timeSegmentOf(new Date())
  }, [])

  useEffect(() => {
    if (disabled) return
    let on = true
    resolveBootWeather().then(kind => { if (on) setWeather(wxOverride ?? kind) })
    return () => { on = false }
  }, [disabled, wxOverride])

  // 淡出开始（播完或点击跳过）→ 0.65s 过渡结束后卸载；点击跳过因此真正提前离场
  const onDone = useCallback(() => setPlaying(false), [])
  useEffect(() => {
    if (!exiting) return
    const t = setTimeout(onDone, 680)
    return () => clearTimeout(t)
  }, [exiting, onDone])

  useEffect(() => {
    if (disabled) return
    const onVis = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt.current = Date.now()
      } else if (hiddenAt.current > 0 && Date.now() - hiddenAt.current >= REPLAY_AFTER_HIDDEN_MS) {
        hiddenAt.current = 0
        setRunId(n => n + 1) // key 变化 → 场景重挂载 → 重新取时刻与播放
        setExiting(false)
        setPlaying(true)
      }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [disabled])

  const onSkip = useCallback(() => setExiting(true), [])
  if (disabled || !playing) return null

  if (!weather) {
    return <div className={cn('boot', exiting && 'exiting')} style={skyVars(seg)} onPointerDown={onSkip} aria-hidden />
  }
  return <BootScene key={runId} seg={seg} weather={weather} exiting={exiting} onSkip={onSkip} />
}

function skyVars(seg: BootSegment): CSSProperties {
  const p = SEGMENT_PALETTES[seg]
  return { '--sky1': p.sky[0], '--sky2': p.sky[1], '--sky3': p.sky[2], '--sky4': p.sky[3] } as CSSProperties
}

function BootScene({ seg, weather, exiting, onSkip }: { seg: BootSegment; weather: WeatherKind; exiting: boolean; onSkip: () => void }) {
  const p = SEGMENT_PALETTES[seg]
  const mood = WEATHER_MOOD[weather]
  const isDay = seg !== 'night'
  // 统一光源：主角/伴飞的投影方向由时段光源决定，不再一律朝正下方（原来与太阳位置矛盾）
  const light = LIGHT_BY_SEGMENT[seg]

  useEffect(() => {
    const t = setTimeout(onSkip, BOOT_PLAY_MS)
    return () => clearTimeout(t)
  }, [onSkip])

  const vars = {
    ...skyVars(seg),
    '--tint': mood.tint,
    '--hill-far': p.hillFar, '--hill-near': p.hillNear,
    '--hero-opacity': heroOpacity(weather),
    '--hero-shadow-dx': `${light.shadowDx}px`,
    '--hero-shadow-dy': `${light.shadowDy}px`,
    '--cloud-shadow-dx': `${Math.round(light.shadowDx * 0.6)}px`,
    '--cloud-shadow-dy': `${Math.round(light.shadowDy * 0.6)}px`,
    '--light-glow': light.glow,
    ['--hero-enter-delay' as string]: `${HERO_ENTER_DELAY_S}s`,
    ['--hero-float-dur' as string]: `${HERO_FLOAT_S}s`,
  } as CSSProperties

  const isClear = weather === 'clear' || weather === 'mostly-clear'

  return (
    <div className={cn('boot', exiting && 'exiting')} style={vars} role="presentation" onPointerDown={onSkip}>
      {/* 镜头层：整场做极缓的推镜（1.05 → 1），给静态构图一点呼吸感 */}
      <div className="boot-camera">
        {/* 环境氛围层：双层 Canvas（远景在主角之下 / 近景在主角之上） */}
        <BootAtmosphere weather={weather} seg={seg} paused={exiting} />

        {seg === 'dawn' && <div className="boot-lighten" />}

        {/* 晴昼：光源处的柔光，位置与投影方向同源 */}
        {isClear && isDay && <div className="boot-halo" style={{ left: `${light.x - 18}%`, top: `${light.y - 26}%` }} />}
        {/* 晴昼：大太阳（Meteocons，自带光芒动画） */}
        {isClear && isDay && (
          <img src={weatherIconUrl('clear', true)} alt="" className="boot-big-sun" draggable={false} />
        )}
        {/* 夜晴：月亮（位置与夜间光源对齐） */}
        {isClear && !isDay && (
          <img src={weatherIconUrl('clear', false)} alt="" className="boot-big-moon" draggable={false} />
        )}

        {/* 主角：Meteocons 动画图标（自身带雨滴/雪花/闪电/光芒 SMIL 动画） */}
        {!isClear && (
          <div className={cn('boot-hero', seg === 'dusk' && 'is-dusk')}>
            <img src={weatherIconUrl(weather, isDay)} alt="" draggable={false} />
          </div>
        )}

        {/* 伴飞云层：视差深度（不同大小/透明度/速度反向漂移） */}
        <div className="boot-extras" aria-hidden>
          {EXTRA_ELEMENTS[weather].map((e, i) => (
            <img
              key={i}
              src={extraIconUrl(e.icon, isDay)}
              alt=""
              className="boot-extra"
              draggable={false}
              style={{
                left: `${e.left}%`, top: `${e.top}%`, width: `${e.size}vmin`,
                opacity: e.opacity * heroOpacity(weather),
                animationDuration: `${e.drift}s`,
                animationDelay: `${-i * 2.3}s`,
                filter: isDay ? undefined : 'brightness(0.6)',
              }}
            />
          ))}
        </div>

        <div className="boot-hill is-far" />
        <div className="boot-hill is-near" />
        <div className="boot-tint" />
        <div className="boot-vignette" />
      </div>

      {/* 品牌与提示放在镜头层之外，保证文字始终清晰 */}
      <div className="boot-brand" style={{ color: p.title }}>
        <img src="/icon.svg" alt="" width={52} height={52} />
        <h1>个人工作台</h1>
      </div>
      <div className="boot-skip">点击任意处跳过</div>
    </div>
  )
}
