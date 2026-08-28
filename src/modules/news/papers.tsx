import { useMemo, useState } from 'react'
import { Search, Plus, Film, FileText, Trash2, Quote, FolderTree as FolderTreeIcon, Library, CircleHelp } from 'lucide-react'
import { usePapers, usePaperMutations, useFolders, useFolderMutations } from './api'
import { formatCitation } from './cite'
import { FolderTree } from './folder-tree'
import { PaperDetail } from './paper-detail'
import { AddPaper } from './add-paper'
import { AddNote } from './add-note'
import { GuideSheet } from './guide-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import type { Paper } from '@/lib/db/types'

const STATUS_LABEL = { want: '想读', reading: '在读', done: '读完' } as const
const TYPE_LABEL = { all: '全部', paper: '论文', note: '文案' } as const
/** 评分筛选 pills：0 = 全部（含未评分），其余为最低星级门槛 */
const RATING_FILTERS = [{ v: 0, label: '全部' }, { v: 3, label: '≥3★' }, { v: 4, label: '≥4★' }, { v: 5, label: '≥5★' }] as const
/** 排序 pills：default = 现有顺序；rating = 评分高→低（null 最后）；title = 标题 A→Z */
const SORT_OPTS = [{ v: 'default', label: '默认' }, { v: 'rating', label: '评分高→低' }, { v: 'title', label: '标题 A→Z' }] as const
/** 'all' = 全部资料；'__none__' = 未分类；其他 = 文件夹 id */
type FolderFilter = 'all' | '__none__' | string

