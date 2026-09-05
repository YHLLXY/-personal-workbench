# 修复方案：开启推送通知后全站「页面出错了」崩溃

> **任务书**：交给执行模型（混元4）实施的修复计划。本文档为唯一事实源，改动范围严格限定在第 4 节列出的 3 处，其余「顺带发现」只记录不动代码。
> **崩溃版本**：v1.23.1（线上云端模式，Vercel + Supabase）。**实测环境**：安卓 Edge，PWA 添加到主屏幕（standalone）。
> **复现率**：需同时满足两个前置条件（见 §2.4），满足则 100% 复现。

---

## 1. 症状

用户首次点击「我的 → 通知设置 → 订阅推送」，并在系统弹窗中**允许通知权限**后：

1. 首页内容区变为「页面出错了」（`src/components/error-boundary.tsx` DefaultFallback 文案，说明是**渲染期错误**而非网络/接口错误）；
2. 切换到任何页面（待办/学习/复盘…）**都显示同一个错误页**；
3. 点「重试」后**立即再次崩溃**，应用永久卡死，只能硬刷新。

## 2. 根因分析（三层：本体 → 传播 → 放大）

### 2.1 本体：前台通知用了被浏览器禁止的 `new Notification()` 构造器

位置：`src/modules/reminders/reminder-banner.tsx` 第 28 行

```ts
const n = new Notification('个人工作台提醒', { body: `...`, icon: '/pwa-192x192.png' })
n.onclick = () => { window.focus(); n.close() }
```

**平台事实（本 bug 的技术本质）**：

- **Chromium 全系（Chrome 桌面/安卓、Edge 桌面/安卓同内核同行为）**：页面一旦被 Service Worker 控制，`new Notification()` 抛
  `TypeError: Failed to construct 'Notification': Illegal constructor. Use ServiceWorkerRegistration.showNotification() instead.`（Chrome 59 起的规范行为）。
  **实际崩溃环境即安卓 Edge PWA**（添加到主屏幕后 SW 必然控制页面）——根因在该环境 100% 成立。
- **iOS Safari / iOS PWA**：`new Notification()` **从未被实现**，任何情况下抛同一 TypeError；iOS 上合法路径只有 `ServiceWorkerRegistration.showNotification()`

而本项目的 Service Worker 是 `autoUpdate` 模式且在 `src/sw.ts` 第 48-49 行执行了 `self.skipWaiting()` + `self.clientsClaim()` —— **所有页面加载后必然被 SW 控制**。结论：**在 Chrome 系和 iOS 上，这行代码一旦被执行就必定抛错**。

### 2.2 为什么潜伏至今：执行前提是「通知权限已授予」

`reminder-banner.tsx` 第 21-31 行 useEffect 的守卫：

```ts
if (!('Notification' in window) || Notification.permission !== 'granted') return
```

推送模块做好后用户**从未开启过通知权限**（permission 恒为 `'default'`），useEffect 每次都在第 22 行提前返回，`new Notification` 从未执行——bug 长期休眠。

**今天**用户第一次点「订阅推送」：`notifications-section.tsx` 第 35 行 `Notification.requestPermission()` → 用户点「允许」→ `permission === 'granted'`。守卫放行，bug 激活。

**安卓环境关键细节**：`Notification.requestPermission()` 在 `pushManager.subscribe()` **之前**执行——权限授予与推送订阅是两步独立动作。安卓 Edge/Chrome 的 Web Push 走 FCM 通道，在中国大陆不可达，因此安卓上「订阅推送」大概率在 subscribe 一步失败并 toast「订阅失败」，**但通知权限此刻已经持久化为 granted**——崩溃链照样激活。这就是「点了订阅、订阅还失败了、结果反而全站崩了」的完整安卓时序：崩溃与订阅成败无关，只与权限授予有关。

### 2.3 传播与放大：为什么「所有界面」都崩、为什么重试救不回来

