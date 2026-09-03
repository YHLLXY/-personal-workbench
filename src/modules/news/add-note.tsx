import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Upload } from 'lucide-react'
import { parseImportText, parseImportMarkdown } from '../../lib/parse-import'
import { usePaperMutations } from './api'
import { toast } from 'sonner'

/** 添加文案笔记对话框：粘贴文本 / 上传 .json/.md */
export function AddNote({ open, onOpenChange, defaultFolderId }: { open: boolean; onOpenChange: (v: boolean) => void; defaultFolderId: string | null }) {
  const { create } = usePaperMutations()
  const [tab, setTab] = useState('paste')
  const [title, setTitle] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [tags, setTags] = useState('')
  const [summary, setSummary] = useState('')
  const [content, setContent] = useState('')
  const [platform, setPlatform] = useState('')
  const [keywords, setKeywords] = useState<string[]>([])

  useEffect(() => {
    if (open) {
      setTab('paste'); setTitle(''); setSourceUrl(''); setTags('')
      setSummary(''); setContent(''); setPlatform(''); setKeywords([])
    }
  }, [open])

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    if (!/\.(json|md)$/i.test(file.name)) { toast.error('仅支持 .json 或 .md 文件'); return }
    const reader = new FileReader()
    reader.onload = () => {
      const text = String(reader.result ?? '')
      try {
        const parsed = /\.json$/i.test(file.name) ? parseImportText(text) : parseImportMarkdown(text)
        setTitle(parsed.title); setSourceUrl(parsed.sourceUrl); setPlatform(parsed.platform)
        setSummary(parsed.summaryJson ?? ''); setKeywords(parsed.keywords)
        setTags(parsed.keywords.join(', ')); setContent(parsed.content)
        setTab('paste')
        toast.success('解析成功，已填充表单，可修改后保存')
      } catch (err) {
        toast.error(`无法解析该文件：${err instanceof Error ? err.message : '格式错误'}`)
      }
    }
    reader.onerror = () => toast.error('读取文件失败，请重试')
    reader.readAsText(file)
  }

  function save() {
    const c = content.trim()
    if (!c) return
    create.mutate({
      title: title.trim() || '未命名', authors: '', arxivId: null,
      url: sourceUrl.trim() || null, status: 'want', rating: null, note: null,
      type: 'note', folderId: defaultFolderId,
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      content: c, summary: summary.trim() || null, keywords, source: platform || null,
    }, { onSuccess: () => { toast.success('已保存'); onOpenChange(false) } })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>添加文案笔记</DialogTitle></DialogHeader>
        <Tabs value={tab} onValueChange={v => setTab(String(v))}>
          <TabsList className="w-full">
            <TabsTrigger value="paste" className="flex-1">粘贴文本</TabsTrigger>
            <TabsTrigger value="file" className="flex-1">上传文件</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="pt-3">
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border/80 py-8">
              <Upload className="size-6 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">支持提取器导出的 .json 或 Markdown 笔记 .md</p>
              <label className="relative cursor-pointer">
                <span className="sr-only">选择文件</span>
                <input type="file" accept=".json,.md" className="hidden" onChange={handleFile} />
                <Button type="button" variant="outline" size="sm" onClick={() => { /* 点击 label 即触发 file input */ }}>选择文件</Button>
              </label>
            </div>
          </TabsContent>

          <TabsContent value="paste" className="space-y-3 pt-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">标题（空则"未命名"）</label>
                <Input value={title} onChange={e => setTitle(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs text-muted-foreground">来源链接</label>
                <Input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="https://…" />
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">标签（逗号分隔）</label>
              <Input value={tags} onChange={e => setTags(e.target.value)} placeholder="口播, AI" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">总结（AI 总结 JSON 或自由文本，可空）</label>
              <Textarea value={summary} onChange={e => setSummary(e.target.value)} rows={3} placeholder='{"title":"…","key_points":[…]}' />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">全文 *</label>
              <Textarea value={content} onChange={e => setContent(e.target.value)} rows={8} placeholder="粘贴文案全文…" />
            </div>
            <Button className="w-full" onClick={save} disabled={!content.trim() || create.isPending}>保存</Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}
