/**
 * Meteocons 图标名 → 打包后的资源 URL（启动动画与天气卡共用）。
 * 资产来源与许可见 src/assets/meteocons/NOTICE.md。
 */
import { weatherIconName } from './weather'
import clearDay from '@/assets/meteocons/clear-day.svg'
import clearNight from '@/assets/meteocons/clear-night.svg'
import partlyDay from '@/assets/meteocons/partly-cloudy-day.svg'
import partlyNight from '@/assets/meteocons/partly-cloudy-night.svg'
import cloudy from '@/assets/meteocons/cloudy.svg'
import fogDay from '@/assets/meteocons/fog-day.svg'
import fogNight from '@/assets/meteocons/fog-night.svg'
import drizzle from '@/assets/meteocons/drizzle.svg'
import rain from '@/assets/meteocons/rain.svg'
import rainNight from '@/assets/meteocons/partly-cloudy-night-rain.svg'
import snow from '@/assets/meteocons/snow.svg'
import sleet from '@/assets/meteocons/sleet.svg'
import thunderDay from '@/assets/meteocons/thunderstorms-rain.svg'
import thunderNight from '@/assets/meteocons/thunderstorms-night-rain.svg'

const ICONS: Record<string, string> = {
  'clear-day': clearDay, 'clear-night': clearNight,
  'partly-cloudy-day': partlyDay, 'partly-cloudy-night': partlyNight,
  'cloudy': cloudy, 'fog-day': fogDay, 'fog-night': fogNight,
  'drizzle': drizzle, 'rain': rain, 'partly-cloudy-night-rain': rainNight,
  'snow': snow, 'sleet': sleet,
  'thunderstorms-rain': thunderDay, 'thunderstorms-night-rain': thunderNight,
}

export function weatherIconUrl(kind: Parameters<typeof weatherIconName>[0], isDay: boolean): string {
  return ICONS[weatherIconName(kind, isDay)] ?? clearDay
}