```
[设置页] 点「订阅推送」→ 允许通知权限（granted）→ 订阅入库 → toast 成功
   ↓ 用户回到首页
[首页] useReminders 数据到达（缓存或 refetch）
   → ReminderBanner useEffect：granted ✓ + 存在到期未读提醒 ✓
   → new Notification(...) → TypeError: Illegal constructor
   ↓
useEffect 内的错误冒泡到 React → 被 layout.tsx 第 124 行的内层 <ErrorBoundary> 捕获
   → 首页内容区显示「页面出错了」
   ↓ 放大器 ①
layout.tsx:124 的 <ErrorBoundary> 没有 key —— 路由切换时组件实例不变、
error state 保留 → 切到任何页面仍显示同一 fallback（全站粘死）
   ↓ 放大器 ②
点「重试」（reset）→ banner 重挂载 → useReminders 缓存数据同步可用
   → useEffect 立即再次执行 → 再次抛错 → 死循环
```

- ReminderBanner 只挂在首页（`src/app/home.tsx:50`），但 ErrorBoundary 不随路由重置使**单页错误变成全站错误**。
- `notifiedRef` 的去重 id 是在 `new Notification` **之后**才写入（第 30 行），抛错时永远写不进去，每次 effect 重跑都再次抛错——崩溃可稳定复现、不会自愈。

### 2.4 复现前置条件（两问自检）

1. `Notification.permission === 'granted'`（首次订阅推送并允许后满足，此后一直满足）；
2. 存在**至少一条** `!sentAt && !dismissedAt && scheduledAt <= now` 的提醒（reminder-banner.tsx 第 23 行）。

两条同时满足 → 打开首页即崩。这就是「一直没用没事，今天点了一下就崩」的完整解释。

### 2.5 为什么测试没拦住

- `tests/reminder-banner.test.tsx`（第 58-98 行）用 jsdom stub 的 `MockNotification`（构造**不抛**），jsdom 没有「SW 控制页面」概念，完全掩盖了真机 Illegal constructor 行为；
- `src/test-setup.ts` 只补了 `PushManager` 桩，未覆盖 Notification 真机语义；
- e2e 冒烟（`e2e/`）无任何推送相关用例。

### 2.6 运行环境确认（用户实测环境：安卓 Edge + 添加到主屏幕 PWA）

- 安卓 Edge 为 Chromium 内核：§2.1 的 Illegal constructor 行为一致适用；PWA 模式下 SW 控制页面，命中条件完整，无需任何额外假设。
- **修复方案 1 在该环境可行且有效**：`ServiceWorkerRegistration.showNotification()` 是**本地通知** API，不经过任何推送服务器、不依赖 FCM——修复后前台到期提醒在安卓 Edge 上可直接恢复工作（即使 Web Push 订阅从未成功过）。
- 边界说明：**后台推送**（应用被杀后接收）在安卓上仍依赖 FCM，大陆不可用；安卓端可靠通道是项目已有的 Server酱（`notifications-section.tsx` 的提示文案已写明，本次不改 UI 文案）。
- Android 13+ 的 APP 级通知权限（系统设置里 Edge 的通知开关）若被用户在系统层面关闭，`showNotification` 会失败——已被方案 1 的 `.catch()` 兜底：不崩、只静默。
- `src/sw.ts` 的 `notificationclick`（第 66-81 行）在安卓 Edge PWA 下工作正常（聚焦已打开的应用窗口），组件侧无需任何平台分支代码。

---

## 3. 修复策略

| # | 改动 | 性质 | 文件 |
|---|---|---|---|
| 1 | 前台通知改走 Service Worker 通道 `showNotification()` + 全程防抛 | **根治** | `src/modules/reminders/reminder-banner.tsx` |
| 2 | 内层 ErrorBoundary 按路由 key 重置 | **止损**（防单页错误全站化，本次崩溃放大器） | `src/app/layout.tsx` |
| 3 | 补真机语义回归测试 | 防复发 | `tests/reminder-banner.test.tsx` |

