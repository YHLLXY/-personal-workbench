import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  BOOT_PLAY_MS, BOOT_SEGMENTS, BOOT_WEATHERS, CLOUD_LAYOUTS, METEORS, REPLAY_AFTER_HIDDEN_MS, SEGMENT_PALETTES, WEATHER_DIM,
  makeClouds, makeParticles, makeStars, celestialOpacity, timeSegmentOf, type BootSegment, type BootWeather,
} from './boot-scene'
import { resolveBootWeather } from './boot-weather'
import { cn } from '@/lib/utils'
import './boot-animation.css'

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
 * 播放策略：每次冷启动播放；从后台恢复时，隐藏 ≥5 分钟才视为「重新打开」重播，
 * 短暂切窗口/切标签不重播。点击任意处跳过（含天气未就绪的垫场天空）；系统减弱动态时整段跳过。
 * 天气来自 /api/weather（重庆），失败自动降级为纯时间场景。
 */
export default function BootAnimation() {
  const [disabled] = useState(shouldSkip)
  const [weather, setWeather] = useState<BootWeather | null>(null)
  const [playing, setPlaying] = useState(true)
  const [exiting, setExiting] = useState(false)
  const [runId, setRunId] = useState(0)
  const hiddenAt = useRef(0)
  // 预览钩子：?boot=dusk&wx=rain 强制指定时段与天气（调观感/截图用，不影响正常用户）
  const preview = useMemo(() => {
    const q = new URLSearchParams(window.location.search)
    const seg = q.get('boot')
    const wx = q.get('wx')
    return {
      seg: (BOOT_SEGMENTS as readonly string[]).includes(seg ?? '') ? (seg as BootSegment) : null,
      wx: (BOOT_WEATHERS as readonly string[]).includes(wx ?? '') ? (wx as BootWeather) : null,
    }
  }, [])
  // 垫场时段：天气未就绪（≤600ms）先渲染该时段纯天空，避免先露出应用再突然切动画
  const seg = useMemo(
    () => (preview.seg ?? timeSegmentOf(new Date())),
    [preview.seg],
  )

  useEffect(() => {
    if (disabled) return
    let on = true
    resolveBootWeather().then(k => { if (on) setWeather(preview.wx ?? k) })
    return () => { on = false }
  }, [disabled, preview.wx])

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

function BootMoon() {
  return (
    <svg viewBox="0 0 64 64" className="boot-moon" aria-hidden>
      <defs>
        <mask id="boot-moon-mask">
          <rect width="64" height="64" fill="#fff" />
          <circle cx="43" cy="23" r="24" fill="#000" />
        </mask>
      </defs>
      <circle cx="30" cy="34" r="24" fill="var(--body-color)" mask="url(#boot-moon-mask)" />
    </svg>
  )
}

function cloudStyle(bg: string, c: { left: number; top: number; width: number; height: number; opacity: number; duration: number; delay: number }): CSSProperties {
  return {
    left: `${c.left}%`, top: `${c.top}%`, width: `${c.width}%`, height: `${c.height}px`,
    opacity: c.opacity, background: bg,
    ['--cdur' as string]: `${c.duration}s`, ['--cdelay' as string]: `${c.delay}s`,
  }
}

function BootScene({ seg, weather, exiting, onSkip }: { seg: BootSegment; weather: BootWeather; exiting: boolean; onSkip: () => void }) {
  const p = SEGMENT_PALETTES[seg]
  const dim = WEATHER_DIM[weather]

  useEffect(() => {
    const t = setTimeout(onSkip, BOOT_PLAY_MS)
    return () => clearTimeout(t)
  }, [onSkip])

  const stars = useMemo(() => (seg === 'night' ? makeStars(64, 20260830) : []), [seg])
  const clouds = useMemo(() => makeClouds(CLOUD_LAYOUTS[seg], 7), [seg])
  // 阴/雨/雪/雷/雾：顶部再压一层灰云盖
  const deck = weather === 'clear' || weather === 'partly'
    ? []
    : makeClouds([[-6, 3, 52, 12, 0.9], [38, 7, 46, 11, 0.85], [72, 2, 42, 12, 0.9]], 11)
  const drops = useMemo(() => (weather === 'rain' || weather === 'thunder' ? makeParticles(42, 3, { sizeMin: 14, sizeMax: 24, durMin: 0.55, durMax: 1 }) : []), [weather])
  const flakes = useMemo(() => (weather === 'snow' ? makeParticles(30, 5, { sizeMin: 2.5, sizeMax: 5, durMin: 2.6, durMax: 4.6 }) : []), [weather])

  // 阴天盖用中性灰（夜晚用暗蓝灰），其余云用时段调色板
  const deckBg = seg === 'night' ? 'linear-gradient(180deg, #232c49 0%, #171e38 100%)' : 'linear-gradient(180deg, #e3e7ee 0%, #b6bfce 100%)'

  const vars = {
    ...skyVars(seg),
    '--body-color': p.body, '--glow': p.glow,
    '--hill-far': p.hillFar, '--hill-near': p.hillNear,
    '--dim': dim,
    '--celestial-opacity': celestialOpacity(weather),
  } as CSSProperties

  return (
    <div className={cn('boot', exiting && 'exiting')} style={vars} role="presentation" onPointerDown={onSkip}>
      {seg === 'dawn' && <div className="boot-lighten" />}
      {seg === 'night' && (
        <div className="boot-stars" aria-hidden>
          {stars.map((s, i) => (
            <i key={i} style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, opacity: s.opacity, animationDuration: `${s.duration}s`, animationDelay: `${s.delay}s` }} />
          ))}
        </div>
      )}

      <div className={cn('boot-celestial', `is-${seg}`)}>
        <div className="boot-glow" />
        {seg === 'noon' && <div className="boot-rays" />}
        {seg === 'night' ? <BootMoon /> : <div className="boot-sun" />}
      </div>

      {seg === 'night' && METEORS.map((m, i) => (
        <i key={i} className="boot-meteor" style={{ left: `${m.left}%`, top: `${m.top}%`, width: m.length, animationDelay: `${m.delay}s` }} />
      ))}

      <div className="boot-clouds">
        {clouds.map((c, i) => <i key={i} className="boot-cloud" style={cloudStyle(p.cloud, c)} />)}
        {deck.map((c, i) => <i key={`d${i}`} className="boot-cloud" style={cloudStyle(deckBg, c)} />)}
      </div>

      <div className="boot-hill is-far" />
      <div className="boot-hill is-near" />
      <div className="boot-dim" />

      {drops.length > 0 && (
        <div className="boot-rain" aria-hidden>
          {drops.map((d, i) => (
            <i key={i} style={{ left: `${d.left}%`, height: d.size, opacity: d.opacity, animationDuration: `${d.duration}s`, animationDelay: `${d.delay}s` }} />
          ))}
        </div>
      )}
      {flakes.length > 0 && (
        <div className="boot-snow" aria-hidden>
          {flakes.map((f, i) => (
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
