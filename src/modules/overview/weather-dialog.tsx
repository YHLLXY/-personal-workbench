import { useMemo } from 'react'
import { Droplets, Leaf, SunMedium, Thermometer, Umbrella, Wind } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  WEATHER_LABELS, aqiLabel, hhmm, sunProgress, uvLabel, type DailyForecast, type WeatherKind, type WeatherNow,
} from '@/lib/weather'
import { weatherIconUrl } from '@/lib/weather-icons'
import { CHONGQING, moonIllumination, moonPhaseName, moonProgress, moonTimes } from '@/lib/moon'
import { useWeatherQuery } from './weather-data'
import { cn } from '@/lib/utils'
import './weather-dialog.css'

/** 弹窗场景头的天空渐变（kind × 昼夜）——比启动动画调色板灰一档，避免盖过内容 */
const SCENE_SKY: Record<WeatherKind, { day: [string, string, string]; night: [string, string, string] }> = {
  'clear': { day: ['#1663c7', '#4d9ae9', '#a5d3f7'], night: ['#04070f', '#0a1226', '#15224a'] },
  'mostly-clear': { day: ['#1f66c4', '#5495e2', '#abd2f4'], night: ['#050914', '#0c1428', '#17244a'] },
  'partly': { day: ['#1f5fb8', '#5b95dd', '#b7d9f4'], night: ['#050914', '#0d1730', '#1a2a52'] },
  'overcast': { day: ['#5a6b85', '#8d9cb4', '#c3cddc'], night: ['#0b0f1a', '#1a2233', '#2c3a52'] },
  'fog': { day: ['#6b7a92', '#9aa6ba', '#ccd5e3'], night: ['#0d1220', '#1c2436', '#323e56'] },
  'drizzle': { day: ['#42506b', '#6d7f9c', '#a9b9ce'], night: ['#080d18', '#151d30', '#28324a'] },
  'rain': { day: ['#3a4a63', '#5f7391', '#9db0c8'], night: ['#070c16', '#131b2c', '#242e46'] },
  'heavy-rain': { day: ['#2e3c54', '#4f6380', '#8ba0bb'], night: ['#060a13', '#101827', '#202a40'] },
  'sleet': { day: ['#4a5871', '#75869f', '#aebccc'], night: ['#090e19', '#161f31', '#27334b'] },
  'snow': { day: ['#5f7189', '#8b9bb1', '#c6d1e0'], night: ['#0a0f1c', '#171f31', '#2a354d'] },
  'heavy-snow': { day: ['#556680', '#8091a9', '#bfcadb'], night: ['#0a0f1b', '#161e30', '#29344c'] },
  'thunder': { day: ['#232d45', '#3c4a66', '#6b7c9a'], night: ['#05070f', '#0d1220', '#1b2338'] },
}

/** 逐小时条上的昼夜判定（图标昼夜变体用） */
function hourIsDay(hourLabel: string): boolean {
  const h = Number(hourLabel)
  return h >= 6 && h < 19
}