设计依据（AGENTS.md 工程准则）：#1 采用成熟产品统一模式（MDN/GitHub Notifications PWA 均只用 `registration.showNotification`，它是 Chrome 与 iOS 唯一共同合法路径），不引入新依赖；点击后聚焦行为由 `src/sw.ts` 第 66-81 行**已有的** `notificationclick` 处理器承接（聚焦窗口/打开 `/reminders`），组件侧 `n.onclick` 直接删除，无兼容层。

---

## 4. 具体改动（按此执行，勿扩大范围）

### 改动 1（核心）：`src/modules/reminders/reminder-banner.tsx`

**替换**第 20-31 行的 useEffect 为：

```ts
  // 前台系统通知：到期未发送的提醒弹系统通知（每 id 每次会话仅弹一次，避免本地模式重复打扰）
  useEffect(() => {
    if (!('Notification' in window) || Notification.permission !== 'granted') return
    const due = (reminders ?? []).filter(r => !r.sentAt && !r.dismissedAt && new Date(r.scheduledAt).getTime() <= Date.now())
    // 清理已处理/已忽略的 id（忽略后可重新提醒）
    for (const id of notifiedRef.current) if (!due.some(r => r.id === id)) notifiedRef.current.delete(id)
    const fresh = due.filter(r => !notifiedRef.current.has(r.id))
    if (fresh.length === 0) return
    // 去重 id 先登记：通知是 fire-and-forget，失败不重试（每次 effect 重跑都重试反而骚扰）
    for (const r of fresh) notifiedRef.current.add(r.id)
    // 必须走 SW 通道：Chrome（SW 控制下）与 iOS 均禁用 new Notification 构造器
    //（TypeError: Illegal constructor，v1.23 全站崩溃根因），registration.showNotification 是唯一跨平台合法路径。
    // 点击行为由 sw.ts 的 notificationclick（聚焦窗口）承接。通知是增强能力：任何失败静默，绝不冒泡到 ErrorBoundary。
    void navigator.serviceWorker?.ready
      .then(reg => reg.showNotification('个人工作台提醒', { body: `${fresh.length} 条提醒待处理，点击查看`, icon: '/pwa-192x192.png' }))
      .catch(() => { /* 无 SW / 发送失败：静默，应用内提醒中心仍是完整通道 */ })
  }, [reminders])
```

要点：
- 删除 `const n = new Notification(...)` 与 `n.onclick` 两行（onclick 职责已在 SW 端实现，勿重复）；
- `void` + `.catch()`：promise 链任何环节抛错都被吞掉，**不得**让 effect 抛出；
- 去重 id 登记移到发起之前（原第 30 行在构造之后，抛错时登记不上，这是「重试死循环」的帮凶）；
- 不做环境探测分支（`new Notification` fallback 等）——不保留向后兼容，单一通道最简。

### 改动 2（止损）：`src/app/layout.tsx`

第 124 行：

```tsx
// 改前
<ErrorBoundary>
// 改后
<ErrorBoundary key={location.pathname}>
```

- `location` 已在第 37 行存在，无新增依赖；
- 与第 127 行 `<div key={location.pathname}>` 的重置语义对齐：路由切换即重置错误状态，任何页面级渲染错误不再传染到其他路由；
- App.tsx 第 38 行的**顶层** ErrorBoundary 保持不动（最后兜底，不需要重置——它在路由外层，粘住错误反而保护应用）。

### 改动 3（防复发）：`tests/reminder-banner.test.tsx`

1. **改造现有「前台通知去重」用例**（第 67-98 行）：stub 从 `Notification` 构造器改为 stub `navigator.serviceWorker.ready`（showNotification 挂桩），断言改为 `showNotification` 被调用一次/不重复：

```ts
const showNotification = vi.fn()
Object.defineProperty(globalThis.navigator, 'serviceWorker', {
  value: { ready: Promise.resolve({ showNotification }) }, configurable: true,
})
```

2. **新增回归用例**（真机非法构造语义 + 防御）：

