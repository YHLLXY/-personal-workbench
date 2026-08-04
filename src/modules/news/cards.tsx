import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Newspaper, ArrowRight } from 'lucide-react'
import { loadHot, type HotItem } from '../../lib/hot'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function HotCard() {
  const [items, setItems] = useState<HotItem[]>([])
  useEffect(() => { loadHot(false).then(r => setItems(r.items.slice(0, 4))) }, [])
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Newspaper className="size-4 text-primary" strokeWidth={1.7} />今日热点</CardTitle>
        <Link to="/hot" className="text-xs text-muted-foreground hover:text-primary"><ArrowRight className="size-3.5" /></Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {items.length === 0 ? <Skeleton className="h-20 w-full" /> : items.map((it, i) => (
          <a key={i} href={it.url} target="_blank" rel="noreferrer" className="flex items-baseline gap-2 text-[13px] py-1.5 hover:text-primary">
            <span className="text-accent font-bold text-xs w-4 shrink-0">{i + 1}</span>
            <span className="truncate">{it.title}</span>
          </a>
        ))}
      </CardContent>
    </Card>
  )
}
