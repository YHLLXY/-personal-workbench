import { useState, type FormEvent } from 'react'
import { Search, Plus, ExternalLink, Trash2, Library } from 'lucide-react'
import { searchArxiv, type ArxivResult } from '../../lib/arxiv'
import { usePapers, usePaperMutations } from './api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Paper } from '@/lib/db/types'

const STATUS_LABEL = { want: '想读', reading: '在读', done: '读完' } as const

export default function Papers() {
  const { data: papers, isLoading } = usePapers()
  const { create, update, remove } = usePaperMutations()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ArxivResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  const [filter, setFilter] = useState<'all' | Paper['status']>('all')

  async function doSearch(e: FormEvent) {
    e.preventDefault(); if (!query.trim()) return
    setSearching(true)
    try { setResults(await searchArxiv(query)); setSearched(true) }
    catch { toast.error('搜索失败，请稍后重试') }
    finally { setSearching(false) }
  }

  const shown = (papers ?? []).filter(p => filter === 'all' || p.status === filter)

  return (
    <div className="mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-xl font-bold">论文资料库</h1>
          <p className="text-xs text-muted-foreground mt-0.5">从 arXiv 检索并收藏感兴趣的论文</p>
        </div>
        <Select value={filter} onValueChange={v => setFilter(v as typeof filter)}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="want">想读</SelectItem>
            <SelectItem value="reading">在读</SelectItem>
            <SelectItem value="done">读完</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <form onSubmit={doSearch} className="flex gap-2 mb-5">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="arXiv 搜索：如 LLM safety" className="pl-9" />
        </div>
        <Button type="submit" disabled={searching || !query.trim()}>{searching ? '搜索中…' : '搜索'}</Button>
      </form>

      {searching ? <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
        : results.length > 0 ? (
          <div className="bg-card border border-border rounded-2xl divide-y divide-border/70 mb-6">
            {results.map(r => {
              const inLibrary = (papers ?? []).some(p => p.arxivId === r.arxivId)
              return (
                <div key={r.arxivId} className="px-4 py-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{r.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{r.authors.join(', ')} · {r.published}</div>
                  </div>
                  <a href={r.url} target="_blank" rel="noreferrer" aria-label="打开原文" className="p-1.5 text-muted-foreground/60 hover:text-primary"><ExternalLink className="size-4" /></a>
                  <Button size="sm" variant="outline" disabled={inLibrary} onClick={() => create.mutate({ title: r.title, authors: r.authors.join(', '), arxivId: r.arxivId, url: r.url, status: 'want', rating: null, note: null }, { onSuccess: () => toast.success('已收藏') })}>
                    <Plus className="size-3.5 mr-1" />{inLibrary ? '已收藏' : '收藏'}
                  </Button>
                </div>
              )
            })}
          </div>
        ) : searched ? <p className="text-sm text-muted-foreground py-8 text-center">没有找到相关论文，换个关键词试试</p>
        : null}

      {isLoading ? <Skeleton className="h-24 w-full" />
        : shown.length === 0 ? <p className="text-sm text-muted-foreground py-8 text-center flex flex-col items-center gap-2"><Library className="size-8 text-muted-foreground/40" />库里还没有论文</p>
        : <div className="bg-card border border-border rounded-2xl divide-y divide-border/70">
            {shown.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <a href={p.url ?? `https://arxiv.org/abs/${p.arxivId}`} target="_blank" rel="noreferrer" className="text-sm font-medium truncate hover:text-primary">{p.title}</a>
                    {p.arxivId && <span className="text-[10px] text-muted-foreground shrink-0">{p.arxivId}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5 truncate">{p.authors}</div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Select value={p.status} onValueChange={v => update.mutate({ id: p.id, patch: { status: v as Paper['status'] } })}>
                    <SelectTrigger className={cn('w-20 h-8 text-xs', p.status === 'reading' && 'text-primary')}><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {(['want', 'reading', 'done'] as const).map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <button onClick={() => remove.mutate(p.id)} aria-label="删除" className="p-1.5 text-muted-foreground/60 hover:text-destructive"><Trash2 className="size-4" /></button>
                </div>
              </div>
            ))}
          </div>}
    </div>
  )
}