export function WeatherDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data } = useWeatherQuery()
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-[27rem] gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-[27rem]">
        {data ? (
          <>
            <SceneHeader w={data} />
            <div className="max-h-[52dvh] space-y-5 overflow-y-auto p-4">
              <SunArc today={data.daily[0]} />
              <MoonArc />
              <DetailChips w={data} />
              <HourlyStrip w={data} />
              <WeekList w={data} />
            </div>
          </>
        ) : (
          <div className="space-y-3 p-4">
            <Skeleton className="h-36 w-full rounded-2xl" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-24 w-full" />
            <p className="text-center text-xs text-muted-foreground">天气加载中…</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** 场景头：按当前天气绘制天空 + 点缀，叠城市/温度信息 */
function SceneHeader({ w }: { w: WeatherNow }) {
  const sky = SCENE_SKY[w.kind][w.isDay ? 'day' : 'night']
  const today = w.daily[0]
  const isRainy = w.kind === 'drizzle' || w.kind === 'rain' || w.kind === 'heavy-rain' || w.kind === 'thunder'
  const isSnowy = w.kind === 'snow' || w.kind === 'heavy-snow' || w.kind === 'sleet'
  const isCloudy = w.kind === 'overcast' || w.kind === 'partly' || isRainy || isSnowy
  return (
    <div className="relative h-44 overflow-hidden" style={{ background: `linear-gradient(160deg, ${sky[0]} 0%, ${sky[1]} 55%, ${sky[2]} 100%)` }}>
      {/* 晴夜：星空 + 右上月亮 */}
      {(w.kind === 'clear' || w.kind === 'mostly-clear') && !w.isDay && (
        <>
          <SceneStars />
          <img src={weatherIconUrl('clear', false)} alt="" className="absolute -right-2 -top-2 size-28 opacity-95" draggable={false} />
        </>
      )}
      {/* 晴昼：左上大太阳（Meteocons，自带光芒动画） */}
      {(w.kind === 'clear' || w.kind === 'mostly-clear') && w.isDay && (
        <img src={weatherIconUrl('clear', true)} alt="" className="absolute -left-4 -top-4 size-32 opacity-95" draggable={false} />
      )}
      {/* 多云/阴/雨雪：右上主角图标 + 漂移云影 */}
      {isCloudy && (
        <>
          <img src={weatherIconUrl(w.kind, w.isDay)} alt="" className="absolute -right-3 -top-2 size-32" draggable={false} />
          <i className="wd-cloud" style={{ left: '12%', top: '58%', width: 130, height: 34, opacity: w.isDay ? 0.5 : 0.22, animationDuration: '11s' }} />
          <i className="wd-cloud" style={{ left: '48%', top: '72%', width: 90, height: 26, opacity: w.isDay ? 0.4 : 0.16, animationDuration: '8s', animationDelay: '-3s' }} />
        </>
      )}
      {/* 雨：雨丝层 */}
      {isRainy && <SceneRain dense={w.kind === 'heavy-rain' || w.kind === 'thunder'} />}
      {/* 雪/雨夹雪：雪花层 */}
      {isSnowy && <SceneSnow />}
      {/* 雾：雾带 */}
      {w.kind === 'fog' && (<><i className="wd-fog" style={{ top: '52%' }} /><i className="wd-fog" style={{ top: '74%', animationDelay: '-3s' }} /></>)}
      {/* 底部信息 */}
      <div className="absolute inset-x-0 bottom-0 flex items-end justify-between bg-gradient-to-t from-black/35 to-transparent p-4 pt-8 text-white">
        <div>
          <p className="text-[11px] opacity-85">重庆 · {WEATHER_LABELS[w.kind]}</p>
          <p className="text-4xl font-extrabold font-numeric leading-tight">{w.temperature ?? '--'}°</p>
        </div>
        <div className="text-right text-[11px] opacity-90 font-numeric">
          {today && <p>最高 {today.max ?? '--'}° · 最低 {today.min ?? '--'}°</p>}
          {w.apparent != null && <p>体感 {w.apparent}°</p>}
        </div>
      </div>
    </div>
  )
}

function SceneStars() {
  const stars = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left: (i * 61) % 100, top: (i * 37) % 55, size: i % 4 === 0 ? 2 : 1.3, delay: (i % 7) * 0.4,
  })), [])
  return (
    <>
      {stars.map((s, i) => (
        <i key={i} className="wd-star" style={{ left: `${s.left}%`, top: `${s.top}%`, width: s.size, height: s.size, animationDelay: `${s.delay}s` }} />
      ))}
    </>
  )
}

