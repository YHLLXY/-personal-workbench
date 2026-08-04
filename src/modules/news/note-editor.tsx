import { useEffect, useRef, useState } from 'react'
import { useNoteMutations } from './api'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Save } from 'lucide-react'
import type { Note } from '@/lib/db/types'

export function NoteEditor({ note, onDone }: { note: Note | null; onDone: () => void }) {
  const { create, update } = useNoteMutations()
  const [content, setContent] = useState(note?.content ?? '')
  const [tag, setTag] = useState(note?.tag ?? '')
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const first = useRef(true)

  // 防抖自动保存：停笔 1.2s 后保存
  useEffect(() => {
    if (first.current) { first.current = false; return }
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      if (!content.trim()) return
      if (note) update.mutate({ id: note.id, patch: { content, tag: tag || null } })
      else create.mutate({ content, tag: tag || null })
      setSavedAt(new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }))
    }, 1200)
    return () => { if (timer.current) clearTimeout(timer.current) }
  }, [content, tag])

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        <Input value={tag} onChange={e => setTag(e.target.value)} placeholder="标签（如：想法/待办/灵感）" className="max-w-40 h-8 text-xs" />
        <span className="ml-auto text-[10px] text-muted-foreground flex items-center gap-1">
          <Save className="size-3" />{savedAt ? `已保存 ${savedAt}` : '自动保存'}
        </span>
      </div>
      <Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="想到什么就写什么，支持 Markdown…" rows={6} autoFocus />
      <div className="flex justify-end mt-3">
        <Button size="sm" variant="outline" onClick={onDone}>完成</Button>
      </div>
    </div>
  )
}
