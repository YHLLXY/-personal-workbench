import { useEffect, useMemo, useState } from 'react'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Quote, Braces } from 'lucide-react'
import { usePaperMutations, useFolders } from './api'
import { formatCitation, toBibTeX } from './cite'
import { toast } from 'sonner'
import type { Paper } from '@/lib/db/types'

const STATUS_LABEL = { want: '想读', reading: '在读', done: '读完' } as const

function SummaryView({ summary }: { summary: string }) {
  let data: Record<string, unknown> | null = null
  try { data = JSON.parse(summary) } catch { data = null }
  if (!data || typeof data !== 'object') return <pre className="whitespace-pre-wrap text-xs text-muted-foreground">{summary}</pre>
  const points = Array.isArray(data.key_points) ? data.key_points as string[] : []
  const quotes = Array.isArray(data.quotes) ? data.quotes as string[] : []
  const structure = Array.isArray(data.structure) ? data.structure as string[] : []
  return (
    <div className="space-y-3 text-sm">
      {typeof data.title === 'string' && data.title && <p><span className="font-medium">拟标题：</span>{data.title}</p>}
      {points.length > 0 && (
        <div><span className="font-medium">核心观点：</span>
          <ul className="mt-1 list-disc space-y-1 pl-4">{points.map((k, i) => <li key={i}>{k}</li>)}</ul>
        </div>
      )}
      {quotes.length > 0 && (
        <div><span className="font-medium">金句：</span>
          {quotes.map((q, i) => <blockquote key={i} className="my-1 border-l-2 border-border pl-2 text-muted-foreground">{q}</blockquote>)}
        </div>
      )}
      {structure.length > 0 && (
        <div><span className="font-medium">结构拆解：</span>
          <ul className="mt-1 list-disc space-y-1 pl-4">{structure.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      )}
    </div>
  )
}

/** 资料详情抽屉：元数据编辑 + 总结/全文预览 + 删除 */
export function PaperDetail({ paper, open, onOpenChange }: { paper: Paper | null; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { update, remove } = usePaperMutations()
  const { data: folders } = useFolders()
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Paper['status']>('want')
  const [rating, setRating] = useState('')
  const [folder, setFolder] = useState('')
  const [tags, setTags] = useState('')
  const [note, setNote] = useState('')

  useEffect(() => {
    if (open && paper) {
      setTitle(paper.title)
      setAuthors(paper.authors)
      setUrl(paper.url ?? '')
      setStatus(paper.status)
      setRating(paper.rating != null ? String(paper.rating) : '')
      setFolder(paper.folderId ?? '')
      setTags((paper.tags ?? []).join(', '))
      setNote(paper.note ?? '')
    }
  }, [open, paper])

  /** 树形文件夹拍平为带缩进的选项 */
  const folderOptions = useMemo(() => {
    const out: { id: string; label: string }[] = []
    const walk = (parentId: string | null, depth: number) => {
      for (const f of (folders ?? []).filter(x => x.parentId === parentId)) {
        out.push({ id: f.id, label: `${'　'.repeat(depth)}${f.name}` })
        walk(f.id, depth + 1)
      }
    }
    walk(null, 0)
    return out
  }, [folders])

  function save() {
    if (!paper) return
    update.mutate({
      id: paper.id,
      patch: {
        title: title.trim(), authors: authors.trim(), url: url.trim() || null,
        status, rating: rating ? Number(rating) : null, folderId: folder || null,
        tags: tags.split(',').map(t => t.trim()).filter(Boolean), note: note.trim() || null,
      },
    }, { onSuccess: () => { toast.success('已保存'); onOpenChange(false) } })
  }

  function deleteIt() {
    if (!paper) return
    if (!window.confirm('删除该资料？此操作不可恢复')) return
    remove.mutate(paper.id, { onSuccess: () => { toast.success('已删除'); onOpenChange(false) } })
  }

  /** 复制文本到剪贴板，统一 toast 反馈 */
  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success('已复制') } catch { toast.error('复制失败') }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full max-w-md overflow-y-auto p-0 sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{paper?.type === 'note' ? '文案笔记' : '论文'}详情</SheetTitle>
          <SheetDescription>{paper ? `${paper.authors || '未填作者'} · ${paper.createdAt.slice(0, 10)}` : ''}</SheetDescription>
        </SheetHeader>
        {paper && (
          <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-6">
            {/* 引用导出：写论文场景一键复制 */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => copyText(formatCitation(paper))}><Quote className="size-3.5 mr-1" />复制引用</Button>
              <Button variant="outline" size="sm" onClick={() => copyText(toBibTeX(paper))}><Braces className="size-3.5 mr-1" />复制 BibTeX</Button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">标题</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">作者</label>
                <Input value={authors} onChange={e => setAuthors(e.target.value)} placeholder="可留空" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">评分</label>
                <Select value={rating} onValueChange={v => setRating(String(v))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=""><span className="text-muted-foreground">未评分</span></SelectItem>
                    {[1, 2, 3, 4, 5].map(n => <SelectItem key={n} value={String(n)}>{n} 分</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">链接</label>
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">状态</label>
                <Select value={status} onValueChange={v => setStatus(v as Paper['status'])}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(['want', 'reading', 'done'] as const).map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                  </SelectContent>
                </Select>
                {paper?.finishedAt && <p className="text-[10px] text-muted-foreground">读完于 {new Date(paper.finishedAt).toLocaleDateString('zh-CN')}</p>}
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">文件夹</label>
                <Select value={folder} onValueChange={v => setFolder(String(v))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=""><span className="text-muted-foreground">未分类</span></SelectItem>
                    {folderOptions.map(f => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">标签（逗号分隔）</label>
              <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="AI, 口播" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">笔记</label>
              <Textarea value={note} onChange={e => setNote(e.target.value)} placeholder="个人笔记…" rows={3} />
            </div>
            {paper.summary && (
              <div className="space-y-1.5 rounded-xl border border-border/70 bg-muted/30 p-3">
                <label className="text-xs text-muted-foreground">AI 总结</label>
                <SummaryView summary={paper.summary} />
              </div>
            )}
            {paper.content && (
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">全文</label>
                <pre className="max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-border/70 bg-muted/30 p-3 text-xs leading-relaxed">{paper.content}</pre>
              </div>
            )}
            <div className="flex items-center justify-between pt-2">
              <Button variant="destructive" size="sm" onClick={deleteIt}><Trash2 className="size-3.5 mr-1" />删除</Button>
              <Button size="sm" onClick={save} disabled={!title.trim() || update.isPending}>保存</Button>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  )
}