export default function Papers() {
  const { data: papers, isLoading } = usePapers()
  const { update, remove } = usePaperMutations()
  const { data: folders } = useFolders()
  const { create: createFolder } = useFolderMutations()
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | Paper['status']>('all')
  const [typeFilter, setTypeFilter] = useState<'all' | 'paper' | 'note'>('all')
  const [ratingFilter, setRatingFilter] = useState<0 | 3 | 4 | 5>(0)
  const [sortBy, setSortBy] = useState<'default' | 'rating' | 'title'>('default')
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Paper | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [addPaperOpen, setAddPaperOpen] = useState(false)
  const [addNoteOpen, setAddNoteOpen] = useState(false)
  const [treeOpen, setTreeOpen] = useState(false)
  const [guideOpen, setGuideOpen] = useState(false)

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    const list = (papers ?? []).filter(p => {
      if (folderFilter === 'all') { /* 全部 */ }
      else if (folderFilter === '__none__') { if (p.folderId != null) return false }
      else if (p.folderId !== folderFilter) return false
      if (statusFilter !== 'all' && p.status !== statusFilter) return false
      if (typeFilter !== 'all' && (p.type ?? 'paper') !== typeFilter) return false
      if (ratingFilter > 0 && !(p.rating != null && p.rating >= ratingFilter)) return false // 未评分只在「全部」出现
      if (q) {
        const hay = [p.title, p.authors, p.content ?? '', (p.keywords ?? []).join(' ')].join(' ').toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    if (sortBy === 'rating') list.sort((a, b) => (b.rating ?? -1) - (a.rating ?? -1)) // null 视为 -1 沉底
    else if (sortBy === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    return list
  }, [papers, folderFilter, statusFilter, typeFilter, ratingFilter, sortBy, query])

  /** 复制文本到剪贴板，统一 toast 反馈 */
  async function copyText(text: string) {
    try { await navigator.clipboard.writeText(text); toast.success('已复制') } catch { toast.error('复制失败') }
  }

  function newFolderFromMenu() {
    const name = window.prompt('新建文件夹名称')
    if (!name?.trim()) return
    createFolder.mutate({ name: name.trim() }, { onSuccess: () => toast.success('已创建') })
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold">资料库</h1>
          <p className="mt-0.5 text-xs text-muted-foreground">论文与视频文案，统一收纳</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setGuideOpen(true)} aria-label="新手指引" title="新手指引">
            <CircleHelp className="size-4" />
          </Button>
          <Select value={statusFilter} onValueChange={v => setStatusFilter(v as typeof statusFilter)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="want">想读</SelectItem>
              <SelectItem value="reading">在读</SelectItem>
              <SelectItem value="done">读完</SelectItem>
            </SelectContent>
          </Select>
          <Select value={typeFilter} onValueChange={v => setTypeFilter(v as typeof typeFilter)}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['all', 'paper', 'note'] as const).map(t => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
            </SelectContent>
          </Select>
          <DropdownMenu>
            <DropdownMenuTrigger>
              <Button size="sm"><Plus className="size-4" />新建</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              <DropdownMenuItem onClick={newFolderFromMenu}><FolderTreeIcon className="size-4" />新建文件夹</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddPaperOpen(true)}><FileText className="size-4" />添加论文</DropdownMenuItem>
              <DropdownMenuItem onClick={() => setAddNoteOpen(true)}><Film className="size-4" />添加文案笔记</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="flex gap-4">
        {/* 桌面端左栏：文件夹树 */}
        <aside className="hidden w-56 shrink-0 md:block">
          <FolderTree folders={folders ?? []} selectedId={folderFilter === 'all' ? null : folderFilter} onSelect={id => setFolderFilter(id ?? 'all')} />
        </aside>

        <div className="min-w-0 flex-1">
          {/* 移动端：文件夹树收进 Sheet */}
          <div className="mb-3 flex items-center gap-2 md:hidden">
            <Sheet open={treeOpen} onOpenChange={setTreeOpen}>
              <SheetTrigger>
                <Button variant="outline" size="sm"><FolderTreeIcon className="size-3.5" />文件夹</Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetTitle>文件夹</SheetTitle>
                <div className="p-3 pt-1">
                  <FolderTree folders={folders ?? []} selectedId={folderFilter === 'all' ? null : folderFilter} onSelect={id => { setFolderFilter(id ?? 'all'); setTreeOpen(false) }} />
                </div>
              </SheetContent>
            </Sheet>
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索标题 / 作者 / 关键词 / 内容" className="pl-9" />
            </div>
          </div>

          {/* 桌面端搜索框 */}
          <div className="relative mb-3 hidden md:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索标题 / 作者 / 关键词 / 内容" className="pl-9" />
          </div>

          {/* 评分筛选 + 排序 pills（样式与热点页 chips 一致） */}
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">评分</span>
            {RATING_FILTERS.map(f => (
              <button key={f.v} onClick={() => setRatingFilter(f.v)} className={cn('shrink-0 text-xs rounded-full px-3 py-1 border', ratingFilter === f.v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50')}>{f.label}</button>
            ))}
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <span className="text-xs text-muted-foreground">排序</span>
            {SORT_OPTS.map(o => (
              <button key={o.v} onClick={() => setSortBy(o.v)} className={cn('shrink-0 text-xs rounded-full px-3 py-1 border', sortBy === o.v ? 'bg-primary text-primary-foreground border-primary' : 'border-border hover:bg-muted/50')}>{o.label}</button>
            ))}
          </div>

          {isLoading ? <div className="space-y-2"><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /><Skeleton className="h-16 w-full" /></div>
            : (papers ?? []).length === 0 ? (
              <p className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                <Library className="size-8 text-muted-foreground/40" />还没有资料——从导入第一篇论文或第一条文案开始
              </p>
            ) : shown.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">没有匹配的资料</p>
            ) : (
              <div className="divide-y divide-border/70 rounded-2xl border border-border bg-card">
                {shown.map(p => (
                  <div key={p.id} className="flex items-start gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1 cursor-pointer" onClick={() => { setSelected(p); setDetailOpen(true) }}>
                      <div className="flex items-center gap-2">
                        {p.type === 'note' ? <Film className="size-4 shrink-0 text-muted-foreground" /> : <FileText className="size-4 shrink-0 text-muted-foreground" />}
                        <span className="truncate text-sm font-medium hover:text-primary">{p.title}</span>
                        {p.arxivId && <span className="shrink-0 text-[10px] text-muted-foreground">{p.arxivId}</span>}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-muted-foreground">{p.authors || p.source || (p.type === 'note' ? '文案笔记' : '')}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(p.tags ?? []).slice(0, 2).map(t => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div onClick={e => e.stopPropagation()}>
                        <Select value={p.status} onValueChange={v => update.mutate({ id: p.id, patch: { status: v as Paper['status'] } })}>
                          <SelectTrigger className={cn('h-8 w-20 text-xs', p.status === 'reading' && 'text-primary')}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {(['want', 'reading', 'done'] as const).map(s => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <button
                        onClick={() => copyText(formatCitation(p))}
                        aria-label="复制引用"
                        title="复制引用"
                        className="p-1.5 text-muted-foreground/60 hover:text-primary"
                      >
                        <Quote className="size-4" />
                      </button>
                      <button
                        onClick={() => { if (window.confirm('删除该资料？此操作不可恢复')) remove.mutate(p.id) }}
                        aria-label="删除"
                        className="p-1.5 text-muted-foreground/60 hover:text-destructive"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
        </div>
      </div>

      <PaperDetail paper={selected} open={detailOpen} onOpenChange={setDetailOpen} />
      <AddPaper open={addPaperOpen} onOpenChange={setAddPaperOpen} defaultFolderId={folderFilter === 'all' || folderFilter === '__none__' ? null : folderFilter} />
      <AddNote open={addNoteOpen} onOpenChange={setAddNoteOpen} defaultFolderId={folderFilter === 'all' || folderFilter === '__none__' ? null : folderFilter} />
      <GuideSheet open={guideOpen} onOpenChange={setGuideOpen} />
    </div>
  )
}
