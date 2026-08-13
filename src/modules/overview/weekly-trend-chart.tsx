import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { WeeklyDay } from '@/lib/stats'

interface TrendTooltipProps {
  active?: boolean
  payload?: Array<{ payload?: WeeklyDay }>
}

function TrendTooltip({ active, payload }: TrendTooltipProps) {
  if (!active || !payload?.length) return null
  const day = payload[0]?.payload
  if (!day) return null
  return (
    <div className="rounded-lg border border-border bg-card px-2.5 py-1.5 text-xs shadow-md">
      <div className="font-medium">{day.label}</div>
      <div className="mt-0.5 text-muted-foreground">完成 {day.tasks} 个任务 · 专注 {day.minutes} 分钟</div>
    </div>
  )
}

/** 本周趋势图：专注分钟柱状图（左轴）+ 完成任务量折线（隐藏右轴独立缩放，避免贴底不可读） */
export function WeeklyTrendChart({ days }: { days: WeeklyDay[] }) {
  return (
    <div className="h-[140px] w-full" role="img"
      aria-label={`本周趋势：${days.map(d => `${d.label}完成${d.tasks}个任务，专注${d.minutes}分钟`).join('；')}`}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={days} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
          <XAxis dataKey="label" tickLine={false} axisLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} tickMargin={4} />
          <YAxis yAxisId="left" width={28} allowDecimals={false} tickLine={false} axisLine={false}
            tick={{ fontSize: 10, fill: 'var(--muted-foreground)' }} />
          <YAxis yAxisId="right" hide />
          <Tooltip content={<TrendTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.6 }} />
          <Bar yAxisId="left" dataKey="minutes" fill="var(--primary)" radius={[3, 3, 0, 0]} maxBarSize={16} />
          <Line yAxisId="right" dataKey="tasks" stroke="var(--accent)" strokeWidth={2}
            dot={{ r: 2.5, fill: 'var(--accent)', strokeWidth: 0 }} activeDot={{ r: 4 }} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
