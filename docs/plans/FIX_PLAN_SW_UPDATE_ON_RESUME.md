# 修复方案：已安装 PWA 恢复前台不检查更新（版本号长期停在旧值）

> **状态**：待实施（2026-09-11 发现，2026-09-13 成档）。本文档为该修复的唯一事实源，改动范围限定在第 4 节，其余「顺带发现」只记录不动代码。
> **起因**：v1.24.0 发版当天用户报「刷新后看不见版本号更新」。排查结论见 `经验总结-审查核实与功能迭代执行.md` 第十六节——**SW 更新握手本身是好的**（本地双构建实测：一次真刷新即换包），缺口在更新检查的**触发时机**。
> **判级预估**：fix → **v1.24.1**。零新依赖（`workbox-window` 已在包内，`registerSW` 已 import）。

---

## 1. 症状

已安装到主屏的 PWA，用户切到别的 App 超过 5 分钟再切回来：启动动画重播（观感与「刷新」一致），但版本号仍是旧的；用户主观上「我已经刷新了」，实际一直在跑旧包。桌面浏览器手动刷新不受影响（有导航 → 会检查更新）。

## 2. 根因

更新检查的触发时机只有一个：**页面加载**。

- `src/pwa.ts:6` — `registerSW({ immediate: true })`：注册 + 立即（而非等 load）注册 SW，浏览器随之做一次更新检查。**只在页面加载时执行**。
- `src/app/boot-animation.tsx:79-88` — `visibilitychange` 里「隐藏 ≥5 分钟」即 `setRunId` 重播启动动画。这是产品设计（有意为之），但它制造了一个**不产生导航的「假刷新」**：页面没有重新加载 → `pwa.ts` 不会重新执行 → 不检查更新。
- `src/sw.ts:46-48` — `skipWaiting()` + `clientsClaim()` 都已就位：新 SW 一旦装上就立刻接管，`workbox-window` 的 `activated` + `isUpdate` 会触发 `location.reload()`（见 `node_modules/vite-plugin-pwa/dist/client/build/register.js:40-47`）。**所以缺的只是「主动发起一次检查」**，接管与自动重载这条链是通的。

## 3. 修复策略

在页面恢复可见时主动调一次 `registration.update()`，并加节流。三点约束：

1. **拿得到 registration**：`registerSW` 的返回值是 `updateServiceWorker`（不含 registration），必须用 `onRegisteredSW(swUrl, registration)` 回调捕获。
2. **必须节流**：切前后台是高频动作，不加节流会每次都打一次 sw.js 请求。取 30 分钟（远小于「用户能感知到版本旧了」的时长，又不会打太多请求）。
3. **失败静默**：更新检查属增强能力，任何异常 catch 掉，绝不冒泡（既有约定：通知类/增强能力调用全程静默）。

## 4. 具体改动（按此执行，勿扩大范围）

### 4.1 新增纯函数 `src/lib/pwa-update.ts`（为了可单测）

```ts
/** 恢复前台时是否需要发起 SW 更新检查：距上次检查不足 minInterval 则跳过 */
export const UPDATE_CHECK_MIN_INTERVAL_MS = 30 * 60_000

export function shouldCheckUpdate(lastCheckAt: number, now: number, minInterval = UPDATE_CHECK_MIN_INTERVAL_MS): boolean {
  return now - lastCheckAt >= minInterval
}
```

（放 `src/lib/` 而非组件文件——纯函数不导出在组件里，fast-refresh 约定。）

### 4.2 `src/pwa.ts` 接线（唯一改造点，约 12 行）

```ts
import { registerSW } from 'virtual:pwa-register'
import { capturePwaInstall } from './lib/pwa-install'
import { shouldCheckUpdate } from './lib/pwa-update'

capturePwaInstall()

let registration: ServiceWorkerRegistration | undefined
registerSW({
  immediate: true,
  onRegisteredSW: (_swUrl, r) => { registration = r },
})

// 从后台恢复时不产生导航，浏览器不会检查 SW 更新；主动补一次（节流 30 分钟，失败静默）
let lastCheckAt = 0
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !registration) return
  const now = Date.now()
  if (!shouldCheckUpdate(lastCheckAt, now)) return
  lastCheckAt = now
  registration.update().catch(() => {})
})
```

