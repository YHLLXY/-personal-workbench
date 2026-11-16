/**
 * 前台通知的本机去重账本（localStorage）。
 *
 * 为什么必须落盘：服务端的 `sent_at` 只在**所有已配置通道都送达**时才写（v1.32 按通道记账）。
 * 只要有一个通道失败（例如 Telegram 没配对）、或者一个通道都没配，这条提醒的 sentAt 就永远是 null。
 * 而横幅判断「要不要弹」只看 sentAt —— 于是每回一次首页（组件重新挂载、开发时 StrictMode 双执行）
 * 就把同一条提醒再弹一次，用户看到的就是「一个任务的提醒发了多次」。
 *
 * 键 = 提醒 id + 计划时刻：把提醒改到别的时间是一条新提醒，应该再提醒一次。
 */
const KEY = 'wb-notified'
const TTL_MS = 7 * 24 * 60 * 60 * 1000
type Ledger = Record<string, number>

function defaultStorage(): Storage | null {
  try { return localStorage } catch { return null } // SSR / 隐私模式下访问会抛
}

function readLedger(s: Storage | null, now: number): Ledger {
  if (!s) return {}
  try {
    const raw = JSON.parse(s.getItem(KEY) ?? '{}') as Record<string, unknown>
    const out: Ledger = {}
    for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && now - v < TTL_MS) out[k] = v
    return out
  } catch { return {} } // 账本损坏就当空的，绝不因为去重把功能搞崩
}

export function reminderKey(id: string, scheduledAt: string): string {
  return `${id}@${scheduledAt}`
}

/**
 * 返回「本机还没提醒过」的键，并当场记账。
 * 一次调用 = 一次认领：同一个键第二次进来会得到空结果（重挂载、StrictMode 双执行都不会重复弹）。
 */
export function claimNotifications(keys: string[], now: number = Date.now(), s: Storage | null = defaultStorage()): string[] {
  const ledger = readLedger(s, now)
  const fresh = keys.filter(k => !(k in ledger))
  if (fresh.length === 0) return []
  for (const k of fresh) ledger[k] = now
  try { s?.setItem(KEY, JSON.stringify(ledger)) } catch { /* 配额满：下次会重复弹，但不能因此丢通知 */ }
  return fresh
}

/** 测试用：清空账本 */
export function resetNotificationLedger(s: Storage | null = defaultStorage()): void {
  try { s?.removeItem(KEY) } catch { /* ignore */ }
}