function SceneRain({ dense }: { dense: boolean }) {
  const drops = useMemo(() => Array.from({ length: dense ? 26 : 14 }, (_, i) => ({
    left: ((i * 137) % 104) - 2, dur: 0.8 + ((i * 7) % 5) * 0.12, delay: ((i * 13) % 10) * 0.14, h: 12 + ((i * 11) % 3) * 5,
  })), [dense])
  return (
    <>
      {drops.map((d, i) => (
        <i key={i} className="wd-drop" style={{ left: `${d.left}%`, height: d.h, animationDuration: `${d.dur}s`, animationDelay: `-${d.delay}s` }} />
      ))}
    </>
  )
}

function SceneSnow() {
  const flakes = useMemo(() => Array.from({ length: 16 }, (_, i) => ({
    left: (i * 149) % 100, size: 2.5 + (i % 3), dur: 3.4 + ((i * 7) % 5) * 0.6, delay: -((i * 13) % 10) * 0.5, sway: i % 3,
  })), [])
  return (
    <>
      {flakes.map((f, i) => (
        <i key={i} className={`wd-flake sway-${f.sway}`} style={{ left: `${f.left}%`, width: f.size, height: f.size, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }} />
      ))}
    </>
  )
}

/** 日出/日落端点标记：地平线上的半日 + 上/下箭头（按参考图手写，约 400B，随主题色，不引图标库） */
function RiseSetGlyph({ dir, className }: { dir: 'rise' | 'set'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'rise'
        ? <><path d="M12 2.6v4.8" /><path d="m9.6 5 2.4-2.4L14.4 5" /></>
        : <><path d="M12 7.4V2.6" /><path d="m9.6 5 2.4 2.4L14.4 5" /></>}
      <path d="M5.4 18.4a6.6 6.6 0 0 1 13.2 0" />
      <path d="M3 18.4h18" />
    </svg>
  )
}

/** 太阳：实心圆 + 8 道短光线 */
function SunGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
      <circle cx="12" cy="12" r="4.4" fill="currentColor" stroke="none" />
      <path d="M12 2.2v2.4M12 19.4v2.4M2.2 12h2.4M19.4 12h2.4M5.1 5.1l1.7 1.7M17.2 17.2l1.7 1.7M18.9 5.1l-1.7 1.7M6.8 17.2l-1.7 1.7" />
    </svg>
  )
}

/** 日出日落：轨道以太阳位置为界分两段——已过去的白天暗淡、未到来的白天暖色高亮，太阳正好坐在交界处。
 *  v1.26 重做。旧版四个问题：① 彩色 meteocons 太阳压在「琥珀→蓝→琥珀」全天彩虹渐变轨道上，两种饱和色打架；
 *  ② 抬升只有 sin×10px，看起来不是划弧而是没对齐；③ h-2 轨道配 size-7 图标头重脚轻；
 *  ④ left: calc(t% - 14px) 在 t=0/1 时把太阳甩出容器半个身位。
 *  新版：轨道两侧留半个太阳宽度的内边距（px-3），太阳用 left:t% + translateX(-50%)，两端自然收在轨道内。 */
