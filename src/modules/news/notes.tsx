import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useNotes, useNoteMutations, noteKeys } from './api'
import { repository } from '@/lib/db'
import { NoteEditor } from './note-editor'
import { Sparkles, Trash2, Plus, Archive, ArchiveRestore, Search, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { filterNotes } from './news-view'
import type { Note } from '@/lib/db/types'

export default function Notes() {
  const { data: notes, isLoading } = useNotes()
  const { update, remove } = useNoteMutations()
  // useNotes 的 select 已滤掉 archived；用同 queryKey 直查全量（共享缓存，不多发请求）以拿到归档笔记
  const { data: allNotes } = useQuery({ queryKey: noteKeys.all, queryFn: () => repository.listNotes() })
  const archived = useMemo(() => (allNotes ?? []).filter(n => n.archived), [allNotes])
  const [editing, setEditing] = useState<Note | null>(null)
  const [params, setParams] = useSearchParams()
  const [query, setQuery] = useState('')
  const [activeTag, setActiveTag] = useState<string | null>(null)
  // 标签筛选 chips 数据源：未归档笔记的去重 tag（null 跳过）
  const tags = useMemo(() => Array.from(new Set((notes ?? []).map(n => n.tag).filter((t): t is string => !!t))), [notes])
  const list = filterNotes(notes ?? [], query, activeTag)

  const showNew = editing === null && params.get('new') === '1'
  const chip = (on: boolean) => cn('text-xs px-3 py-1.5 rounded-full border transition-colors', on ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border text-muted-foreground hover:bg-muted/50')

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">灵感速记</h1>
          <p className="text-xs text-muted-foreground mt-0.5">停笔 1 秒自动保存 · 支持 Markdown</p>
        </div>
        <Button onClick={() => { setEditing(null); setParams({ new: '1' }, { replace: true }) }}><Plus className="size-4 mr-1" />速记</Button>
      </div>

      <div className="relative">
        <Search className="size-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索速记…" className="pl-8 h-9 text-sm" />
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setActiveTag(null)} className={chip(activeTag === null)}>全部</button>
          {tags.map(t => <button key={t} onClick={() => setActiveTag(activeTag === t ? null : t)} className={chip(activeTag === t)}>{t}</button>)}
        </div>
      )}

      {showNew && (
        <NoteEditor key="new" note={null} onDone={() => setParams({}, { replace: true })} />
      )}
      {editing && <NoteEditor key={editing.id} note={editing} onDone={() => { setEditing(null); setParams({}, { replace: true }) }} />}

      {isLoading ? <Skeleton className="h-24 w-full" />
        : list.length === 0 ? (
          (notes ?? []).length === 0
            ? !showNew && <p className="text-sm text-muted-foreground py-10 text-center flex flex-col items-center gap-2"><Sparkles className="size-8 text-muted-foreground/40" />记下第一个灵感吧</p>
            : <p className="text-sm text-muted-foreground py-10 text-center">没有匹配的速记</p>
        ) : list.map(n => (
          <div key={n.id} className="bg-card border border-border rounded-2xl p-4 group" onClick={() => setEditing(n)}>
            <div className="flex items-center gap-2 mb-1.5">
              {n.tag && <Badge variant="secondary" className="text-[10px]">{n.tag}</Badge>}
              <span className="text-[10px] text-muted-foreground ml-auto">{n.updatedAt.slice(0, 16).replace('T', ' ')}</span>
              {/* 归档：patch { archived: true }，成功后 toast 提示 */}
              <button onClick={e => { e.stopPropagation(); update.mutate({ id: n.id, patch: { archived: true } }, { onSuccess: () => toast.success('已归档') }) }} aria-label="归档" className="text-muted-foreground/50 hover:text-foreground opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100"><Archive className="size-3.5" /></button>
              <button onClick={e => { e.stopPropagation(); remove.mutate(n.id) }} aria-label="删除" className="text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
            </div>
            <div className="text-sm whitespace-pre-wrap line-clamp-4">{n.content}</div>
          </div>
        ))}

      {/* 归档箱：折叠列出 archived 笔记，支持恢复与删除 */}
      {archived.length > 0 && (
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex items-center justify-between px-3.5 py-2.5 cursor-pointer list-none select-none text-xs text-muted-foreground hover:text-foreground transition-colors">
            <span className="flex items-center gap-1.5">
              <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />
              归档箱 · {archived.length} 条
            </span>
            <span className="text-[10px]">点击展开</span>
          </summary>
          <div className="px-3 pb-3 space-y-1.5">
            {archived.map(n => (
              <div key={n.id} className="rounded-xl border border-border bg-background p-3 opacity-75 hover:opacity-100 transition-opacity" onClick={() => setEditing(n)}>
                <div className="flex items-center gap-2 mb-1">
                  {n.tag && <Badge variant="secondary" className="text-[10px]">{n.tag}</Badge>}
                  <span className="text-[10px] text-muted-foreground ml-auto">{n.updatedAt.slice(0, 16).replace('T', ' ')}</span>
                  <button onClick={e => { e.stopPropagation(); update.mutate({ id: n.id, patch: { archived: false } }, { onSuccess: () => toast.success('已恢复') }) }} aria-label="恢复" className="text-muted-foreground/50 hover:text-foreground"><ArchiveRestore className="size-3.5" /></button>
                  <button onClick={e => { e.stopPropagation(); remove.mutate(n.id) }} aria-label="删除" className="text-muted-foreground/50 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                </div>
                <div className="text-sm whitespace-pre-wrap line-clamp-2 text-muted-foreground">{n.content}</div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
