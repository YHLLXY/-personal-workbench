import { useEffect } from 'react'
import { useUiStore } from './store'

/**
 * 让浮层（快速捕获 / 命令面板 / 快捷键）参与浏览器历史：
 * 手机上按返回键时先关浮层，而不是把**浮层背后的页面**翻走。
 *
 * 背景（2026-11-16 复现）：浮层只存在 zustand 里，从来没进过 history。
 * 在「学习 → 首页」这种有历史记录的路径下打开快速捕获，按返回键时 URL 在 / 与 /study 之间
 * 来回跳、浮层一直盖在上面关不掉 —— 观感就是「界面反复横跳、退不出来」。
 *
 * 做法：任意浮层打开时压入一条**同 URL** 的历史记录。返回键弹掉它 → popstate → 关浮层，URL 不变。
 * 手动关闭（X / 遮罩 / Esc）时把这条记录也弹掉，免得历史里留一条「按返回没反应」的死记录。
 *
 * 两个必须处理好的细节：
 * ① 从命令面板点「新建任务」是**先关面板再开快速捕获**（同一 tick 两次切换）。若在 cleanup 里
 *    立刻 back()，这条异步的 back 会把新浮层刚压入的记录弹掉 —— 面板一闪就自己关了。
 *    所以 back() 推迟到微任务，并用 token 判断「是不是紧接着又开了新浮层」：是的话把这条记录留给它。
 * ② 由返回键关闭时（popstate），当前记录已经不是我们那条了，cleanup 里必须跳过 back()，
 *    否则会多退一步、把用户带离当前页。
 */
let overlayToken = 0

export function useOverlayBack() {
  const open = useUiStore(s => s.paletteOpen || s.captureOpen || s.shortcutsOpen)

  useEffect(() => {
    if (!open) return
    const token = ++overlayToken
    // 多个浮层接力时复用同一条记录（例如命令面板 → 快速捕获），不要压两层
    if (window.history.state?.wbOverlay !== true) {
      window.history.pushState({ ...(window.history.state ?? {}), wbOverlay: true }, '')
    }
    const onPop = () => {
      const s = useUiStore.getState()
      s.setPaletteOpen(false)
      s.setCaptureOpen(false)
      s.setShortcutsOpen(false)
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      queueMicrotask(() => {
        if (token !== overlayToken) return // 紧接着又开了新浮层：这条记录留给它
        if (window.history.state?.wbOverlay !== true) return // 已经被返回键弹掉了
        window.history.back()
      })
    }
  }, [open])
}