注意：`onRegisteredSW` 的 registration 类型本身是 `ServiceWorkerRegistration | undefined`（注册失败即 undefined），回调里直接赋值即可，后续用 `!registration` 早退兜住。

### 4.3 不做的事

- 不改 `boot-animation.tsx` 的重播行为（那是产品设计，本次问题出在「检查时机」而不是「重播」）。
- 不加「有新版本」的提示条 / 手动检查按钮（单用户自用，自动升级已足够；真要提示另立计划）。
- 不动 `registerType`、不动 workbox 配置、不动 `sw.ts`。

## 5. 相关文件与行号速查

| 位置 | 作用 |
|---|---|
| `src/pwa.ts:6` | 唯一改造点（现状：只有 `registerSW({ immediate: true })`） |
| `src/lib/pwa-install.ts` | 同文件既有 import 先例（`capturePwaInstall`） |
| `src/app/boot-animation.tsx:79-88` | 假刷新的来源（本次不改） |
| `src/sw.ts:46-48` | `skipWaiting()` + `clientsClaim()`（已就位，新 SW 立刻接管） |
| `node_modules/vite-plugin-pwa/dist/client/build/register.js:40-47` | autoUpdate 的 `activated` + `isUpdate` → `location.reload()` |

## 6. 验证方案（改完必做）

1. **单测**：新增 `tests/pwa-update.test.ts` —— `shouldCheckUpdate` 边界（0 / 恰好等间隔 / 超出间隔 / 时钟回退为负值时不触发）。
2. **手动复现（关键，必须真机或本地模拟）**：装 PWA → 部署新版（或用 §4.2 的本地双构建法，见经验总结第十六节）→ 切后台 ≥6 分钟 → 回前台**不刷新**，应能自动换成新版本（启动动画重播期间会再 reload 一次，属预期）。
3. **门禁四件套**：`npm test` 全绿 + `npm run build` 通过 + `npm run lint` ≤ 12 + `check:bundle`（预期零增量：仅十余行，`workbox-window` 已在包内）。
4. **回归**：更新检查不得影响首屏——`visibilitychange` 只在恢复可见时触发，且 `registration.update()` 已 catch。

## 7. 顺带发现的问题（只记录，本次不修）

- **「首帧白」**：新文档在 CSS/JS 生效前是浏览器默认白（生产构建实测 100–150ms，移动端更久）。属于平台事实，要消除得靠 index.html 内联最小样式（给 `html/body` 预置底色），另立计划。
- **`overscroll-behavior` 未设置**：移动端下拉刷新会露出 `body` 底色（浅色主题 `#F8F6F2`，观感是顶部一条白杠），且 PWA 内被误触下拉刷新没有意义。可考虑给 `html/body` 加 `overscroll-behavior: contain`——**待用户确认「白杠」现象根因后再决定**（见经验总结第十六节对该现象的负结论与待补信息）。
- **iOS 独立应用状态栏**：`index.html` 的 `apple-mobile-web-app-status-bar-style` 为 `default`（白底）。若用户设备确实是 iOS 且白条是持续态而非短暂态，改这个 meta 即可，但需连带处理安全区内边距。

## 8. 版本与提交约定（按 VERSIONING.md 完整执行）

- 判级：纯 fix → **v1.24.1**（changelog 顶部新条目）。
- 提交拆分：`fix(pwa): 恢复前台主动检查 SW 更新（节流 30 分钟）`（含 `src/pwa.ts` + `src/lib/pwa-update.ts` + `tests/pwa-update.test.ts`）→ 验证 → `docs: bump v1.24.1 changelog` → tag + push。
- 发版后把本文件头部状态改为「已实施」并附实测注记（同 `PLAN_V124_TASK_SYSTEM.md` 的做法）。
