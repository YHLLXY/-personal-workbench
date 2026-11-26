import { createContext, useContext } from 'react'

export interface ConfirmOptions {
  title: string
  description?: string
  confirmLabel?: string
  /** 危险操作（删除等）：确认按钮用 destructive 样式 */
  destructive?: boolean
}

/** 确认框的调用签名（Promise 形式，写法跟 window.confirm 一样短） */
export type ConfirmFn = (o: ConfirmOptions) => Promise<boolean>

export const ConfirmContext = createContext<ConfirmFn | null>(null)

/** 没有 Provider 时退化成 window.confirm，避免组件在测试/孤立渲染里直接崩 */
export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext)
  return ctx ?? ((o: ConfirmOptions) => Promise.resolve(window.confirm(o.description ? o.title + '\n\n' + o.description : o.title)))
}
