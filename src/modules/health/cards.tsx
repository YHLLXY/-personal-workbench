import { Flame } from 'lucide-react'
import { useHeatCells, useHabitStats } from './api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

const LEVEL_CLASS = ['bg-muted', 'bg-primary/25', 'bg-primary/55', 'bg-primary']

export function HeatmapCard() {
  const { data: cells } = useHeatCells(28)
  const { data: stats } = useHabitStats()
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Flame className="size-4 text-primary" strokeWidth={1.7} />习惯打卡</CardTitle>
        <span className="text-[10px] text-muted-foreground">连续 {stats?.streak ?? 0} 天</span>
      </CardHeader>
      <CardContent>
        <div className="grid gap-1.5" style={{ gridTemplateColumns: 'repeat(14, minmax(0, 1fr))' }}>
          {cells?.map((c, i) => <span key={i} className={cn('h-4 rounded-[4px]', LEVEL_CLASS[c.level])} />)}
        </div>
        <div className="text-xs text-muted-foreground mt-2">今日完成 {stats?.todayCount ?? 0} 次打卡</div>
      </CardContent>
    </Card>
  )
}
