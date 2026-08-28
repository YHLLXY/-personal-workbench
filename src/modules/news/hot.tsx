import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Link2, Settings2, BookmarkPlus } from 'lucide-react'
import { loadHot, filterByTopics, formatFetchedAt, type HotResult, type HotCategory, type HotItem } from '../../lib/hot'
import { repository } from '@/lib/db'
import { HotSettingsDialog } from './hot-settings-dialog'
import { useNoteMutations } from './api'
import { loadReadIds, saveReadId, hotNoteText } from './news-view'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import type { Subscriptions } from '@/lib/db/types'

const CATEGORY_LABELS: Record<HotCategory, string> = { tech: '技术', academic: '学术', zh: '社区' }

export default function Hot() {
  const [res, setRes] = useState<HotResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [subs, setSubs] = useState<Subscriptions>({ sourceIds: [], topics: [] })
  const [activeTopic, setActiveTopic] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [readIds, setReadIds] = useState<string[]>(() => loadReadIds())
  const { create: createNote } = useNoteMutations()

  const staleRetriedRef = useRef(false)

  // 条目无 id 字段，用 url 作为已读键；点击条目即标记已读
  const markRead = (id: string) => setReadIds(saveReadId(id))
  // 存速记：复用 notes 的 create mutation，正文为「标题\n链接」
  const saveToNotes = (it: HotItem) => createNote.mutate({ content: hotNoteText(it.title, it.url) }, { onSuccess: () => toast.success('已存入速记') })

  async function load(refresh = false, silent = false, sourceIds?: string[]) {
    if (!silent) setLoading(true)
    try {
      const r = await loadHot(refresh, sourceIds ?? subs.sourceIds)
      setRes(r)
      if (r.stale && !staleRetriedRef.current) { staleRetriedRef.current = true; load(true, true) }
      else if (refresh && r.items.length === 0) toast.error('热点源暂不可用，请稍后重试')
      else if (refresh) toast.success(r.fromCache ? '网络不可用，已显示缓存' : '已刷新')
    } catch { toast.error('加载失败，请重试') } finally { if (!silent) setLoading(false) }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    repository.getSubscriptions().then(s => { setSubs(s); load(false, false, s.sourceIds) }).catch(() => load())
  }, [])

  const nameOf = (id: string) => res?.sources.find(s => s.id === id)?.name ?? id
  const visible = activeTopic ? filterByTopics(res?.items ?? [], [activeTopic]) : res?.items ?? []
  const fetchedAt = formatFetchedAt(res?.fetchedAt ?? null)

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-xl font-bold">今日热点</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {res?.fromCache ? '缓存数据 · ' : ''}{fetchedAt ? `更新于 ${fetchedAt} · 每 30 分钟自动刷新` : '加载中…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}><Settings2 className="size-3.5 mr-1" />管理源</Button>
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}><RefreshCw className="size-3.5 mr-1" />刷新</Button>
        </div>
      </div>

      {subs.topics.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto pb-3 mb-1">
          <button onClick={() => setActiveTopic('')} className={`shrink-0 text-xs rounded-full px-3 py-1 border ${activeTopic === '' ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>全部</button>
          {subs.topics.map(t => (
            <button key={t} onClick={() => setActiveTopic(activeTopic === t ? '' : t)} className={`shrink-0 text-xs rounded-full px-3 py-1 border ${activeTopic === t ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50'}`}>{t}</button>
          ))}
        </div>
      )}

      {loading && res === null ? <div className="space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
        : visible.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center">{subs.sourceIds.length === 0 ? '暂无热点数据' : '当前订阅源无匹配内容，去「管理源」调整'}</p>
        : <div className="bg-card border border-border rounded-2xl divide-y divide-border/70">
            {visible.map((it, i) => {
              const read = readIds.includes(it.url) // 已读条目标题降透明度
              return (
                <a key={i} href={it.url} target="_blank" rel="noreferrer" onClick={() => markRead(it.url)} className="flex items-baseline gap-3 px-4 py-3 hover:bg-muted/50 transition-colors">
                  <span className="text-sm font-bold text-accent font-numeric w-5 shrink-0">{i + 1}</span>
                  <span className={`text-sm flex-1 ${read ? 'opacity-60' : ''}`}>{it.title}</span>
                  {it.category && <Badge variant="secondary" className="shrink-0 text-[10px]">{CATEGORY_LABELS[it.category]}</Badge>}
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1 shrink-0"><Link2 className="size-3" />{nameOf(it.source)}</span>
                  <button onClick={e => { e.preventDefault(); e.stopPropagation(); saveToNotes(it) }} aria-label="存速记" title="存入速记" className="self-center text-muted-foreground/40 hover:text-primary shrink-0 transition-colors"><BookmarkPlus className="size-3.5" /></button>
                </a>
              )
            })}
          </div>}

      <HotSettingsDialog
        sources={res?.sources ?? []}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        onSaved={s => { setSubs(s); setActiveTopic(''); load(true, false, s.sourceIds) }}
      />
    </div>
  )
}
