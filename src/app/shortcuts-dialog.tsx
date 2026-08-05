import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { HOTKEYS, formatShortcut } from '@/lib/hotkeys'
import { useUiStore } from './store'

export function ShortcutsDialog() {
  const open = useUiStore(s => s.shortcutsOpen)
  const setOpen = useUiStore(s => s.setShortcutsOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>快捷键</DialogTitle></DialogHeader>
        <div className="space-y-2">
          {HOTKEYS.map(hk => (
            <div key={hk.id} className="flex items-center justify-between gap-4">
              <span className="text-sm">{hk.description}</span>
              <kbd className="text-[10px] border border-border rounded px-1.5 py-0.5 text-muted-foreground">{formatShortcut(hk)}</kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
