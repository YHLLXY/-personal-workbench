import { useCallback, useRef, useState, type ReactNode } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { ConfirmContext, type ConfirmFn, type ConfirmOptions } from './confirm-context'

/**
 * 统一的二次确认（v1.35）。
 *
 * 为什么不用 window.confirm：它是**阻塞式原生弹窗**，样式不可控、移动端上会盖住安全区，
 * 而且没法显示"删除后 6 秒可撤销"这类关键信息。原生弹窗用多了，用户会形成"闭眼点确定"的肌肉记忆。
 *
 * 组件只导出 Provider（fast-refresh 要求组件文件只导出组件）；
 * 调用侧从 \`@/components/confirm-context\` 取 useConfirm。
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null)
  const resolveRef = useRef<((v: boolean) => void) | null>(null)

  const confirm = useCallback<ConfirmFn>((next: ConfirmOptions) => new Promise<boolean>(resolve => {
    // 上一个还没回答就被新请求覆盖：把前一个当作"取消"，否则它的 Promise 永远悬着
    resolveRef.current?.(false)
    resolveRef.current = resolve
    setOpts(next)
  }), [])

  function settle(value: boolean) {
    resolveRef.current?.(value)
    resolveRef.current = null
    setOpts(null)
  }

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog open={opts !== null} onOpenChange={o => { if (!o) settle(false) }}>
        <DialogContent className="max-w-[22rem]">
          <DialogHeader>
            <DialogTitle>{opts?.title}</DialogTitle>
            {opts?.description && <DialogDescription>{opts.description}</DialogDescription>}
          </DialogHeader>
          <DialogFooter className="flex-row justify-end gap-2">
            <Button variant="outline" className="h-11 flex-1 sm:flex-none" onClick={() => settle(false)}>取消</Button>
            <Button variant={opts?.destructive ? 'destructive' : 'default'} className="h-11 flex-1 sm:flex-none"
              onClick={() => settle(true)}>
              {opts?.confirmLabel ?? '确定'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ConfirmContext.Provider>
  )
}
