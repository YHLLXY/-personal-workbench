import { Link } from 'react-router-dom'
import { CalendarClock, ArrowRight, Timer } from 'lucide-react'
import { useExams, useFocusToday, daysUntil } from './api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function ExamsCard() {
  const { data: exams, isLoading } = useExams()
  const sorted = [...(exams ?? [])].sort((a, b) => a.examDate.localeCompare(b.examDate)).slice(0, 3)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><CalendarClock className="size-4 text-primary" strokeWidth={1.7} />最近考试</CardTitle>
        <Link to="/study" className="text-xs text-muted-foreground hover:text-primary"><ArrowRight className="size-3.5" /></Link>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading ? <Skeleton className="h-16 w-full" /> : sorted.length === 0 ? <p className="text-xs text-muted-foreground py-2">暂无考试安排</p>
          : sorted.map(e => {
            const d = daysUntil(e.examDate)
            return (
              <div key={e.id} className="flex items-baseline justify-between text-sm">
                <span className="truncate">{e.title}</span>
                <span className="text-xs text-muted-foreground shrink-0 ml-2 font-numeric">{d >= 0 ? `${d} 天后` : '已结束'}</span>
              </div>
            )
          })}
      </CardContent>
    </Card>
  )
}

export function FocusCard() {
  const { data, isLoading } = useFocusToday()
  const m = data?.minutes ?? 0
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Timer className="size-4 text-primary" strokeWidth={1.7} />今日专注</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? <Skeleton className="h-10 w-full" /> : (
          <>
            <div className="text-3xl font-extrabold font-numeric">{Math.floor(m / 60)}<span className="text-sm font-normal text-muted-foreground ml-1">小时</span> {m % 60}<span className="text-sm font-normal text-muted-foreground ml-1">分</span></div>
            <div className="text-xs text-muted-foreground mt-1">{data?.count ?? 0} 个番茄完成</div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
