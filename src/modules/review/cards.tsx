import { Link } from 'react-router-dom'
import { RotateCcw, ArrowRight } from 'lucide-react'
import { useTodayReview } from './api'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

export function ReviewCard() {
  const { data: review } = useTodayReview()
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><RotateCcw className="size-4 text-primary" strokeWidth={1.7} />今日复盘</CardTitle>
        <Link to="/review" className="text-xs text-muted-foreground hover:text-primary"><ArrowRight className="size-3.5" /></Link>
      </CardHeader>
      <CardContent>
        {review ? (
          <p className="text-xs text-muted-foreground line-clamp-2">{review.summary || '（未写总结）'}</p>
        ) : (
          <p className="text-xs text-muted-foreground">今天还没复盘，睡前花 5 分钟吧</p>
        )}
      </CardContent>
    </Card>
  )
}
