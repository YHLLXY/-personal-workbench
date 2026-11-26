import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { TaskForm } from './task-form'
import type { Task } from '@/lib/db/types'

/** 宽屏判定：>=768px 用居中 Dialog，手机上用底部 Sheet（同一套 TaskForm，不写两份表单） */
function useWide(): boolean {
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 768px)').matches)
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia('(min-width: 768px)')
    const sync = () => setWide(mql.matches)
    sync()
    mql.addEventListener('change', sync)
    return () => mql.removeEventListener('change', sync)
  }, [])
  return wide
}

/**
 * 新建 / 编辑任务的外壳（v1.35）。
 *
 * 表单本身在 task-form.tsx；这里只决定"长在哪"：桌面居中 Dialog、移动端底部 Sheet。
 * 移动端用 Sheet 而不是 Dialog，是为了让键盘弹出时表单贴着键盘、吸底按钮始终可见——
 * 居中弹窗被键盘顶起后会有一半跑到屏幕外（委托书 5.4 的"键盘弹出时添加仍然可见"）。
 */
export function TaskDialog({ open, onOpenChange, editing }: { open: boolean; onOpenChange: (v: boolean) => void; editing?: Task | null }) {
  const wide = useWide()
  const title = editing ? '编辑任务' : '新建任务'
  const close = () => onOpenChange(false)

  if (!wide) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="max-h-[92dvh] gap-0">
          <SheetHeader><SheetTitle>{title}</SheetTitle></SheetHeader>
          {open && <TaskForm editing={editing} onDone={close} />}
        </SheetContent>
      </Sheet>
    )
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{title}</DialogTitle></DialogHeader>
        {open && <TaskForm editing={editing} onDone={close} />}
      </DialogContent>
    </Dialog>
  )
}