```ts
describe('ReminderBanner 通知通道防崩回归（v1.23 全站崩溃根因）', () => {
  it('serviceWorker.ready reject（如 dev 无 SW / 注册失败）→ 组件不崩、横幅正常渲染', async () => {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { ready: Promise.reject(new Error('no sw')) }, configurable: true,
    })
    vi.stubGlobal('Notification', class { static permission: NotificationPermission = 'granted' })
    renderBanner()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy()) // 横幅照常显示
    expect(screen.getByText('1')).toBeTruthy()
  })
  it('showNotification 抛同步错误 → 不冒泡到 ErrorBoundary', async () => {
    Object.defineProperty(globalThis.navigator, 'serviceWorker', {
      value: { ready: Promise.resolve({ showNotification: () => { throw new TypeError('Illegal constructor') } }) },
      configurable: true,
    })
    vi.stubGlobal('Notification', class { static permission: NotificationPermission = 'granted' })
    renderBanner()
    await waitFor(() => expect(screen.getByText(/交报告/)).toBeTruthy())
  })
})
```

（注意 Promise.reject 用例需确保 reject 被消费，避免 unhandledrejection 噪音——实现里已有 `.catch()`，测试可直接跑；若 jsdom 环境报 unhandled，把 ready 换成 pending Promise 亦可。）

---

## 5. 相关文件与行号速查（执行模型直接定位）

| 文件 | 位置 | 角色 |
|---|---|---|
| `src/modules/reminders/reminder-banner.tsx` | 21-31 行（useEffect）、28 行（崩溃点） | **修改**：改 SW 通知通道 |
| `src/app/layout.tsx` | 124 行（内层 ErrorBoundary）、37 行（location） | **修改**：加 key |
| `tests/reminder-banner.test.tsx` | 58-98 行（现有前台通知用例） | **修改**：改造 + 新增回归 |
| `src/sw.ts` | 51-64（push 事件）、66-81（notificationclick 已承接点击）、48-49（skipWaiting/clientsClaim——Chrome 必定 SW 控制的原因） | 只读参考，**不改** |
| `src/app/home.tsx` | 50 行（ReminderBanner 挂载点，仅首页） | 只读参考 |
| `src/modules/me/notifications-section.tsx` | 29-47 行（subscribe，权限授予源头） | 只读参考 |
| `src/components/error-boundary.tsx` | 48-83 行（「页面出错了」文案出处） | 只读参考 |
| `src/test-setup.ts` | PushManager 桩 | 可选：勿动 |

## 6. 验证方案（改完必做）

1. `npm test` 全量绿（含新增回归用例）；`npm run build` 通过；lint 警告数不高于改动前基线。
2. 手动冒烟（dev 本地模式无 SW——`vite-plugin-pwa` 未开 devOptions，`navigator.serviceWorker` 为 undefined，正好被方案 1 的 `?.` 静默，真机验证必须用构建版）：
   - 桌面 Chrome/Edge（快速回归）：站点通知权限设为「允许」→ 制造一条到期提醒（dueDate=今天、dueTime=已过时刻）→ 打开首页：**横幅正常渲染、不崩**、Console 无 TypeError、系统通知弹出；
   - **主战场——安卓 Edge PWA（用户实测环境）**：部署新版后从主屏幕打开 → 到期提醒存在时前台弹系统通知、点击通知聚焦窗口（走 sw.ts notificationclick）→ 首页不再崩、切页不再全站粘死。
3. 线上恢复路径：页面加载与 SW 注册不受崩溃影响（崩溃发生在 React 渲染层），部署后正常刷新即可触发 autoUpdate（skipWaiting 自动接管并重载，可能需要 1-2 次刷新生效）；回访首页不再崩。
   - ⚠️ **新旧交替窗口（实测确认）**：旧 SW 控制下的加载仍跑旧 precache 代码，部署后短期内可能出现「一次正常、一次又崩、随后自愈」——这是旧代码的临终表现，不是修复无效。**验证修复以「我的」页关于区块版本号显示 v1.23.2 为准**；错误页无「返回首页」按钮 = 崩在首页（banner 链路），可作为零成本定位信号。
