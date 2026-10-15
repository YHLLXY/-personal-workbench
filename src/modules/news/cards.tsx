import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Newspaper, ArrowRight, Sparkles } from 'lucide-react'
import { loadHot, type HotItem } from '../../lib/hot'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useDailyReports, useNotes } from './api'

export function HotCard() {
  const { data: reports } = useDailyReports(1)
  const [items, setItems] = useState<HotItem[]>([])
  useEffect(() => { loadHot(false).then(r => setItems(r.items.slice(0, 4))) }, [])
  const report = reports?.[0]
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Newspaper className="size-4 text-primary" strokeWidth={1.7} />今日热点</CardTitle>
        <Link to="/hot" className="text-xs text-muted-foreground hover:text-primary"><ArrowRight className="size-3.5" /></Link>
      </CardHeader>
      <CardContent className="space-y-1">
        {/* v1.27：有 AI 日报时优先露出日报（成品层），热榜列表退其后 */}
        {report && (
          <Link to="/hot" className="mb-1.5 block rounded-xl bg-primary/8 px-3 py-2.5 transition-colors hover:bg-primary/15">
            <span className="flex items-center gap-1 text-[10px] font-medium text-primary"><Sparkles className="size-3" />今日日报 · {report.itemCount} 条 · {report.sourceCount} 个来源</span>
            <span className="mt-0.5 block text-[13px] font-medium leading-snug">{report.title}</span>
          </Link>
        )}
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

export function NotesCard() {
  const { data: notes } = useNotes()
  const recent = (notes ?? []).slice(0, 3)
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm"><Sparkles className="size-4 text-primary" strokeWidth={1.7} />灵感速记</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {recent.length === 0 ? <p className="text-xs text-muted-foreground py-2">暂无速记</p> : recent.map(n => (
          <div key={n.id} className="text-xs text-muted-foreground truncate">
            {(n.tags ?? []).slice(0, 1).map(t => <span key={t} className="inline-block bg-accent/25 text-accent-foreground rounded px-1.5 mr-1.5 text-[10px]">{t}</span>)}
            {n.content}
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
