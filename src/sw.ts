/// <reference lib="webworker" />
/** 个人工作台 Service Worker（injectManifest 模式）：
 *  处理后台 Web Push（push 事件显示通知；notificationclick 聚焦/打开应用）。 */
import { clientsClaim } from 'workbox-core'
import { precacheAndRoute, cleanupOutdatedCaches } from 'workbox-precaching'

declare const self: ServiceWorkerGlobalScope

export {}

// 构建时由 vite-plugin-pwa/workbox-build 将资源清单注入到 self.__WB_MANIFEST
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// autoUpdate 模式（registerType: 'autoUpdate' + registerSW 虚拟模块）：
// 安装即接管，让手机在下次打开时自动升级到最新版本
self.skipWaiting()
clientsClaim()

self.addEventListener('push', (event) => {
  let title = '个人工作台提醒'
  let body = '你有新的提醒'
  let url = '/reminders'
  try {
    const data = event.data?.json()
    if (data) {
      title = typeof data.title === 'string' ? data.title : title
      body = typeof data.body === 'string' ? data.body : body
      url = typeof data.url === 'string' ? data.url : url
    }
  } catch { /* 非 JSON 载荷忽略 */ }
  event.waitUntil(self.registration.showNotification(title, { body, icon: '/pwa-192x192.png', data: { url } }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data as { url?: string } | undefined)?.url ?? '/reminders'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(winClients => {
      for (const c of winClients) {
        if ('focus' in c) { c.focus(); return undefined }
      }
      return self.clients.openWindow(url)
    }),
  )
})

// 离线导航回退：网络失败时返回缓存的 index.html（替代 generateSW 的 navigateFallback）
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match('/index.html').then(r => r ?? fetch(event.request)),
    ),
  )
})
