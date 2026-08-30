import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  BOOT_PLAY_MS, BOOT_SEGMENTS, BOOT_WEATHERS, EXTRA_ELEMENTS, HERO_ENTER_DELAY_S, HERO_FLOAT_S, METEORS, REPLAY_AFTER_HIDDEN_MS,
  SEGMENT_PALETTES, WEATHER_MOOD, heroOpacity, makeParticles, makeStars, timeSegmentOf,
  type BootSegment,
} from './boot-scene'
import { resolveBootWeather } from './boot-weather'
import { weatherIconUrl } from '@/lib/weather-icons'
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
 * 分层编排：天空先亮 → Meteocons 主角天气图标入场 → 夜晚星空/流星 → 全屏天气氛围层 → 品牌。
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

function cloudStyle(bg: string, c: { left: number; top: number; width: number; height: number; opacity: number; duration: number; delay: number }): CSSProperties {
  return {
    left: `${c.left}%`, top: `${c.top}%`, width: `${c.width}%`, height: `${c.height}px`,
    opacity: c.opacity, background: bg,
    ['--cdur' as string]: `${c.duration}s`, ['--cdelay' as string]: `${c.delay}s`,
  }
}

function BootScene({ seg, weather, exiting, onSkip }: { seg: BootSegment; weather: WeatherKind; exiting: boolean; onSkip: () => void }) {
  const p = SEGMENT_PALETTES[seg]
  const mood = WEATHER_MOOD[weather]
  const isDay = seg !== 'night'

  useEffect(() => {
    const t = setTimeout(onSkip, BOOT_PLAY_MS)
    return () => clearTimeout(t)
  }, [onSkip])

  const stars = useMemo(() => (seg === 'night' ? makeStars(64, 20260830) : []), [seg])
  // 大雨/雷/大雪：主角云之外的全屏增强层（小雨/毛毛雨只靠主角图标自身的雨滴动画）
  const boostDrops = weather === 'heavy-rain' || weather === 'thunder'
    ? makeParticles(46, 3, { sizeMin: 14, sizeMax: 24, durMin: 0.55, durMax: 1 })
    : weather === 'rain' ? makeParticles(20, 3, { sizeMin: 12, sizeMax: 20, durMin: 0.7, durMax: 1.2 }) : []
  const boostFlakes = weather === 'heavy-snow'
    ? makeParticles(34, 5, { sizeMin: 2.5, sizeMax: 5, durMin: 2.6, durMax: 4.6 })
    : weather === 'snow' ? makeParticles(14, 5, { sizeMin: 2, sizeMax: 4, durMin: 3.2, durMax: 5.2 }) : []

  const vars = {
    ...skyVars(seg),
    '--tint': mood.tint,
    '--hill-far': p.hillFar, '--hill-near': p.hillNear,
    '--hero-opacity': heroOpacity(weather),
    ['--hero-enter-delay' as string]: `${HERO_ENTER_DELAY_S}s`,
    ['--hero-float-dur' as string]: `${HERO_FLOAT_S}s`,
  } as CSSProperties

  return (
    <div className={cn('boot', exiting && 'exiting')} style={vars} role="presentation" onPointerDown={onSkip}>
      {seg === 'dawn' && <div className="boot-lighten" />}
      {seg === 'night' && (
        <div className="boot-stars" aria-hidden>
          {stars.map((s, i) => (
            <i key={i} className="boot-star" style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, opacity: s.opacity, animationDuration: `${s.duration}s`, animationDelay: `${s.delay}s` }} />
          ))}
          {METEORS.map((m, i) => (
            <i key={`m${i}`} className="boot-meteor" style={{ left: `${m.left}%`, top: `${m.top}%`, width: m.length, animationDelay: `${m.delay}s` }} />
          ))}
        </div>
      )}

      {/* 晴昼：主角背后的旋转光晕（ray halo），强化「释放强光」 */}
      {(weather === 'clear' || weather === 'mostly-clear') && isDay && <div className="boot-halo" />}
      {/* 晴昼：左上大太阳（Meteocons，自带光芒动画） */}
      {(weather === 'clear' || weather === 'mostly-clear') && isDay && (
        <img src={weatherIconUrl('clear', true)} alt="" className="boot-big-sun" draggable={false} />
      )}
      {/* 夜晴：右上月亮 */}
      {(weather === 'clear' || weather === 'mostly-clear') && !isDay && (
        <img src={weatherIconUrl('clear', false)} alt="" className="boot-big-moon" draggable={false} />
      )}

      {/* 主角：Meteocons 动画图标（自身带雨滴/雪花/闪电/光芒 SMIL 动画） */}
      {!(weather === 'clear' || weather === 'mostly-clear') && (
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

      {/* 高空雾云带（极低透明度做纵深，不再是实心横条） */}
      {seg !== 'night' && (
        <div className="boot-haze" aria-hidden>
          <i style={{ ...cloudStyle('linear-gradient(90deg, transparent, rgb(255 255 255 / 0.16) 30% 70%, transparent)', { left: 4, top: 16, width: 40, height: 26, opacity: 1, duration: 9, delay: -3 }) }} />
          <i style={{ ...cloudStyle('linear-gradient(90deg, transparent, rgb(255 255 255 / 0.13) 30% 70%, transparent)', { left: 58, top: 26, width: 44, height: 30, opacity: 1, duration: 11, delay: -7 }) }} />
        </div>
      )}

      <div className="boot-hill is-far" />
      <div className="boot-hill is-near" />
      <div className="boot-tint" />
      <div className="boot-vignette" />

      {boostDrops.length > 0 && (
        <div className="boot-rain" aria-hidden>
          {boostDrops.map((d, i) => (
            <i key={i} style={{ left: `${d.left}%`, height: d.size, opacity: d.opacity, animationDuration: `${d.duration}s`, animationDelay: `${d.delay}s` }} />
          ))}
        </div>
      )}
      {boostFlakes.length > 0 && (
        <div className="boot-snow" aria-hidden>
          {boostFlakes.map((f, i) => (
            <i key={i} className={`sway-${f.drift}`} style={{ left: `${f.left}%`, width: f.size, height: f.size, opacity: f.opacity, animationDuration: `${f.duration}s`, animationDelay: `${f.delay}s` }} />
          ))}
        </div>
      )}
      {weather === 'fog' && <div className="boot-fog" aria-hidden><i /><i /><i /></div>}
      {weather === 'thunder' && <div className="boot-flash" />}

      <div className="boot-brand" style={{ color: p.title }}>
        <img src="/icon.svg" alt="" width={52} height={52} />
        <h1>个人工作台</h1>
      </div>
      <div className="boot-skip">点击任意处跳过</div>
    </div>
  )
}
