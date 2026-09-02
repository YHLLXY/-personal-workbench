import { useEffect, useState } from 'react'
import { BellRing, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { isCloudMode, repository } from '@/lib/db'
import { getSupabaseClient } from '@/lib/db/supabase-client'
import { urlBase64ToUint8Array } from '@/lib/push-utils'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined
const isIOS = typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent)
const isAndroidChrome = typeof navigator !== 'undefined' && /Android.*Chrome/.test(navigator.userAgent)

/** 「我的」页「通知设置」分组：Web Push 订阅/退订 + 平台提示 + Server酱配置。
 *  v1.23 套分组行壳 + 状态徽章（已开启/已配置），订阅与推送逻辑一行未动。 */
export function NotificationSection() {
  const [subscribed, setSubscribed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [scKey, setScKey] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!isCloudMode) return
    repository.listPushSubscriptions().then(rows => setSubscribed(rows.length > 0)).catch(() => {})
    repository.getChannelConfigs().then(c => setScKey(c.serverchanKey ?? '')).catch(() => {})
  }, [])

  async function subscribe() {
    if (!VAPID_PUBLIC_KEY) { toast.error('服务器未配置推送密钥，请先在 Vercel 配置 VITE_VAPID_PUBLIC_KEY'); return }
    setBusy(true)
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) throw new Error('浏览器不支持 Web Push')
      // 请求系统通知权限（前台 Notification 弹窗与 Web Push 共用此权限）
      if ('Notification' in window && Notification.permission !== 'granted') await Notification.requestPermission()
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) })
      const p256dh = sub.getKey('p256dh')
      const auth = sub.getKey('auth')
      if (!p256dh || !auth) throw new Error('浏览器未返回推送密钥，无法订阅')
      await repository.savePushSubscription({ endpoint: sub.endpoint, keysP256dh: btoa(String.fromCharCode(...new Uint8Array(p256dh))), keysAuth: btoa(String.fromCharCode(...new Uint8Array(auth))), userAgent: navigator.userAgent })
      setSubscribed(true)
      toast.success('已开启推送通知')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '订阅失败，请重试')
    } finally { setBusy(false) }
  }

  async function unsubscribe() {
    setBusy(true)
    try {
      const reg = await navigator.serviceWorker.ready
      const sub = await reg.pushManager.getSubscription()
      if (sub) {
        await repository.removePushSubscription(sub.endpoint)
        await sub.unsubscribe()
      }
      setSubscribed(false)
      toast.success('已关闭推送通知')
    } catch { toast.error('退订失败，请重试') } finally { setBusy(false) }
  }

  async function testSend() {
    try {
      const sb = getSupabaseClient()
      const { data: { session } } = await sb.auth.getSession()
      if (!session) { toast.error('未登录'); return }
      const r = await fetch('/api/test-notify', { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` } })
      const j = await r.json() as { sent?: number }
      toast.success(`测试通知已发送（${j.sent ?? 0} 个通道）`)
    } catch { toast.error('发送失败，请重试') }
  }

  async function saveScKey() {
    setSaving(true)
    try {
      await repository.saveChannelConfigs({ serverchanKey: scKey.trim() || null })
      toast.success('已保存')
    } catch { toast.error('保存失败') } finally { setSaving(false) }
  }

  if (!isCloudMode) {
    return (
      <section>
        <h2 className="mb-2 text-sm font-semibold">通知设置</h2>
        <div className="rounded-2xl border border-border bg-card">
          <p className="px-4 py-3 text-xs text-muted-foreground">本地模式不支持系统推送；启用云端同步后可在浏览器/手机接收提醒。</p>
        </div>
      </section>
    )
  }

  return (
    <section>
      <h2 className="mb-2 text-sm font-semibold">通知设置</h2>
      <div className="divide-y divide-border rounded-2xl border border-border bg-card">
        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <BellRing className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">浏览器推送（Web Push）</div>
              <p className="mt-0.5 text-xs text-muted-foreground">iOS Safari 需先添加到主屏幕；安卓 Chrome 因 FCM 被墙不可用，建议使用下方 Server酱</p>
            </div>
            <Badge variant={subscribed ? 'default' : 'outline'} className="shrink-0">{subscribed ? '已开启' : '未开启'}</Badge>
          </div>
          <div className="flex flex-wrap gap-2 pl-7">
            {subscribed ? (
              <Button size="sm" variant="outline" onClick={unsubscribe} disabled={busy}>关闭推送</Button>
            ) : (
              <Button size="sm" onClick={subscribe} disabled={busy}><BellRing className="mr-1 size-3.5" />订阅推送</Button>
            )}
            <Button size="sm" variant="outline" onClick={testSend} disabled={busy || (!subscribed && !scKey.trim())}>测试发送</Button>
          </div>
          {isIOS && <p className="text-[10px] text-muted-foreground/70">📱 iPhone：请先分享到主屏幕（添加到主屏幕）后使用推送。</p>}
          {isAndroidChrome && <p className="text-[10px] text-muted-foreground/70">🤖 安卓 Chrome 的推送服务（FCM）在中国大陆不可用，请配置下方 Server酱通过微信接收。</p>}
        </div>

        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <Send className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
            <div className="min-w-0 flex-1 text-sm">Server酱（微信通知，安卓/桌面通用）</div>
            <Badge variant={scKey.trim() ? 'default' : 'outline'} className="shrink-0">{scKey.trim() ? '已配置' : '未配置'}</Badge>
          </div>
          <div className="flex gap-2 pl-7">
            <Input aria-label="Server酱 SendKey" placeholder="sctp…" value={scKey} onChange={e => setScKey(e.target.value)} className="h-9 flex-1 font-mono text-xs" />
            <Button size="sm" variant="outline" onClick={saveScKey} disabled={saving}>保存</Button>
          </div>
          <p className="text-[10px] text-muted-foreground/70">在 sct.ftqq.com 获取 SendKey 后粘贴保存；保存后可点「测试发送」验证微信接收。</p>
        </div>
      </div>
    </section>
  )
}
