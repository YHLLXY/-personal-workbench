import { useEffect, useState } from 'react'
import { RefreshCw, Link2 } from 'lucide-react'
import { loadHot, type HotItem } from '../../lib/hot'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

export default function Hot() {
  const [items, setItems] = useState<HotItem[]>([])
  const [loading, setLoading] = useState(true)
  const [fromCache, setFromCache] = useState(false)

  async function load(refresh = false) {
    setLoading(true)
    const res = await loadHot(refresh)
    setItems(res.items); setFromCache(res.fromCache); setLoading(false)
    if (res.items.length === 0) toast.error('热点源暂不可用，请稍后重试')
    else if (refresh) toast.success('已刷新')
  }
  useEffect(() => { load() }, [])

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">今日热点</h1>
          <p className="text-xs text-muted-foreground mt-0.5">{fromCache ? '离线缓存 · 数据可能不是最新' : 'GitHub · Hacker News · V2EX'}</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}><RefreshCw className="size-3.5 mr-1" />刷新</Button>
      </div>
      {loading ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        : items.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">暂无热点数据</p>
        : <div className="bg-card border border-border rounded-2xl divide-y divide-border/70">
            {items.map((it, i) => (
              <a key={i} href={it.url} target="_blank" rel="noreferrer" className="flex items-baseline gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                <span className="text-sm font-bold text-accent font-numeric w-5 shrink-0">{i + 1}</span>
                <span className="text-sm flex-1">{it.title}</span>
                <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0"><Link2 className="size-3" />{it.source}</span>
              </a>
            ))}
          </div>}
    </div>
  )
}