4. **用户当下自救（修复部署前可选）**：安卓 Edge 里把本站「通知」权限改回「默认/阻止」（PWA 图标长按 → 应用信息 → 通知/网站设置；或直接清除该站点数据后重新登录——用户为云端模式，数据在 Supabase，清站点数据无损失）→ `reminder-banner.tsx:22` 守卫重新拦截 → 应用立即可用。

## 7. 顺带发现的问题（只记录，本次不修）

1. `src/modules/me/notifications-section.tsx:35` —— `Notification.requestPermission()` 返回值未检查，`denied` 时仍继续 `pushManager.subscribe`（iOS 会走 catch 提示「订阅失败」，语义模糊）。建议后续 denied 时直接 toast「通知权限被拒绝」。
2. `api/reminders.ts:171-179` —— `ensureVapid()` 在 env 未配置时也置 `vapidInitialized = true`，此后永不重试；与文件末尾 329-333 行的顶层初始化重复。
3. `src/lib/db/supabase-repository.ts:336-340` —— `savePushSubscription` 的 upsert 载荷未显式带 `user_id`（依赖表列 `default auth.uid()`，当前可用，但与同文件 `saveSubscriptions`/`saveChannelConfigs` 显式带 user_id 的写法不一致）。

## 8. 版本与提交约定（按 VERSIONING.md 完整执行）

- **判级**：本次改动全部是 fix（功能恢复正确、不新增能力）→ **PATCH**。目标版本 **v1.23.2**。
- **归并判定**（VERSIONING.md §2）：v1.23.1 发版于 2026-09-03、本 bug 于 2026-09-04 首次暴露——
  - 若发版执行时距 v1.23.1 仍在 **24h 内**：版本号仍为 v1.23.2，changelog **不新开条目**，items 追加进 v1.23.1 条目；
  - 若已超 **24h**：新开 v1.23.2 条目。
- **发版 checklist**（VERSIONING.md §4，可用 `node scripts/release.mjs --dry-run` 预览、`--yes --title "..."` 一键执行 3-7 步）：
  1. `src/app/changelog.ts` 数组顶部插入条目（或按上面归并判定追加进 v1.23.1），条目内容：

     ```ts
     {
       version: 'v1.23.2',
       date: '2026-09-04',
       title: '修复：开启通知权限后全站「页面出错了」崩溃（前台通知非法构造 + 错误边界粘死）',
       items: [
         '修复：前台通知改走 Service Worker 通道 showNotification——Chrome（含安卓 Edge）SW 控制下 new Notification 抛 Illegal constructor、iOS 全系不支持，权限授予后必崩（详见 docs/plans/FIX_PLAN_NOTIFICATION_CRASH.md）',
         '修复：去重 id 登记提前到发起通知之前，杜绝重试死循环',
         '修复：壳层内层 ErrorBoundary 按路由 key 重置，单页渲染错误不再全站粘死',
         '加固：通知发送全程 catch 静默——通知是增强能力，任何失败不影响界面',
         '内部：补真机语义回归测试（SW 通道、ready 失败、showNotification 抛错三场景）',
       ],
     }
     ```
  2. `package.json` 的 `version` 同步为 `1.23.2`（去掉 v 前缀）；
  3. 验证：§6 第 1 条（test 全绿 + build 通过 + lint ≤ 12 条基线）；
  4. 提交：功能改动按 §4 三个改动分模块 commit（`fix(reminders): ...`、`fix(app): ...`、`test(reminders): ...`），最后一条 `docs: bump v1.23.2 changelog`（changelog + package.json 一起进这条）；
  5. 打 tag + push：`git tag v1.23.2 && git push origin main --tags`。
- **中文 commit message 不能走 `-m`**：改走 `git commit -F <UTF-8 文件>`；中文文件名的 git add 用 `git add -u`（AGENTS.md §5c）。