function SunArc({ today }: { today?: DailyForecast }) {
  const p = sunProgress(today?.sunrise, today?.sunset)
  if (!today?.sunrise || !today?.sunset || !p) return null
  const { t, inDay } = p
  const pct = (t * 100).toFixed(2) + '%'
  return (
    <section>
      <h3 className="mb-3 text-xs font-medium text-muted-foreground">日出日落</h3>
      {/* 上排：图标 + 标签，两端对齐 */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-center gap-1">
          <RiseSetGlyph dir="rise" className="size-6 text-amber-500 dark:text-amber-300" />
          <span className="text-[11px] text-muted-foreground">日出</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <RiseSetGlyph dir="set" className="size-6 text-amber-500/70 dark:text-amber-300/60" />
          <span className="text-[11px] text-muted-foreground">日落</span>
        </div>
      </div>
      {/* 中排：轨道。px-3 = 半个太阳宽度（size-6 = 24px），保证 t=0/1 时太阳不越界 */}
      <div className="mt-3 px-3">
        <div
          className="relative h-1.5 rounded-full bg-muted"
          role="img"
          aria-label={inDay
            ? '日出 ' + hhmm(today.sunrise) + '，日落 ' + hhmm(today.sunset) + '，白天已过 ' + Math.round(t * 100) + '%'
            : '日出 ' + hhmm(today.sunrise) + '，日落 ' + hhmm(today.sunset) + '，当前为夜间'}
        >
          {/* 尚未到来的白天：暖色高亮；已过去的部分保持轨道底色（与参考图一致） */}
          <div className="absolute inset-y-0 right-0 rounded-full bg-amber-400/75 dark:bg-amber-300/55" style={{ left: pct }} />
          <div
            className={cn('absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2', inDay ? 'text-amber-500 dark:text-amber-300' : 'text-muted-foreground/45')}
            style={{ left: pct }}
          >
            <SunGlyph className="size-6" />
          </div>
        </div>
      </div>
      {/* 下排：时间（参考图里明显大于标签） */}
      <div className="mt-3 flex justify-between font-numeric">
        <span className="text-lg font-bold tabular-nums">{hhmm(today.sunrise)}</span>
        <span className="text-lg font-bold tabular-nums text-muted-foreground/70">{hhmm(today.sunset)}</span>
      </div>
    </section>
  )
}

/** Date → 'HH:mm'（本地时区）。天气那边的 hhmm() 只吃 'YYYY-MM-DDTHH:mm' 串，月亮这里拿到的是 Date */
function clock(d: Date | null): string {
  if (!d) return '--:--'
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

/** 月相圆盘：按亮比例画**真实盈亏**，不是固定圆盘。
 *  亮区 = 亮侧外半圆 + 终结线椭圆，半短轴 rx = r·|2f−1|：
 *  f=0 新月 → rx=r（零面积）· f=0.25 上弦 → rx=0（正好半圆）· f=0.5 满月 → rx=r（满盘）。
 *  娥眉/残月（f<0.5）终结线凸向亮侧，凸月凸向暗侧。 */
function MoonDisc({ fraction, waxing, className }: { fraction: number; waxing: boolean; className?: string }) {
  const r = 9.2
  const rx = Math.max(0.01, Math.abs(2 * fraction - 1) * r)
  const limb = waxing ? 1 : 0
  const term = fraction < 0.5 ? limb : 1 - limb
  const inner = term === 1 ? 0 : 1
  return (
    <svg viewBox="-12 -12 24 24" className={className} aria-hidden="true">
      {/* 暗面 = 整个圆盘；亮面 = 亮侧半圆 + 终结线椭圆。
          ⚠️ 亮面必须用**可见的亮色**，不能用 currentColor：浅色主题下 currentColor 是深灰，
          画出来会被读成「右半边是黑的」，与真实月相正好相反（v1.31 截图自查发现，纯函数测试看不出这个）。 */}
      <circle r={r} className="fill-muted-foreground/30" />
      <path d={`M 0 ${-r} A ${r} ${r} 0 0 ${limb} 0 ${r} A ${rx} ${r} 0 0 ${inner} 0 ${-r} Z`} className="fill-amber-300 dark:fill-amber-200" />
    </svg>
  )
}

/** 月出/月落端点标记：地平线上的月牙 + 上/下箭头（与 RiseSetGlyph 同构，只把半日换成月牙） */
function MoonRiseSetGlyph({ dir, className }: { dir: 'rise' | 'set'; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'rise'
        ? <><path d="M12 2.6v4.8" /><path d="m9.6 5 2.4-2.4L14.4 5" /></>
        : <><path d="M12 7.4V2.6" /><path d="m9.6 5 2.4 2.4L14.4 5" /></>}
      <path d="M13.4 19.9a6 6 0 1 1-4.4-9.9 4.8 4.8 0 0 0 4.4 9.9Z" />
    </svg>
  )
}

/** 月出月落（v1.31）：与 SunArc 对称的一节——上排图标+标签、中排冷色轨道（已过暗 / 未到亮，
 *  与太阳的琥珀暖色成对）、月亮按**真实月相**停在自己位置上、下排时间 + 月相名。
 *  数据不走接口：Open-Meteo 没有任何月亮字段，由 src/lib/moon.ts 本地解算
 *  （零依赖 + suncalc 当测试裁判，见 docs/plans/RESEARCH_月出月落.md）。 */
function MoonArc() {
  const now = Date.now()
  const illum = moonIllumination(new Date(now))
  const times = moonTimes(new Date(now), CHONGQING.lat, CHONGQING.lon)
  const p = moonProgress(times, now)
  const pct = p ? (p.t * 100).toFixed(2) + '%' : '0%'
  const riseText = clock(times.rise)
  const setText = clock(times.set)
  const phaseText = `${moonPhaseName(illum.phase)} · 照亮 ${Math.round(illum.fraction * 100)}%`
  const aria = times.alwaysDown ? `今夜月亮不升起，${phaseText}`
    : times.alwaysUp ? `月亮整夜在地平线上，${phaseText}`
    : `月出 ${riseText}，月落 ${setText}，${p?.inSky ? '此刻在天空' : '此刻在地平线下'}，${phaseText}`
  return (
    <section>
      <h3 className="mb-3 text-xs font-medium text-muted-foreground">月出月落</h3>
      <div className="flex items-start justify-between">
        <div className="flex flex-col items-center gap-1">
          <MoonRiseSetGlyph dir="rise" className="size-6 text-sky-600 dark:text-sky-300" />
          <span className="text-[11px] text-muted-foreground">月出</span>
        </div>
        <div className="flex flex-col items-center gap-1">
          <MoonRiseSetGlyph dir="set" className="size-6 text-sky-600/70 dark:text-sky-300/60" />
          <span className="text-[11px] text-muted-foreground">月落</span>
        </div>
      </div>
      <div className="mt-3 px-3">
        <div className="relative h-1.5 rounded-full bg-muted" role="img" aria-label={aria}>
          {/* 尚未落下的部分：冷色高亮（与太阳「尚未到来的白天暖色」同构） */}
          {p && <div className="absolute inset-y-0 right-0 rounded-full bg-sky-400/60 dark:bg-sky-300/40" style={{ left: pct }} />}
          {/* 在地平线下时整体压暗（月亮还在，只是看不见） */}
          <div className={cn('absolute top-1/2 size-6 -translate-x-1/2 -translate-y-1/2', !p?.inSky && 'opacity-40')} style={{ left: pct }}>
            <MoonDisc fraction={illum.fraction} waxing={illum.waxing} className="size-6" />
          </div>
        </div>
      </div>
      <div className="mt-3 flex justify-between font-numeric">
        <span className="text-lg font-bold tabular-nums">{riseText}</span>
        <span className="text-lg font-bold tabular-nums text-muted-foreground/70">{setText}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{times.alwaysDown ? '今夜不升起 · ' : times.alwaysUp ? '整夜在天上 · ' : ''}{phaseText}</p>
    </section>
  )
}

function DetailChips({ w }: { w: WeatherNow }) {
  const today = w.daily[0]
  const chips = [
    { icon: Droplets, label: '湿度', value: w.humidity != null ? `${w.humidity}%` : '—' },
    { icon: Thermometer, label: '体感', value: w.apparent != null ? `${w.apparent}°` : '—' },
    { icon: Wind, label: '风速', value: w.wind != null ? `${w.wind} km/h` : '—' },
    { icon: SunMedium, label: '紫外线', value: today?.uvMax != null ? `${today.uvMax} · ${uvLabel(today.uvMax)}` : '—' },
    { icon: Leaf, label: '空气质量', value: w.air?.aqi != null ? `AQI ${w.air.aqi} · ${aqiLabel(w.air.aqi)}` : '—' },
    { icon: Umbrella, label: '降水概率', value: today?.precipMax != null ? `${today.precipMax}%` : '—' },
  ]
  return (
    <section className="grid grid-cols-3 gap-2">
      {chips.map(c => (
        <div key={c.label} className="rounded-xl bg-muted/60 p-2.5">
          <p className="flex items-center gap-1 text-[10px] text-muted-foreground"><c.icon className="size-3" strokeWidth={1.7} />{c.label}</p>
          <p className="mt-1 truncate text-[13px] font-semibold font-numeric">{c.value}</p>
        </div>
      ))}
    </section>
  )
}

function HourlyStrip({ w }: { w: WeatherNow }) {
  if (w.hourly.length === 0) return null
  return (
    <section>
      <h3 className="mb-2 text-xs font-medium text-muted-foreground">24 小时趋势</h3>
      <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1 pb-1">
        {w.hourly.map((h, i) => (
          <div key={h.time} className={cn('flex w-[2.7rem] shrink-0 flex-col items-center gap-1 rounded-xl py-2', i === 0 && 'bg-primary/8')}>
            <span className="text-[10px] text-muted-foreground font-numeric">{i === 0 ? '现在' : `${h.hourLabel}时`}</span>
            <img src={weatherIconUrl(h.kind, hourIsDay(h.hourLabel))} alt={WEATHER_LABELS[h.kind]} title={`${h.hourLabel}:00 ${WEATHER_LABELS[h.kind]}`} className="size-7" draggable={false} />
            <span className="text-xs font-medium font-numeric">{h.temp ?? '--'}°</span>
            <span className={cn('text-[10px] font-numeric', (h.precip ?? 0) > 0 ? 'text-sky-600 dark:text-sky-400' : 'opacity-0')} aria-hidden={(h.precip ?? 0) === 0}>{h.precip ?? 0}%</span>
          </div>
        ))}
      </div>
    </section>
  )
}

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

function WeekList({ w }: { w: WeatherNow }) {
  const days = w.daily.slice(0, 8)
  if (days.length < 2) return null
  const lo = Math.min(...days.map(d => d.min ?? 0))
  const hi = Math.max(...days.map(d => d.max ?? 0))
  const span = Math.max(1, hi - lo)
  return (
    <section>
      <h3 className="mb-1 text-xs font-medium text-muted-foreground">七日预报</h3>
      {days.map((d, i) => {
        const left = (((d.min ?? lo) - lo) / span) * 100
        const width = Math.max(6, (((d.max ?? d.min ?? lo) - (d.min ?? lo)) / span) * 100)
        const day = new Date(`${d.date}T12:00:00`)
        const label = i === 0 ? '今天' : i === 1 ? '明天' : `周${WEEKDAYS[day.getDay()] ?? ''}`
        return (
          <div key={d.date} className="flex items-center gap-2.5 py-1.5">
            <span className="w-8 shrink-0 text-xs text-muted-foreground">{label}</span>
            <img src={weatherIconUrl(d.kind, true)} alt={WEATHER_LABELS[d.kind]} title={WEATHER_LABELS[d.kind]} className="size-7 shrink-0" draggable={false} />
            <span className="w-6 shrink-0 text-right text-xs text-muted-foreground font-numeric">{d.min ?? '--'}°</span>
            <div className="relative h-1.5 flex-1 rounded-full bg-muted">
              <div className="absolute h-full rounded-full bg-gradient-to-r from-sky-400 to-amber-400" style={{ left: `${left}%`, width: `${width}%` }} />
            </div>
            <span className="w-6 shrink-0 text-xs font-numeric">{d.max ?? '--'}°</span>
          </div>
        )
      })}
    </section>
  )
}
