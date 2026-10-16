/**
 * 月出/月落 + 月相（v1.31）——零依赖纯函数。
 *
 * 为什么自己算：Open-Meteo 只给太阳（sunrise/sunset），**没有任何月亮字段**，而
 * 免费可用的月亮接口都需要 key + 配额。月亮位置是确定性天文计算，不需要外部服务。
 * 为什么不用 suncalc 运行时依赖：体积门禁（scripts/check-bundle.mjs）自己的提示就是
 * 「零依赖优先」，而动手前 JS 总量余量只剩 21 KB（1129/1150，2026-10-16 实测）——11 KB 换一节弹窗内容不划算。
 * **suncalc 以 devDependency 形式只做测试裁判**（tests/moon.test.ts 的 oracle 差分）。
 *
 * 算法：Meeus《Astronomical Algorithms》第 47 章的低精度截断级数（黄经 6 项 / 黄纬 4 项 /
 * 距离 4 项，约 10″ 量级），配合章动省略与低精度黄赤交角。精度实测见 tests/moon.test.ts
 * 的 oracle 差分（对 suncalc 2.x 的 ELP 高精度实现）。**显示粒度是分钟，秒级误差无意义。**
 *
 * 关键约定：rise/set 的判据是**月面上缘视高度过 0**（含视差 + 蒙气差 + 视半径），
 * 与太阳的 -0.833° 定义同源但数值不同——月亮视差接近 1°，不能照抄太阳。
 */

const RAD = Math.PI / 180
const DAY_MS = 86400000
/** J2000 起算的天数：Unix 毫秒 → d（1970-01-01T00:00Z = -10957.5） */
const J2000_UNIX_DAYS = 10957.5
const EARTH_RADIUS_KM = 6378.14

function toDays(date: Date): number { return date.getTime() / DAY_MS - J2000_UNIX_DAYS }
function sin(d: number) { return Math.sin(d * RAD) }
function cos(d: number) { return Math.cos(d * RAD) }
function norm360(d: number) { return ((d % 360) + 360) % 360 }

// ========== 坐标 ==========

/** 黄道坐标（经/纬，度）→ 赤道坐标（赤经/赤纬，度）。eps = 黄赤交角（度） */
function eclipticToEquatorial(lon: number, lat: number, eps: number) {
  const l = lon * RAD, b = lat * RAD, e = eps * RAD
  const ra = Math.atan2(Math.sin(l) * Math.cos(e) - Math.tan(b) * Math.sin(e), Math.cos(l))
  const dec = Math.asin(Math.sin(b) * Math.cos(e) + Math.cos(b) * Math.sin(e) * Math.sin(l))
  return { ra: ra / RAD, dec: dec / RAD }
}

/** 黄赤交角（度）：Meeus 22.2 低精度（章动省略，误差 < 0.003°） */
function obliquity(t: number) { return 23.439291 - 0.0130042 * t }

/** 太阳视黄经（度）。月亮相位只需要日地月夹角，低精度足够（误差 0.01°） */
function sunLongitude(d: number): number {
  const m = 357.5291 + 0.98560028 * d
  const c = 1.9148 * sin(m) + 0.02 * sin(2 * m) + 0.0003 * sin(3 * m)
  return norm360(m + c + 102.9372 + 180)
}

/** 月亮黄道坐标与地心距离（Meeus 47 截断级数）。t = 儒略世纪（自 J2000） */
function moonCoords(d: number) {
  const t = d / 36525
  const lp = 218.3164477 + 481267.88123421 * t   // 平黄经 L′
  const dd = 297.8501921 + 445267.1114034 * t    // 平距角 D
  const m = 357.5291092 + 35999.0502909 * t      // 太阳平近点角 M
  const mp = 134.9633964 + 477198.8675055 * t    // 月亮平近点角 M′
  const f = 93.2720950 + 483202.0175233 * t      // 升交点角距 F
  const lon = lp
    + 6.288774 * sin(mp)
    + 1.274027 * sin(2 * dd - mp)
    + 0.658314 * sin(2 * dd)
    + 0.213618 * sin(2 * mp)
    - 0.185116 * sin(m)
    - 0.114332 * sin(2 * f)
    + 0.058793 * sin(2 * dd - 2 * mp)
    + 0.057066 * sin(2 * dd - m - mp)
    + 0.053322 * sin(2 * dd + mp)
    + 0.045758 * sin(2 * dd - m)
  const lat = 5.128122 * sin(f)
    + 0.280602 * sin(mp + f)
    - 0.277693 * sin(f - mp)
    + 0.173237 * sin(2 * dd - f)
    + 0.055413 * sin(2 * dd - mp + f)
    + 0.046271 * sin(2 * dd - mp - f)
    + 0.032573 * sin(2 * dd + f)
  const dist = 385000.56
    - 20905.355 * cos(mp)
    - 3699.111 * cos(2 * dd - mp)
    - 2955.968 * cos(2 * dd)
    - 569.925 * cos(2 * mp)
  return { lon: norm360(lon), lat, dist }
}

