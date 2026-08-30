import { useMemo } from 'react'
import { Droplets, Leaf, SunMedium, Thermometer, Umbrella, Wind } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import {
  WEATHER_LABELS, aqiLabel, hhmm, uvLabel, type DailyForecast, type WeatherKind, type WeatherNow,
} from '@/lib/weather'
import { weatherIconUrl } from '@/lib/weather-icons'
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

/** 日出日落滑条：小太阳沿轨道从日出滑到日落，按当前时间定位（夜晚月亮停靠在对应端点） */
function SunArc({ today }: { today?: DailyForecast }) {
  if (!today?.sunrise || !today.sunset) return null
  const sr = new Date(today.sunrise)
  const ss = new Date(today.sunset)
  const now = Date.now()
  const inDay = now >= sr.getTime() && now <= ss.getTime()
  const t = Math.min(1, Math.max(0, (now - sr.getTime()) / Math.max(1, ss.getTime() - sr.getTime())))
  const lift = inDay ? Math.sin(t * Math.PI) * 10 : 0
  return (
    <section>
      <h3 className="mb-3 text-xs font-medium text-muted-foreground">日出日落</h3>
      <div className="relative px-1 pt-1">
        <div
          className="h-2 rounded-full"
          style={{ background: inDay
            ? 'linear-gradient(90deg, #f59e0b 0%, #fbbf24 22%, #93c5fd 50%, #fbbf24 78%, #f59e0b 100%)'
            : 'linear-gradient(90deg, #1e293b 0%, #475569 50%, #1e293b 100%)' }}
        />
        <div
          className="absolute top-1/2"
          style={{ left: `calc(${(t * 100).toFixed(1)}% - 14px)`, transform: `translateY(calc(-50% - ${lift.toFixed(1)}px))` }}
        >
          <img src={weatherIconUrl('clear', inDay)} alt="" className={cn('size-7 drop-shadow-md', !inDay && 'opacity-80')} draggable={false} />
        </div>
        <div className="mt-2 flex justify-between text-[11px] text-muted-foreground font-numeric">
          <span>↑ 日出 {hhmm(today.sunrise)}</span>
          <span>日落 {hhmm(today.sunset)} ↓</span>
        </div>
      </div>
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
