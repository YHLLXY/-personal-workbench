/** 打卡庆祝反馈：纸屑 + 震动（Nielsen Norman 微交互「即时反馈」原则；强度随里程碑递进，参考 Duolingo streak 设计）。
 *  canvas-confetti 动态 import 懒加载（约 5KB gzip），不占首屏体积；加载失败静默降级为纯状态变化。 */

export type CelebrateIntensity = 'single' | 'grand'

/** 主题色系纸屑：鼠尾草绿 / 燕麦黄 / 陶红（与 index.css 的 --primary/--accent/--destructive 对应） */
const CONFETTI_COLORS = ['#5B8A72', '#8FBCA2', '#D9C9A3', '#C96A5B']

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** el 传入触发按钮，纸屑从按钮位置喷出；null 时从屏幕中央偏下喷出 */
export async function celebrate(el: HTMLElement | null, intensity: CelebrateIntensity = 'single'): Promise<void> {
  // 震动独立于 reduced-motion（系统级触觉反馈，非动画）
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(intensity === 'single' ? 15 : [30, 50, 30])
  }
  if (prefersReducedMotion()) return
  try {
    const confetti = (await import('canvas-confetti')).default
    const rect = el?.getBoundingClientRect()
    const origin = rect && window.innerWidth > 0
      ? { x: (rect.left + rect.width / 2) / window.innerWidth, y: (rect.top + rect.height / 2) / window.innerHeight }
      : { x: 0.5, y: 0.6 }
    const base = { colors: CONFETTI_COLORS, disableForReducedMotion: true, zIndex: 200 }
    if (intensity === 'single') {
      confetti({ ...base, particleCount: 60, spread: 65, startVelocity: 28, scalar: 0.9, origin })
    } else {
      // grand：全部完成 / 连击里程碑——中央大喷发 + 左右两翼
      confetti({ ...base, particleCount: 90, spread: 100, startVelocity: 42, origin: { x: 0.5, y: 0.55 } })
      confetti({ ...base, particleCount: 45, angle: 60, spread: 60, origin: { x: 0, y: 0.7 } })
      confetti({ ...base, particleCount: 45, angle: 120, spread: 60, origin: { x: 1, y: 0.7 } })
    }
  } catch {
    // 动态加载失败（极端弱网）：静默降级，打卡本身不受影响
  }
}

/** 连击里程碑档位（返回命中的最高档，未命中返回 null） */
export function streakMilestone(streak: number): 7 | 30 | 100 | null {
  if (streak > 0 && streak % 100 === 0) return 100
  if (streak > 0 && streak % 30 === 0) return 30
  if (streak > 0 && streak % 7 === 0) return 7
  return null
}