// ========== 位置 ==========

function siderealTime(d: number, lwDeg: number) { return norm360(280.46061837 + 360.98564736629 * d - lwDeg) }

/** 蒙气差（度）：Meeus 16.4 的常用近似。地平附近约 0.57°，天顶为 0 */
function refraction(hDeg: number) {
  const h = Math.max(0, hDeg) * RAD
  return (0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179))) / RAD
}

/** 月亮在观测点的**月面上缘视高度**（度）。rise/set 的零点就是它。 */
function moonHeight(date: Date, lat: number, lon: number): number {
  const d = toDays(date)
  const c = moonCoords(d)
  const eq = eclipticToEquatorial(c.lon, c.lat, obliquity(d / 36525))
  const h = siderealTime(d, -lon) - eq.ra
  const hGeo = Math.asin(sin(lat) * sin(eq.dec) + cos(lat) * cos(eq.dec) * cos(h)) / RAD
  // 视差：月亮离得近（~38 万 km），地平附近抬低约 0.95°——太阳没有这一项
  const parallax = Math.asin(EARTH_RADIUS_KM / c.dist * cos(hGeo)) / RAD
  const center = hGeo - parallax
  // 视半径（月面半径 ≈ 0.2725 地球半径）→ 上缘先于月心升起，提前约 1°；0.09° 为月牙尖端余量
  const semidiameter = 0.2725 * Math.asin(EARTH_RADIUS_KM / c.dist) / RAD
  return center + refraction(center) + semidiameter + 0.09
}

// ========== 对外 API ==========

export interface MoonIllumination {
  /** 被照亮的视面积比例 0~1 */
  fraction: number
  /** 相位 0=新月 0.25=上弦 0.5=满月 0.75=下弦（朔望月内的归一化位置） */
  phase: number
  /** 是否盈（新月→满月为 true，此时亮面在右侧） */
  waxing: boolean
}

/** 月相：照度比例 + 朔望月相位。误差量级 0.1% 照度 / 0.001 相位 */
export function moonIllumination(date: Date = new Date()): MoonIllumination {
  const d = toDays(date)
  const t = d / 36525
  const sLon = sunLongitude(d)
  const m = moonCoords(d)
  const eq = eclipticToEquatorial(m.lon, m.lat, obliquity(t))
  const sunEq = eclipticToEquatorial(sLon, 0, obliquity(t))
  // 相位角（日-月-地）：由日月的赤道坐标求，直接给照度
  const cosPhi = sin(sunEq.dec) * sin(eq.dec) + cos(sunEq.dec) * cos(eq.dec) * cos(sunEq.ra - eq.ra)
  const phi = Math.acos(Math.min(1, Math.max(-1, cosPhi)))
  const sunDist = 149598000
  const inc = Math.atan2(sunDist * Math.sin(phi), m.dist - sunDist * Math.cos(phi))
  const phase = ((m.lon - sLon) / 360 % 1 + 1) % 1
  return { fraction: (1 + Math.cos(inc)) / 2, phase, waxing: phase < 0.5 }
}

const PHASE_NAMES: Array<[number, string]> = [
  [0.02, '新月'], [0.22, '娥眉月'], [0.28, '上弦月'], [0.47, '盈凸月'],
  [0.53, '满月'], [0.72, '亏凸月'], [0.78, '下弦月'], [0.98, '残月'],
]

/** 相位 → 中文月相名 */
export function moonPhaseName(phase: number): string {
  const p = ((phase % 1) + 1) % 1
  for (const [edge, name] of PHASE_NAMES) if (p < edge) return name
  return '新月'
}

export interface MoonTimes {
  /** 当日月出（本地日界内）；无则 null */
  rise: Date | null
  /** 当日月落；无则 null */
  set: Date | null
  alwaysUp: boolean
  alwaysDown: boolean
}

/** 以指定时区偏移的「当地零点」为起点的 24 小时窗口（与 suncalc 的 civilMidnight 同式） */
function civilMidnight(ms: number, tzOffsetMinutes: number): number {
  const off = tzOffsetMinutes * 60000
  return Math.floor((ms + off) / DAY_MS) * DAY_MS - off
}

