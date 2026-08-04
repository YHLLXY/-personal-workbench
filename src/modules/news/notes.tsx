import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useNotes, useNoteMutations } from './api'
import { NoteEditor } from './note-editor'
import { Sparkles, Trash2, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import type { Note } from '@/lib/db/types'

export default function Notes() {
  const { data: notes, isLoading } = useNotes()
  const { remove } = useNoteMutations()
  const [editing, setEditing] = useState<Note | null>(null)
  const [params, setParams] = useSearchParams()

  const showNew = editing === null && params.get('new') === '1'

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">灵感速记</h1>
          <p className="text-xs text-muted-foreground mt-0.5">停笔 1 秒自动保存 · 支持 Markdown</p>
        </div>
        <Button onClick={() => { setEditing(null); setParams({ new: '1' }, { replace: true }) }}><Plus className="size-4 mr-1" />速记</Button>
      </div>

      {showNew && (
        <NoteEditor key="new" note={null} onDone={() => setParams({}, { replace: true })} />
      )}
      {editing && <NoteEditor key={editing.id} note={editing} onDone={() => { setEditing(null); setParams({}, { replace: true }) }} />}

      {isLoading ? <Skeleton className="h-24 w-full" />
        : (notes ?? []).length === 0 && !showNew ? (
          <p className="text-sm text-muted-foreground py-10 text-center flex flex-col items-center gap-2"><Sparkles className="size-8 text-muted-foreground/40" />记下第一个灵感吧</p>
        ) : (notes ?? []).map(n => (
          <div key={n.id} className="bg-card border border-border rounded-2xl p-4 group" onClick={() => setEditing(n)}>
            <div className="flex items-center gap-2 mb-1.5">
              {n.tag && <Badge variant="secondary" className="text-[10px]">{n.tag}</Badge>}
              <span className="text-[10px] text-muted-foreground ml-auto">{n.updatedAt.slice(0, 16).replace('T', ' ')}</span>
              <button onClick={e => { e.stopPropagation(); remove.mutate(n.id) }} aria-label="删除" className="text-muted-foreground/50 hover:text-destructive opacity-0 group-hover:opacity-100 md:opacity-0 md:group-hover:opacity-100"><Trash2 className="size-3.5" /></button>
            </div>
            <div className="text-sm whitespace-pre-wrap line-clamp-4">{n.content}</div>
          </div>
        ))}
    </div>
  )
}
