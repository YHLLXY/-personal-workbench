import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { X } from 'lucide-react'
import { toast } from 'sonner'
import { repository } from '@/lib/db'
import type { Subscriptions } from '@/lib/db/types'
import type { HotSourceMeta } from '@/lib/hot'

const CATEGORY_LABELS: Record<string, string> = { tech: '技术', academic: '学术', zh: '社区' }

export function HotSettingsDialog({ sources, open, onOpenChange, onSaved }: {
  sources: HotSourceMeta[]
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: (s: Subscriptions) => void
}) {
  const [subs, setSubs] = useState<Subscriptions>({ sourceIds: [], topics: [] })
  const [topicInput, setTopicInput] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    repository.getSubscriptions().then(setSubs).catch(() => setSubs({ sourceIds: [], topics: [] }))
  }, [open])

  const allSelected = subs.sourceIds.length === 0
  const toggleAll = () => setSubs(s => ({ ...s, sourceIds: allSelected ? sources.map(x => x.id) : [] }))
  const toggleSource = (id: string) => setSubs(s => ({
    ...s,
    sourceIds: s.sourceIds.includes(id) ? s.sourceIds.filter(x => x !== id) : [...s.sourceIds, id],
  }))
  const addTopic = () => {
    const t = topicInput.trim()
    if (!t || subs.topics.includes(t)) return
    setSubs(s => ({ ...s, topics: [...s.topics, t] }))
    setTopicInput('')
  }
  async function save() {
    setBusy(true)
    try {
      await repository.saveSubscriptions(subs)
      onSaved(subs)
      onOpenChange(false)
      toast.success('订阅已保存')
    } catch { toast.error('保存失败，请重试') } finally { setBusy(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>管理热点源</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-muted-foreground">信息源（{allSelected ? '全部' : subs.sourceIds.length + ' 个'}）</span>
              <button onClick={toggleAll} className="text-xs text-primary">{allSelected ? '取消全选' : '全选'}</button>
            </div>
            {(['tech', 'academic', 'zh'] as const).map(cat => {
              const list = sources.filter(s => s.category === cat)
              if (list.length === 0) return null
              return (
                <div key={cat} className="mb-3">
                  <div className="text-[11px] text-muted-foreground mb-1.5">{CATEGORY_LABELS[cat] ?? cat}</div>
                  <div className="flex flex-wrap gap-2">
                    {list.map(s => (
                      <label key={s.id} className="flex items-center gap-1.5 text-xs border border-border rounded-lg px-2.5 py-1.5 cursor-pointer select-none has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5">
                        <Checkbox checked={allSelected || subs.sourceIds.includes(s.id)} onCheckedChange={() => toggleSource(s.id)} />
                        {s.name}{s.experimental && <span className="text-[10px] text-muted-foreground">实验</span>}
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
          <div>
            <span className="text-xs font-medium text-muted-foreground">主题关键词（热点按此筛选）</span>
            <div className="flex flex-wrap gap-1.5 mt-2">
              {subs.topics.map(t => (
                <Badge key={t} variant="secondary" className="gap-1">
                  {t}
                  <button onClick={() => setSubs(s => ({ ...s, topics: s.topics.filter(x => x !== t) }))} aria-label={`删除 ${t}`}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <Input
                value={topicInput}
                onChange={e => setTopicInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTopic() } }}
                placeholder="添加主题关键词，回车确认"
                className="h-7 w-44 text-xs"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button onClick={save} disabled={busy}>{busy ? '保存中…' : '保存'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
