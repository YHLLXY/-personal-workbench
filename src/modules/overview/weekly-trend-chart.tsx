import { useLayoutEffect, useRef, useState } from 'react'
import type { WeeklyDay } from '@/lib/stats'

const H = 140
const PLOT_TOP = 12
const PLOT_BOTTOM = 102
const PLOT_LEFT = 34
const PLOT_RIGHT_OFFSET = 6
const LABEL_Y = 128
const DEFAULT_WIDTH = 560

/** 本周趋势图：纯 SVG 手绘（v1.2 设计初衷：不引入图表库）。
 *  专注分钟柱状图（左轴）+ 完成任务量折线（独立缩放，避免贴底不可读）。
 *  交互：桌面 hover 查看 tooltip；移动端点击柱子查看（再点收起）；默认显示最后一天。 */
export function WeeklyTrendChart({ days }: { days: WeeklyDay[] }) {
  const ref = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(DEFAULT_WIDTH)
  const [selected, setSelected] = useState<number | null>(days.length - 1)
  const [hovered, setHovered] = useState<number | null>(null)

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setWidth(el.clientWidth || DEFAULT_WIDTH)
    update()
    if (typeof ResizeObserver === 'undefined') return // 测试/老旧环境降级：用默认宽度
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const plotW = width - PLOT_LEFT - PLOT_RIGHT_OFFSET
  const plotH = PLOT_BOTTOM - PLOT_TOP
  const slotW = plotW / Math.max(days.length, 1)
  const maxMinutes = Math.max(...days.map(d => d.minutes), 1)
  const maxTasks = Math.max(...days.map(d => d.tasks), 1)
  const barW = Math.min(16, slotW * 0.45)
  const activeIdx = hovered ?? selected
  const active = activeIdx != null ? days[activeIdx] : null

  const tipLeft = activeIdx != null
    ? Math.min(Math.max(PLOT_LEFT + activeIdx * slotW + slotW / 2 - 60, 4), Math.max(width - 124, 4))
    : 0

  return (
    <div ref={ref} className="relative h-[140px] w-full select-none" role="img"
      aria-label={`本周趋势：${days.map(d => `${d.label}完成${d.tasks}个任务，专注${d.minutes}分钟`).join('；')}`}>
      <svg width="100%" height={H} viewBox={`0 0 ${width} ${H}`} className="block">
        {/* 左轴刻度：最大值与 0 */}
        <text x={0} y={PLOT_TOP + 3} className="fill-muted-foreground" fontSize={9}>{maxMinutes}</text>
        <text x={0} y={PLOT_BOTTOM + 3} className="fill-muted-foreground" fontSize={9}>0</text>
        {/* 柱子 */}
        {days.map((d, i) => {
          const h = (d.minutes / maxMinutes) * plotH
          const x = PLOT_LEFT + i * slotW + (slotW - barW) / 2
          const y = PLOT_BOTTOM - h
          return (
            <rect key={i} x={x} y={y} width={barW} height={Math.max(h, 1)}
              rx={3} fill="var(--primary)" opacity={activeIdx === i ? 1 : 0.75} />
          )
        })}
        {/* 任务量折线（独立缩放） */}
        <polyline
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
          points={days.map((d, i) =>
            `${PLOT_LEFT + i * slotW + slotW / 2},${PLOT_BOTTOM - (d.tasks / maxTasks) * plotH}`
          ).join(' ')}
        />
        {days.map((d, i) => {
          const cx = PLOT_LEFT + i * slotW + slotW / 2
          const cy = PLOT_BOTTOM - (d.tasks / maxTasks) * plotH
          const isActive = activeIdx === i
          return (
            <circle key={i} cx={cx} cy={cy} r={isActive ? 4 : 2.5}
              fill="var(--accent)" stroke={isActive ? 'var(--card)' : 'none'} strokeWidth={1.5} />
          )
        })}
        {/* 底部星期标签 */}
        {days.map((d, i) => (
          <text key={i} x={PLOT_LEFT + i * slotW + slotW / 2} y={LABEL_Y}
            textAnchor="middle" fontSize={10} className="fill-muted-foreground">
            {d.label}
          </text>
        ))}
        {/* 透明热区：桌面 hover + 移动端点击（覆盖全绘图区，触控友好） */}
        {days.map((_, i) => (
          <rect key={i} x={PLOT_LEFT + i * slotW} y={PLOT_TOP} width={slotW}
            height={plotH + 14} fill="transparent" style={{ cursor: 'pointer' }}
            onClick={() => setSelected(selected === i ? null : i)}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)} />
        ))}
      </svg>
      {/* tooltip：HTML 绝对定位（与 recharts 版视觉一致） */}
      {active && (
        <div className="pointer-events-none absolute top-0 rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: tipLeft }}>
          <div className="font-medium text-foreground">{active.label}</div>
          <div className="mt-0.5 text-muted-foreground">完成 {active.tasks} 个任务 · 专注 {active.minutes} 分钟</div>
        </div>
      )}
    </div>
  )
}