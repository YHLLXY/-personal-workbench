import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type MouseEvent as ReactMouseEvent, type RefObject } from 'react'

// 手写拖拽排序（v1.24 E 项）。零依赖：dnd-kit ~18KB gzip 被体积红线否决，本文件 <2KB。
// 交互模型：把手 pointerdown → 4px 阈值激活 → setPointerCapture → 克隆行 fixed 跟手（rAF 改 transform，
// 不用 top/left）→ 中点命中算插入槽位 → 预览换位（FLIP 接管动画）→ pointerup 落库。
//
// 触摸三坑（调研 2.3，dnd-kit 解法照抄，缺一即翻车）：
// ① 把手 CSS 预置 touch-action: none（绝不能 pointerdown 后动态改，W3C pointerevents#178）——handleProps.style + JSX 类名双保险；
// ② 拖拽期间列表容器 overscroll-behavior: contain（消费方在 draggingId 时加 overscroll-contain 类）；
// ③ 把手 onContextMenu preventDefault（iOS 长按放大镜）。

export interface DragHandleProps {
  style: CSSProperties
  onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
  onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
  onContextMenu: (e: ReactMouseEvent<HTMLElement>) => void
}

/** 半序中点：拖拽落库只写被拖项一项（无批量写）。排序语义为降序（sort 大在前），
 *  prev/next = 显示序里的上/下邻 sort；缺一侧（拖到列表头/尾）用 ±65536 步长。
 *  值域守卫：v1.24 起 sort 恒 ≥1e13（types.bakeTaskSort 烘焙域），空列表兜底也保持该值域，
 *  否则本地 listTasks 的惰性归一化（sort<1e13 触发）会把它二次烘焙破坏手动序 */
export function midpointSort(prev?: number, next?: number): number {
  if (prev !== undefined && next !== undefined) return (prev + next) / 2
  if (prev !== undefined) return prev - 65536
  if (next !== undefined) return next + 65536
  return 1e13 + Date.now()
}

const DRAG_THRESHOLD = 4

interface DragState {
  id: string
  pointerId: number
  startX: number
  startY: number
  active: boolean
  origin: HTMLElement | null
  ghost: HTMLElement | null
  dx: number
  dy: number
  raf: number
}

/** 容器内每个可拖行须带 data-drag-id={id}；渲染顺序用返回的 order（拖拽中 = 预览序）。
 *  onReorder 在 pointerup 时收到最终顺序与被拖 id——落库由消费方算中点（midpointSort），本 hook 不碰数据 */
export function useDragSort(ids: string[], onReorder: (newOrder: string[], movedId: string) => void): {
  containerRef: RefObject<HTMLDivElement | null>
  order: string[]
  draggingId: string | null
  handleProps: (id: string) => DragHandleProps
} {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const [preview, setPreview] = useState<string[] | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const drag = useRef<DragState | null>(null)
  const idsRef = useRef(ids)
  idsRef.current = ids
  const previewRef = useRef(preview)
  previewRef.current = preview
  const onReorderRef = useRef(onReorder)
  onReorderRef.current = onReorder

  // rAF 合帧：跟手 transform + 中点命中一起做；预览换位触发重渲染，FLIP（lib/flip.ts）补间
  function applyFrame() {
    const d = drag.current
    if (!d) return
    d.raf = 0
    if (d.ghost) d.ghost.style.transform = `translate(${d.dx}px, ${d.dy}px)`
    if (!containerRef.current) return
    const rows = Array.from(containerRef.current.querySelectorAll<HTMLElement>('[data-drag-id]'))
    if (rows.length === 0) return
    const pointerY = d.startY + d.dy
    let slot = 0
    for (const r of rows) {
      const rect = r.getBoundingClientRect()
      if (pointerY > rect.top + rect.height / 2) slot++
    }
    const current = previewRef.current ?? idsRef.current
    const from = current.indexOf(d.id)
    if (from < 0) return
    const to = slot > from ? slot - 1 : slot
    if (to === from) return
    const next = current.filter(x => x !== d.id)
    next.splice(to, 0, d.id)
    setPreview(next)
  }

  function beginPress(e: ReactPointerEvent<HTMLElement>, id: string) {
    if (e.button !== 0) return
    e.preventDefault() // 防文本选择 / 原生拖拽；触摸滚动已被 touch-action: none 挡住
    drag.current = { id, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, active: false, origin: null, ghost: null, dx: 0, dy: 0, raf: 0 }
  }

  function pressMove(e: ReactPointerEvent<HTMLElement>) {
    const d = drag.current
    if (!d || d.pointerId !== e.pointerId) return
    d.dx = e.clientX - d.startX
    d.dy = e.clientY - d.startY
    if (!d.active) {
      if (Math.hypot(d.dx, d.dy) < DRAG_THRESHOLD) return
      const origin = containerRef.current?.querySelector<HTMLElement>(`[data-drag-id="${d.id}"]`)
      if (!origin) return
      const rect = origin.getBoundingClientRect()
      d.origin = origin
      d.active = true
      const ghost = origin.cloneNode(true) as HTMLElement
      ghost.removeAttribute('data-flip-id')
      ghost.removeAttribute('data-drag-id')
      Object.assign(ghost.style, {
        position: 'fixed', left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`,
        margin: '0', zIndex: '50', pointerEvents: 'none', borderRadius: '12px',
        boxShadow: '0 16px 40px rgba(0,0,0,0.2)', transform: 'translate(0px, 0px)',
      })
      document.body.appendChild(ghost)
      d.ghost = ghost
      origin.style.opacity = '0.4' // 占位变暗；预览换位时由 FLIP 平滑滑动
      e.currentTarget.setPointerCapture(e.pointerId)
      setPreview(idsRef.current.slice())
      setDraggingId(d.id)
    }
    if (!d.raf) d.raf = requestAnimationFrame(applyFrame)
  }

  function endDrag(commit: boolean) {
    const d = drag.current
    if (!d) return
    if (d.raf) { cancelAnimationFrame(d.raf); d.raf = 0 }
    d.ghost?.remove()
    if (d.origin) d.origin.style.opacity = ''
    const wasActive = d.active
    const movedId = d.id
    const finalOrder = previewRef.current
    drag.current = null
    if (!wasActive) return // 纯点击（未过阈值）：不算拖拽
    setDraggingId(null)
    setPreview(null) // 回到真实数据渲染；乐观更新与预览序一致则无跳变，FLIP 接管
    if (commit && finalOrder && finalOrder.join('\n') !== idsRef.current.join('\n')) {
      onReorderRef.current(finalOrder, movedId)
    }
  }

  function handleProps(id: string): DragHandleProps {
    return {
      style: { touchAction: 'none' },
      onPointerDown: e => beginPress(e, id),
      onPointerMove: e => pressMove(e),
      onPointerUp: () => endDrag(true),
      onPointerCancel: () => endDrag(false),
      onContextMenu: e => e.preventDefault(),
    }
  }

  return { containerRef, order: preview ?? ids, draggingId, handleProps }
}
