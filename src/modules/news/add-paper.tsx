import { useEffect, useState, type FormEvent } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, ExternalLink } from 'lucide-react'
import { searchArxiv, type ArxivResult } from '../../lib/arxiv'
import { usePaperMutations, useFolders, usePapers } from './api'
import { toast } from 'sonner'

/** 添加论文对话框：arXiv 搜索 / 手动录入 / DOI 直达 */
export function AddPaper({ open, onOpenChange, defaultFolderId }: { open: boolean; onOpenChange: (v: boolean) => void; defaultFolderId: string | null }) {
  const { create } = usePaperMutations()
  const { data: folders } = useFolders()
  const { data: papers } = usePapers()
  // arXiv tab
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<ArxivResult[]>([])
  const [searching, setSearching] = useState(false)
  const [searched, setSearched] = useState(false)
  // 手动 / DOI tab 共用字段
  const [title, setTitle] = useState('')
  const [authors, setAuthors] = useState('')
  const [url, setUrl] = useState('')
  const [tags, setTags] = useState('')
  const [folder, setFolder] = useState('')
  // DOI tab
  const [doi, setDoi] = useState('')
  const [resolving, setResolving] = useState(false)

  useEffect(() => {
    if (open) {
      setQuery(''); setResults([]); setSearched(false)
      setTitle(''); setAuthors(''); setUrl(''); setTags(''); setFolder(defaultFolderId ?? ''); setDoi('')
    }
  }, [open, defaultFolderId])

  const tagsArr = tags.split(',').map(t => t.trim()).filter(Boolean)

  function savePaper(input: { title: string; authors: string; url: string | null; arxivId: string | null }) {
    create.mutate({
      ...input,
      status: 'want', rating: null, note: null, type: 'paper', folderId: folder || null,
      tags: tagsArr, keywords: [], content: null, summary: null, source: null,
    }, { onSuccess: () => { toast.success('已添加'); onOpenChange(false) } })
  }

  async function doSearch(e: FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    try { setResults(await searchArxiv(query)); setSearched(true) }
    catch { toast.error('搜索失败，请稍后重试') }
    finally { setSearching(false) }
  }

  async function resolveDoi() {
    const d = doi.trim()
    if (!d) return
    setResolving(true)
    try {
      const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(d)}`)
      if (!r.ok) throw new Error(String(r.status))
      const j = await r.json() as { message?: { title?: string[]; author?: { given?: string; family?: string }[] } }
      const m = j.message
      setTitle(m?.title?.[0] ?? '')
      setAuthors((m?.author ?? []).map(a => `${a.given ?? ''} ${a.family ?? ''}`.trim()).filter(Boolean).join(', '))
      setUrl(`https://doi.org/${d}`)
      toast.success('解析成功，可修改后保存')
    } catch { toast.error('DOI 解析失败，可手动填写后保存') }
    finally { setResolving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader><DialogTitle>添加论文</DialogTitle></DialogHeader>
        <Tabs defaultValue="arxiv">
          <TabsList className="w-full">
            <TabsTrigger value="arxiv" className="flex-1">arXiv 搜索</TabsTrigger>
            <TabsTrigger value="manual" className="flex-1">手动录入</TabsTrigger>
            <TabsTrigger value="doi" className="flex-1">DOI 直达</TabsTrigger>
          </TabsList>

          <TabsContent value="arxiv" className="pt-3">
            <form onSubmit={doSearch} className="flex gap-2">
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="如 LLM safety" className="flex-1" />
              <Button type="submit" disabled={searching || !query.trim()}>{searching ? '搜索中…' : '搜索'}</Button>
            </form>
            {results.length > 0 && (
              <div className="mt-3 max-h-64 divide-y divide-border/70 overflow-y-auto rounded-xl border border-border/70">
                {results.map(r => {
                  const inLibrary = (papers ?? []).some(p => p.arxivId === r.arxivId)
                  return (
                    <div key={r.arxivId} className="flex items-start gap-2 px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{r.title}</div>
                        <div className="mt-0.5 truncate text-xs text-muted-foreground">{r.authors.join(', ')} · {r.published}</div>
                      </div>
                      <a href={r.url} target="_blank" rel="noreferrer" aria-label="打开原文" className="p-1.5 text-muted-foreground/60 hover:text-primary"><ExternalLink className="size-4" /></a>
                      <Button size="sm" variant="outline" disabled={inLibrary} onClick={() => savePaper({ title: r.title, authors: r.authors.join(', '), url: r.url, arxivId: r.arxivId })}>
                        <Plus className="size-3.5 mr-1" />{inLibrary ? '已收藏' : '收藏'}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
            {searched && results.length === 0 && <p className="mt-3 text-center text-xs text-muted-foreground">没有找到相关论文，换个关键词试试</p>}
          </TabsContent>

          <TabsContent value="manual" className="space-y-3 pt-3">
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">标题 *</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="论文标题" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">作者</label>
              <Input value={authors} onChange={e => setAuthors(e.target.value)} placeholder="作者1, 作者2" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">链接 URL</label>
              <Input value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">文件夹</label>
                <Select value={folder} onValueChange={v => setFolder(String(v))}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value=""><span className="text-muted-foreground">未分类</span></SelectItem>
                    {(folders ?? []).map(f => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">标签</label>
                <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="AI, 安全" />
              </div>
            </div>
            <Button className="w-full" onClick={() => savePaper({ title: title.trim(), authors: authors.trim(), url: url.trim() || null, arxivId: null })} disabled={!title.trim() || create.isPending}>保存</Button>
          </TabsContent>

          <TabsContent value="doi" className="space-y-3 pt-3">
            <div className="flex gap-2">
              <Input value={doi} onChange={e => setDoi(e.target.value)} placeholder="如 10.1000/xyz123" className="flex-1" />
              <Button variant="outline" onClick={resolveDoi} disabled={resolving || !doi.trim()}>{resolving ? '解析中…' : '解析'}</Button>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">标题 *</label>
              <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="解析成功后自动填充" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">作者</label>
              <Input value={authors} onChange={e => setAuthors(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">链接 URL</label>
              <Input value={url} onChange={e => setUrl(e.target.value)} />
            </div>
            <Button className="w-full" onClick={() => savePaper({ title: title.trim(), authors: authors.trim(), url: url.trim() || null, arxivId: null })} disabled={!title.trim() || create.isPending}>保存</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
