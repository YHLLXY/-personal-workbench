import { useState } from 'react'
import { CloudSun, MapPin } from 'lucide-react'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { WEATHER_LABELS } from '@/lib/weather'
import { weatherIconUrl } from '@/lib/weather-icons'
import { useWeatherQuery } from './weather-data'
import { WeatherDialog } from './weather-dialog'

export function WeatherCard() {
  const { data, isLoading } = useWeatherQuery()
  const [open, setOpen] = useState(false)

  return (
    <>
      <Card
        role="button"
        aria-label="查看天气详情"
        title="点击查看详情"
        onClick={() => setOpen(true)}
        className="cursor-pointer transition-all hover:border-primary/40 hover:shadow-sm active:scale-[0.99]"
      >
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="flex items-center gap-2 text-sm"><CloudSun className="size-4 text-primary" strokeWidth={1.7} />重庆天气</CardTitle>
          <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground"><MapPin className="size-3" />重庆</span>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center gap-4"><Skeleton className="size-16 rounded-2xl" /><div className="space-y-2"><Skeleton className="h-8 w-24" /><Skeleton className="h-3 w-16" /></div></div>
          ) : !data ? (
            <p className="text-xs text-muted-foreground py-4">天气获取失败，稍后自动重试</p>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img src={weatherIconUrl(data.kind, data.isDay)} alt={WEATHER_LABELS[data.kind]} className="size-16 shrink-0 drop-shadow-sm" draggable={false} />
                <div className="min-w-0">
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-3xl font-extrabold font-numeric leading-none">{data.temperature ?? '--'}°</span>
                    <span className="text-sm text-muted-foreground">{WEATHER_LABELS[data.kind]}</span>
                  </div>
                  {data.daily[0] && (
                    <p className="text-[11px] text-muted-foreground mt-1.5 font-numeric">
                      今日 {Math.round(data.daily[0].max ?? 0)}° / {Math.round(data.daily[0].min ?? 0)}°
                    </p>
                  )}
                </div>
              </div>
              {data.daily.length > 1 && (
                <div className="grid grid-cols-3 gap-1 mt-3 pt-3 border-t border-border/60">
                  {data.daily.slice(0, 3).map((d, i) => (
                    <div key={d.date} className="flex flex-col items-center gap-0.5 py-1">
                      <span className="text-[10px] text-muted-foreground">{['今天', '明天', '后天'][i] ?? d.date.slice(5)}</span>
                      <img src={weatherIconUrl(d.kind, true)} alt={WEATHER_LABELS[d.kind]} title={WEATHER_LABELS[d.kind]} className="size-8" draggable={false} />
                      <span className="text-[11px] font-numeric">{Math.round(d.max ?? 0)}° <span className="text-muted-foreground">{Math.round(d.min ?? 0)}°</span></span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
      <WeatherDialog open={open} onOpenChange={setOpen} />
    </>
  )
}
