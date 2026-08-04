import { Link } from 'react-router-dom'
import { CalendarClock, ArrowRight } from 'lucide-react'
import { useExams, daysUntil } from './api'
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
          : sorted.map(e => (
            <div key={e.id} className="flex items-baseline justify-between text-sm">
              <span className="truncate">{e.title}</span>
              <span className="text-xs text-muted-foreground shrink-0 ml-2 font-numeric">{daysUntil(e.examDate) >= 0 ? `${daysUntil(e.examDate)} 天后` : '已结束'}</span>
            </div>
          ))}
      </CardContent>
    </Card>
  )
}
