import { useHeatCells } from '@/modules/health/api'

/** 14 天习惯打卡热力条（工作台首页与「我的」页共用，v1.23 自 overview-home 提取防样式漂移） */
export function MiniHeatmap() {
  const { data: cells } = useHeatCells(14)
  return (
    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
      {cells?.map((c, i) => <span key={i} className={`h-3.5 rounded-[4px] ${c.level === 0 ? 'bg-muted' : c.level === 1 ? 'bg-primary/25' : c.level === 2 ? 'bg-primary/55' : 'bg-primary'}`} />)}
    </div>
  )
}
