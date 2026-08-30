/** 轻量 FLIP 布局动画（零依赖）。取代 Motion 方案：motion v13 core+domMax 实测 +123KB（总预算 1120KB 破线 +59KB），
 *  而本项目需要的只是"元素从旧位置连续滑到新位置"——WAAPI 三十行足够（参照 v1.19 recharts→手绘 SVG 的取舍）。
 *
 *  原理：每次 React 提交后（useLayoutEffect，绘制前）对比各 [data-flip-id] 元素与上一帧的页面坐标，
 *  位移超阈值则施加反向 transform 再动画回零。覆盖：同列表重排（补加星标滑顶）、跨区块换位（今日↔已完成坠落/飞回）。
 */

const lastRects = new Map<string, { x: number; y: number }>()

export const FLIP_DURATION = 320

/** 每次提交后调用；首帧只记锚点不动画。页面坐标（含 scroll）存储，滚动不误判 */
export function flipIn(container: HTMLElement | null): void {
  if (!container || typeof window === 'undefined') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  const moves: Array<{ el: HTMLElement; dx: number; dy: number }> = []
  for (const el of Array.from(container.querySelectorAll<HTMLElement>('[data-flip-id]'))) {
    const id = el.dataset.flipId!
    const r = el.getBoundingClientRect()
    if (r.width === 0 && r.height === 0) continue // details 折叠等隐藏态：不更新锚点，保持上次可见位置
    const prev = lastRects.get(id)
    const x = r.x + window.scrollX
    const y = r.y + window.scrollY
    if (prev && (Math.abs(prev.x - x) > 0.5 || Math.abs(prev.y - y) > 0.5)) {
      moves.push({ el, dx: prev.x - x, dy: prev.y - y })
    }
    lastRects.set(id, { x, y })
  }
  for (const m of moves) {
    if (typeof m.el.animate !== 'function') return // 无 WAAPI 环境（旧浏览器/jsdom）：保持瞬移不动画
    // 飞行期置于顶层：撤销上飞时避免被相邻卡片的不透明背景压住（relative+偏移为零，不影响布局）
    m.el.style.position = 'relative'
    m.el.style.zIndex = '10'
    const anim = m.el.animate(
      [{ transform: `translate(${m.dx}px, ${m.dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: FLIP_DURATION, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' },
    )
    anim.finished.then(() => { m.el.style.position = ''; m.el.style.zIndex = '' }).catch(() => {})
  }
}

/** 测试/切页后清空锚点（旧坐标跨页失效） */
export function resetFlip(): void {
  lastRects.clear()
}