/**
 * 月出 / 月落。
 * 窗口 = 当地零点起 24 小时（tzOffsetMinutes 默认取运行环境的本地时区，与 Open-Meteo
 * 返回的本地时间串口径一致）。二分定位：先以 1 小时步长扫描变号，再对零点做 30 次二分。
 * 24 小时内找不到过零点时用窗口内最高高度判定「整日在地平线上 / 整日不升起」。
 */
export function moonTimes(date: Date, lat: number, lon: number, tzOffsetMinutes = -date.getTimezoneOffset()): MoonTimes {
  const start = civilMidnight(date.getTime(), tzOffsetMinutes)
  const heightAt = (ms: number) => moonHeight(new Date(ms), lat, lon)
  let rise: number | null = null
  let set: number | null = null
  let maxH = heightAt(start)
  // 月亮每天推迟约 50 分钟，24 小时内至多一次升、一次落；上缘高度曲线近似单峰
  let prevH = maxH
  for (let i = 1; i <= 96; i++) {
    const ms = start + i * (DAY_MS / 96)   // 15 分钟步长：足够密，不会漏掉一次过零
    const h = heightAt(ms)
    if (h > maxH) maxH = h
    if (prevH < 0 && h >= 0 && rise === null) rise = bisect(heightAt, ms - DAY_MS / 96, ms)
    else if (prevH >= 0 && h < 0 && set === null) set = bisect(heightAt, ms - DAY_MS / 96, ms)
    prevH = h
  }
  if (rise === null && set === null && maxH <= 0) return { rise: null, set: null, alwaysUp: false, alwaysDown: true }
  if (rise === null && set === null) return { rise: null, set: null, alwaysUp: true, alwaysDown: false }
  return { rise: rise === null ? null : new Date(rise), set: set === null ? null : new Date(set), alwaysUp: false, alwaysDown: false }
}

/** 高度过零点的二分（30 次 ≈ 亚毫秒精度，实际受星历精度限制） */
function bisect(f: (ms: number) => number, lo: number, hi: number): number {
  let a = lo, b = hi
  const fa = f(a)
  for (let i = 0; i < 30; i++) {
    const mid = (a + b) / 2
    if ((f(mid) < 0) === (fa < 0)) a = mid; else b = mid
  }
  return (a + b) / 2
}

export interface MoonArc {
  /** 月亮在当前可见区间内的归一化位置（0=区间起点，1=终点），已钳制到 [0,1] */
  t: number
  /** 此刻月亮是否在地平线上 */
  inSky: boolean
  alwaysUp: boolean
  alwaysDown: boolean
}

/**
 * 月亮在「今天可见区间」内的位置（与 sunProgress 对称，供轨道组件消费）。
 * 四种情形：升落齐备（升 < 落 → 正常区间）；升落齐备但升 > 落（凌晨已落、傍晚再升 → 取傍晚那段）；
 * 只有升（区间到当日 24:00）；只有落（区间从当日 00:00 起）。整日不升 → null（没有可画的位置）。
 */
export function moonProgress(times: MoonTimes, now: number = Date.now(), tzOffsetMinutes = -new Date(now).getTimezoneOffset()): MoonArc | null {
  const { rise, set, alwaysUp, alwaysDown } = times
  if (alwaysDown) return null
  if (alwaysUp) return { t: 1, inSky: true, alwaysUp: true, alwaysDown: false }
  const dayStart = civilMidnight(now, tzOffsetMinutes)
  const dayEnd = dayStart + DAY_MS
  const r = rise ? rise.getTime() : null
  const s = set ? set.getTime() : null
  let from: number, to: number
  if (r !== null && s !== null && r < s) { from = r; to = s }
  else if (r !== null && s !== null) { from = r; to = dayEnd }   // 落早于升：画傍晚那段
  else if (r !== null) { from = r; to = dayEnd }
  else { from = dayStart; to = s as number }
  const inSky = r !== null && s !== null
    ? (r < s ? now >= r && now <= s : now >= r || now <= s)
    : r !== null ? now >= r : now <= (s as number)
  const span = Math.max(1, to - from)
  return { t: Math.min(1, Math.max(0, (now - from) / span)), inSky, alwaysUp: false, alwaysDown: false }
}

export const CHONGQING = { lat: 29.563, lon: 106.5516 }   // 与 api/weather.ts 的 UPSTREAM、vite.config.ts 的 dev 代理三处同步
