import { useEffect, useState } from 'react'
import { BellRing, MessageCircle, Send } from 'lucide-react'
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
  // v1.26：Telegram 通道
  const [tgToken, setTgToken] = useState('')
  const [tgChatId, setTgChatId] = useState('')
  const [tgBusy, setTgBusy] = useState(false)
  /** 最近一次「测试发送」的逐通道结果（v1.32）：旧版只回一个 sent 计数，Telegram 失败被静默吞掉 */
  const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null)

  useEffect(() => {
    if (!isCloudMode) return
    repository.listPushSubscriptions().then(rows => setSubscribed(rows.length > 0)).catch(() => {})
    repository.getChannelConfigs().then(c => {
      setScKey(c.serverchanKey ?? '')
      setTgToken(c.telegramBotToken ?? '')
      setTgChatId(c.telegramChatId ?? '')
    }).catch(() => {})
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

  const CHANNEL_CN: Record<string, string> = { webpush: '浏览器推送', serverchan: 'Server酱', telegram: 'Telegram' }

  async function testSend() {
    try {
      const sb = getSupabaseClient()
      const { data: { session } } = await sb.auth.getSession()
      if (!session) { toast.error('未登录'); return }
      const r = await fetch('/api/test-notify', { method: 'POST', headers: { authorization: `Bearer ${session.access_token}` } })
      const j = await r.json() as { sent?: number; results?: Array<{ channel: string; ok: boolean; error?: string }> }
      const results = j.results ?? []
      const bad = results.filter(x => !x.ok)
      if (results.length === 0) {
        setTestResult({ ok: false, text: '没有可用的通道：先订阅推送，或配置 Server酱 / Telegram' })
        toast.error('没有可用的通道')
        return
      }
      if (bad.length === 0) {
        setTestResult({ ok: true, text: `${j.sent ?? 0} 个通道已送达` })
        toast.success(`测试通知已发送（${j.sent ?? 0} 个通道）`)
        return
      }
      // 失败原样回显服务端错误（chat not found / code 400 …），不再只给一个笼统的「发送失败」
      const text = bad.map(b => `${CHANNEL_CN[b.channel] ?? b.channel}：${b.error ?? '失败'}`).join('；')
      setTestResult({ ok: false, text })
      toast.error('部分通道失败', { description: text })
    } catch { toast.error('发送失败，请重试') }
  }

  // ⚠️ saveChannelConfigs 是整行覆盖：三个字段必须一起传，否则会把另一个通道的配置清掉
  async function saveScKey() {
    setSaving(true)
    try {
      await repository.saveChannelConfigs({ serverchanKey: scKey.trim() || null, telegramBotToken: tgToken.trim() || null, telegramChatId: tgChatId.trim() || null })
      toast.success('已保存')
    } catch { toast.error('保存失败') } finally { setSaving(false) }
  }

  /** Telegram「保存并测试」：先在服务端 getMe 校验 Token + 真发一条测试消息，**通过才落库**。
   *  这样错 Token / 错 Chat ID 不会污染数据库；错误描述（401 Unauthorized / chat not found）原样回显。 */
  async function saveTelegram() {
    const token = tgToken.trim()
    const chat = tgChatId.trim()
    if (!token || !chat) { toast.error('请填写 Bot Token 和 Chat ID'); return }
    setTgBusy(true)
    try {
      const sb = getSupabaseClient()
      const { data: { session } } = await sb.auth.getSession()
      if (!session) { toast.error('未登录'); return }
      const r = await fetch('/api/telegram-test', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${session.access_token}` },
        body: JSON.stringify({ botToken: token, chatId: chat }),
      })
      const j = await r.json() as { ok?: boolean; step?: string; error?: string; botUsername?: string }
      if (!j.ok) {
        toast.error(j.step === 'chat' ? `Chat ID 有误：${j.error ?? ''}` : `Bot Token 有误：${j.error ?? ''}`)
        return
      }
      await repository.saveChannelConfigs({ serverchanKey: scKey.trim() || null, telegramBotToken: token, telegramChatId: chat })
      toast.success(`已连接 @${j.botUsername ?? 'bot'}，测试消息已发出`)
    } catch { toast.error('保存失败，请重试') } finally { setTgBusy(false) }
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
            <Button size="sm" variant="outline" onClick={testSend} disabled={busy || (!subscribed && !scKey.trim() && !tgToken.trim())}>测试发送</Button>
          </div>
          {testResult && (
            <p className={`pl-7 text-[10px] ${testResult.ok ? 'text-muted-foreground/70' : 'text-destructive'}`}>
              上次测试：{testResult.text}
            </p>
          )}
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

        <div className="space-y-2 px-4 py-3">
          <div className="flex items-center gap-3">
            <MessageCircle className="size-4 shrink-0 text-primary" strokeWidth={1.7} />
            <div className="min-w-0 flex-1">
              <div className="text-sm">Telegram Bot（服务端直发，不受 FCM 被墙影响）</div>
              <p className="mt-0.5 text-xs text-muted-foreground">在 @BotFather 建 Bot 取 Token；先给这个 Bot 发一条消息，再用 @userinfobot 查你的 Chat ID</p>
            </div>
            <Badge variant={tgToken.trim() && tgChatId.trim() ? 'default' : 'outline'} className="shrink-0">{tgToken.trim() && tgChatId.trim() ? '已配置' : '未配置'}</Badge>
          </div>
          <div className="grid gap-2 pl-7 sm:grid-cols-2">
            <Input aria-label="Telegram Bot Token" type="password" autoComplete="off" placeholder="123456789:AA…" value={tgToken} onChange={e => setTgToken(e.target.value)} className="h-9 font-mono text-xs" />
            <Input aria-label="Telegram Chat ID" placeholder="Chat ID（形如 123456789）" value={tgChatId} onChange={e => setTgChatId(e.target.value)} className="h-9 font-mono text-xs" />
          </div>
          <div className="pl-7">
            <Button size="sm" onClick={saveTelegram} disabled={tgBusy}>{tgBusy ? '校验中…' : '保存并测试'}</Button>
          </div>
          <p className="pl-7 text-[10px] text-muted-foreground/70">会先调 getMe 校验 Token、再真发一条测试消息；**校验不通过不会写库**。推送由 Vercel 服务端发起，国内无需代理。</p>
        </div>
      </div>
    </section>
  )
}
