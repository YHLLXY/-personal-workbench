import { useState } from 'react'
import { ChevronRight, ChevronDown, FolderPlus, Pencil, Trash2, Plus, Library, Inbox, Folder as FolderIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { Folder } from '@/lib/db/types'
import { useFolderMutations } from './api'
import { toast } from 'sonner'

interface Props {
  folders: Folder[]
  /** null = 全部资料；'__none__' = 未分类；其他 = 文件夹 id */
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/** 文件夹树：固定入口（全部/未分类）+ 多级递归树 + 新建/重命名/删除 */
export function FolderTree({ folders, selectedId, onSelect }: Props) {
  const { create, update, remove } = useFolderMutations()
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  function toggle(id: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  // 新建/重命名统一走 Dialog（替换 window.prompt：移动端体验差且样式不受控）
  const [dialog, setDialog] = useState<{ mode: 'new' | 'rename'; parentId: string | null; folder?: Folder } | null>(null)
  const [name, setName] = useState('')
  const pending = create.isPending || update.isPending

  function openNew(parentId: string | null) {
    if (create.isPending) return
    setName('')
    setDialog({ mode: 'new', parentId })
  }
  function openRename(f: Folder) {
    setName(f.name)
    setDialog({ mode: 'rename', parentId: null, folder: f })
  }
  function submitDialog() {
    if (!dialog || !name.trim() || pending) return
    if (dialog.mode === 'new') {
      create.mutate({ name: name.trim(), parentId: dialog.parentId }, { onSuccess: () => { setDialog(null); toast.success('已创建') } })
    } else if (dialog.folder && name.trim() !== dialog.folder.name) {
      update.mutate({ id: dialog.folder.id, patch: { name: name.trim() } }, { onSuccess: () => { setDialog(null); toast.success('已重命名') } })
    } else setDialog(null)
  }
  function removeFolder(f: Folder) {
    if (!window.confirm('删除文件夹？其中的资料将移到未分类，不删除资料本身')) return
    remove.mutate(f.id, { onSuccess: () => toast.success('已删除') })
  }

  function renderTree(parentId: string | null, depth: number) {
    return folders
      .filter(f => f.parentId === parentId)
      .map(f => {
        const hasChildren = folders.some(c => c.parentId === f.id)
        const isCollapsed = collapsed.has(f.id)
        return (
          <div key={f.id}>
            <div
              className={cn(
                'group flex cursor-pointer items-center gap-1 rounded-md py-1 pr-1 text-sm',
                selectedId === f.id && 'bg-accent text-accent-foreground',
                selectedId !== f.id && 'hover:bg-muted'
              )}
              style={{ paddingLeft: 6 + depth * 12 }}
              onClick={() => onSelect(f.id)}
            >
              <button
                onClick={e => { e.stopPropagation(); if (hasChildren) toggle(f.id) }}
                aria-label={isCollapsed ? '展开' : '折叠'}
                className="shrink-0 text-muted-foreground/70 hover:text-foreground"
              >
                {hasChildren
                  ? isCollapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />
                  : <FolderIcon className="size-3.5" />}
              </button>
              <span className="flex-1 truncate">{f.name}</span>
              <span className="flex shrink-0 items-center gap-0.5 text-muted-foreground/60 md:opacity-0 md:group-hover:opacity-100">
                <button onClick={e => { e.stopPropagation(); openNew(f.id) }} aria-label="新建子文件夹" className="hover:text-foreground"><FolderPlus className="size-3.5" /></button>
                <button onClick={e => { e.stopPropagation(); openRename(f) }} aria-label="重命名" className="hover:text-foreground"><Pencil className="size-3.5" /></button>
                <button onClick={e => { e.stopPropagation(); removeFolder(f) }} aria-label="删除" className="hover:text-destructive"><Trash2 className="size-3.5" /></button>
              </span>
            </div>
            {!isCollapsed && renderTree(f.id, depth + 1)}
          </div>
        )
      })
  }

  return (
    <div className="space-y-0.5">
      <button
        onClick={() => onSelect(null)}
        className={cn('flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm', selectedId === null && 'bg-accent text-accent-foreground', selectedId !== null && 'hover:bg-muted')}
      >
        <Library className="size-3.5 shrink-0" />全部资料
      </button>
      <button
        onClick={() => onSelect('__none__')}
        className={cn('flex w-full cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-sm', selectedId === '__none__' && 'bg-accent text-accent-foreground', selectedId !== '__none__' && 'hover:bg-muted')}
      >
        <Inbox className="size-3.5 shrink-0" />未分类
      </button>
      <div className="my-1.5 border-t border-border/60" />
      {renderTree(null, 0)}
      <Button variant="ghost" size="sm" className="mt-1 w-full justify-start text-muted-foreground" onClick={() => openNew(null)}>
        <Plus className="size-3.5" />新建文件夹
      </Button>

      <Dialog open={dialog != null} onOpenChange={v => !v && setDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>{dialog?.mode === 'rename' ? '重命名文件夹' : dialog?.parentId ? '新建子文件夹' : '新建文件夹'}</DialogTitle></DialogHeader>
          <Input autoFocus value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && submitDialog()}
            placeholder="文件夹名称" className="mt-2" />
          <Button className="w-full" onClick={submitDialog} disabled={!name.trim() || pending}>{pending ? '保存中…' : '保存'}</Button>
        </DialogContent>
      </Dialog>
    </div>
  )
}
