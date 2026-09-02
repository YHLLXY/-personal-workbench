# 「我的」页面改版（个人中心现代化）调研与方案

> 2026-09-02 调研整理。**v1.23.0 已实施**（feat 479578bf0）。调研资料：[RESEARCH_ME_PAGE.md](./RESEARCH_ME_PAGE.md)。
> 用户反馈原话：现在"我的"界面有点老旧了，从其他界面更新以来都没有动过，我觉得还是比较的匮乏，你看一下现在的状况，然后去 GitHub 和网上找相关的资料，出一个详细的计划我看一下，注意项目现在的状态和限制。
> **建议方案（一句话）**：维持单页卡片布局不动摇，把页面从「一堆功能区块的堆叠」重组为「身份卡 → 本周报告 → 累计统计 → 设置分组行 → 关于」五段式；同步修掉「关于」区硬编码 v1.2 的过期版本号（实际 v1.22.1）、补应用内更新日志查看、补 PWA「添加到主屏幕」安装入口。**零新依赖**，预计 +6~9KB（me 为懒加载 chunk，首屏 0 影响），总量约 1065/1120。
> **决策点**（§7，均给推荐值，不同意再改）：移除「我的项目」重复入口卡 / 标题统一为「我的」/ 身份卡嵌 3 个关键数字 / PWA 安装行。
>
> **✅ 已审阅通过（2026-09-02，用户按推荐执行）**。落地修订（复查发现，实施以此为准）：
> 1. **P0 修正——`beforeinstallprompt` 捕获时机**：原设计把监听挂在设置页组件内，但该事件在页面加载早期就可能派发，用户先进其他页再进设置页时事件已丢失。修正为捕获挂 `src/pwa.ts`（main.tsx 启动即加载），`src/lib/pwa-install.ts` 模块级 store + `usePwaInstall()` 订阅。
> 2. 周趋势整卡复用 `WeeklyTrendCard`（`overview/weekly-trend.tsx`，含数据/骨架屏/空态/图例），不自己拼 `WeeklyTrendChart`；该组件已被 registry 静态引用（入口 chunk），me 页引用**零字节增量**。
> 3. 现存 `tests/notifications-section.test.tsx` 断言锚点必须保留：「通知设置」标题文本、「订阅推送」按钮名（regex 匹配）、订阅/退订/Server酱流程——通知区只加状态徽章不换结构。
> 4. 首页 `MiniHeatmap`（overview-home 私有组件）提取到 `src/components/mini-heatmap.tsx` 共享，防止两处样式漂移。
> 5. 调研资料独立成档：[RESEARCH_ME_PAGE.md](./RESEARCH_ME_PAGE.md)。
>
> **实施结论（同日）**：
> - **包体超预算根因与预案外解法**：首次构建最大 chunk 343/340 超限。stash 对照基线（1067/333）证明超支全部来自本改动——根因是 `App.tsx` **静态 import SettingsPage**，「我的」页一直是全站唯一没懒加载的页面，v1.22 起入口 chunk 已贴边，本次重写（4 个弹窗+日志渲染）把它推破线。解法未走 §5「提升 WeeklyTrendChart」预案，而是把「我的」页改 `lazyRetry` 懒加载（对齐全站模式，App.tsx 已有 Suspense 边界与 ProjectDetailPage 先例）：入口 chunk **343→320KB（比改版前基线还小 13KB）**，总量 1077/1120。
> - 验证全绿：tsc ✓、vitest 全量 **453/453**（新增 pwa-install 6 + me-page 4，通知区既有 4 例锚点未动）、lint 12=基线、e2e 9 用例等效全绿（4 例 flaky 为已知 dev-server 冷编译抖动，重试通过；新增「我的页」用例一次通过）、check:bundle ✓。
> - 复用落点微调：周趋势**整卡**复用 `WeeklyTrendCard`（含骨架/空态/图例），非仅图表；`MiniHeatmap` 落位 `src/components/mini-heatmap.tsx`。

---

## 1. 现状诊断（代码实证）

页面文件：`src/modules/me/settings.tsx`（295 行）+ `notifications-section.tsx`（119 行），路由 `/settings`，移动端底部 Tab「我的」。

| # | 问题 | 证据 |
|---|---|---|
| 1 | **版本号硬编码过期**：「关于」区写死 `我的工作台 v1.2`，实际已是 v1.22.1，历次发版从没人改过它 | `settings.tsx:291` |
| 2 | **更新日志数据存在但无界面**：`src/app/changelog.ts` 已收录全部版本条目（daily-summary 在用），用户在应用内看不到版本历史 | `changelog.ts` 唯一消费方 `daily-summary.tsx:10` |
| 3 | **统计数据全是"累计"死数字**：6 格静态数字（待办完成率/连续打卡/专注总时长/复盘/笔记/资料），无任何趋势可视化；而首页 v1.19 已有纯 SVG 周趋势图 + 14 天热力条，视觉语言断代 | `settings.tsx:122-150` StatsGrid vs `overview/weekly-trend-chart.tsx` |
| 4 | **通知设置无状态呈现**：已订阅/未订阅、Server酱已配/未配只靠按钮文字区分，一眼看不出当前状态（Toptal 设置页清单里的"status indicators"缺失） | `notifications-section.tsx:98-106` |
| 5 | **「我的项目」卡是重复导航入口**：侧边栏、移动端首页卡片已有同一入口，且本页定位是"我的"，放项目导航是噪音 | `settings.tsx:32-43` |
| 6 | **身份卡交互局促**：昵称编辑是内联 Input+保存按钮挤在 64px 头像旁边，色板横在卡片右侧，小屏挤压；保存成功无 loading 态区分（isPending 守卫有了，但视觉无反馈） | `settings.tsx:93-119` |
| 7 | **PWA 装机体验缺失**：全代码库无 `beforeinstallprompt` 处理、无 standalone 检测——用户换手机重装 PWA 只能凭记忆操作（添加到主屏幕），无引导 | `grep beforeinstallprompt` 全库 0 命中 |
| 8 | **破坏性操作无确认**：退出登录一键直达（云端模式），与导入恢复的 `window.confirm` 防线不一致 | `settings.tsx:236` |

**页面现有结构**（对照用）：个人中心 h1 → ProfileCard → ThemeSection → 我的项目卡 → 数据统计 6 格 → DataSection → NotificationSection → AccountSection → AboutSection。自 v1.6 后基本未动（`git log -- src/modules/me/` 最近一次功能提交是备份节奏提醒）。

**可复用资产盘点**（改版的地基，全部已存在，零新增依赖）：

| 资产 | 位置 | 说明 |
|---|---|---|
| 周趋势图（纯 SVG，专注柱+完成折线，hover tooltip） | `src/modules/overview/weekly-trend-chart.tsx` | v1.19 为砍 312KB 手写，跨模块 import 后 Vite 自动共享 chunk |
| `buildWeeklyTrend` 纯函数 | `src/lib/stats.ts` | 近 7 天任务数+专注分钟 |
| 14 天热力条 | `useHeatCells(14)` (`health/api.ts`) + 首页 MiniHeatmap 样式 | 首页同款四行小方块 |
| 连续打卡 / 今日打卡 | `useHabitStats` (`health/api.ts:25`) | select 派生，与热力共用缓存 |
| 更新日志数据 | `src/app/changelog.ts` `CHANGELOG` | 含版本号+日期+条目 |
| 备份状态 | `backupAgeDays/backupAgeLabel` + `navigator.storage.estimate()` | 已在 DataSection 用 |
| UI 原语 | badge/progress/separator/dialog/tabs/switch… `components/ui/` 全套 | base-ui 底座 |
| 里程碑 | `streakMilestone` (`lib/celebrate.ts`) | 7/30/100 天，可选彩蛋 |

## 2. 调研：成熟方案与依据

### 2.1 设置页布局选型

- [Setproduct：Settings UI design](https://www.setproduct.com/blog/settings-ui-design)（全文研读）：六种布局——单页 / 标签页 / 手风琴 / **卡片** / 侧边导航 / 分步向导。结论映射到本项目：设置项少 + 移动端小屏 → **单页卡片布局**最优；侧边导航是给"设置项非常多的大型应用"的，本页 8 个区块远不需要；Tabs 会给 8 个区块引入一层无谓 chrome。
  - 该文列的 7 个常见错误对照本页现状：①找不到设置→本页项少，无需搜索；②误操作无法挽回→**退出登录缺确认（命中）**，导入已有 confirm ✅；③信息过载→**渐进披露不足（命中：色板/推送细节全部平铺）**；④迷失方向→单页无此问题；⑤默认值→不适用；⑥缺乏反馈→保存有 toast ✅；⑦键盘快捷键→全局 ⌘, 已有 ✅。
- [UX Collective：Designing a better 'Settings' screen](https://uxdesign.cc/designing-a-better-settings-page-for-your-app-fcc32fe8c724)（搜索摘要）：**按使用频率排序，最高频置顶；破坏性操作永远放最后**。
- [Toptal：How to Improve App Settings UX](https://www.toptal.com/designers/ux/settings-ux)（搜索摘要）：分组、视觉层级、**状态指示器**（让用户一眼看出每项当前状态）、措辞去术语。
- [UntitledUI 42 个设置页实例](https://www.untitledui.com/components/settings-pages)（搜索摘要）：Profile / Notifications / Appearance / Data 分区是 SaaS 设置页的通用切法，佐证本页分区方向。
- 参照实现（shadcn 生态，搜索确认）：[satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin)（2.8k★，Profile+Account+Settings 分页）、[官方 dashboard 示例](https://ui.shadcn.com/examples/dashboard)（profile 表单：显示名/邮箱/通知三段）。共同点：**身份区在上、表单/开关分组、危险操作隔离**。
- 移动端"我的"Tab 的成熟范式（Todoist / Things 3 / Apple 设置，业内通识）：**身份头卡 → 关键数字 → 分组行列表（圆角分组、行内右箭头/开关、状态徽章）→ 关于/退出收底**。

### 2.2 个人数据呈现

- 首页 v1.19-1.21 已验证的路径：纯 SVG 图表 + KPI 条 + 热力条，用户已认可该视觉语言（多次正面反馈）。"我的"页的统计升级**直接复用同款组件**而非另起炉灶——视觉一致即设计感，且零体积成本。
- 累计 vs 近期是两种口径，都有信息量：**本周报告卡（趋势）+ 累计 6 格（存量）分层呈现**，各自标注口径，避免 v1.9「累计完成 vs 当日」那种口径混淆事故重演（避坑清单：UI 文案是语义的最终依据）。

### 2.3 PWA 安装引导（添加到主屏幕）

- Web 标准路径（业内通识，MDN `BeforeInstallPromptEvent`）：`beforeinstallprompt` 事件拦截暂存 → 页面放自定义「安装」按钮 → 点击调 `prompt()` → `appinstalled` 事件收尾；`matchMedia('(display-mode: standalone)')` 判定已安装则隐藏入口。Android/桌面 Chrome/Edge 全适用。
- iOS Safari **无该 API**（苹果不开放）：只能引导手动「分享 → 添加到主屏幕」，且本项目通知设置里已有同类平台提示文案（`notifications-section.tsx:105`），交互模式有先例。
- 本项目是重 PWA（vite-plugin-pwa + SW 运行时缓存 v1.8），装到主屏幕是核心使用方式，但当前**零引导**——这是真实的实用缺口，不是花架子。

### 2.4 调研与本项目约束的对撞结论

| 诱惑 | 裁决 | 理由 |
|---|---|---|
| 引入图表库画"个人报告"（recharts 回流等） | **拒绝** | v1.19 刚砍掉 312KB；已有纯 SVG 同款 |
| Tabs/侧边导航大改版 | **拒绝** | 8 个区块用不上；移动端单页滚动体验最好 |
| 头像上传图片 | **拒绝** | 单用户 PWA，色板字母头像够用；图片存储引入新链路（仓储双实现+云端桶），收益趋零 |
| "使用天数"/"等级系统"等新指标 | **拒绝** | 语义不可靠（本地模式无账号创建时间），发明口径违反 AGENTS「改字段语义先 grep 消费方」精神 |
| 通知/数据逻辑重写 | **拒绝** | 只改呈现壳，逻辑（订阅/退订/测试/导入导出）一行不动——这部分是验证过的关键路径 |
| PWA 安装行 | **采纳** | 零依赖 ~40 行，真实缺口 |
| 应用内更新日志 | **采纳** | 数据已存在，只补一个 Dialog 展示 |
| streak 里程碑徽章 | **可选 P2** | `streakMilestone` 现成，7/30/100 天在身份卡显示 🎉 小徽章，零成本；默认做 |

## 3. 目标设计（五段式）

```
我的（max-w-2xl，桌面居中、移动通栏）
├─ ① 身份卡     头像+昵称+模式徽章｜3 个关键数字｜编辑资料→Dialog
├─ ② 本周报告   周趋势图（复用 SVG 组件）+ 14 天热力条
├─ ③ 累计统计   现 6 格保留（标注「累计」口径）
├─ ④ 设置分组   外观 / 通知 / 数据管理 / 账号 —— iOS 式分组行
└─ ⑤ 关于       版本号（动态）+ 更新日志 + 添加到主屏幕 + slogan
```

### ① 身份卡（重写 ProfileCard）

- 64px 色板字母头像（不动）+ 昵称**大字展示**（不再内联 Input）+ 小字 email / 「☁️ 云端同步」或「💾 本地存储」徽章（Badge 组件，替代现两行 10px 文本）。
- 「编辑」小按钮 → Dialog：昵称 Input + 6 色色板 + 保存按钮（isPending 禁用，硬性约定 6；Enter 提交保留）。原色板从卡片右移入 Dialog，小屏不再挤压。
- 卡底一行三个关键数字（连续打卡 N 天 / 本周专注 X 分 / 待办完成率 Y%），数据全部来自**现有 hooks 的共享缓存**（useHabitStats、useFocusSessions、useTasks），不新增查询；streak 命中 7/30/100 时数字旁缀 🎉（streakMilestone）。
- 命名：h1「个人中心」→「我的」，与底部 Tab 一致（决策点 2）。

### ② 本周报告卡（新）

- 「本周报告」标题 + `<WeeklyTrendChart days={buildWeeklyTrend(...)} />` 直接从 overview 模块 import——同一份纯 SVG 组件，桌面首页/移动首页/本页三处一致；Vite 自动把共享组件放公共 chunk，不复制代码。
- 图下方 14 天热力条（useHeatCells(14)，首页 MiniHeatmap 同款样式内联，4 行）。
- 加载态 Skeleton、空态文案（"这周刚开始，去打卡吧"）对齐首页模式。

### ③ 累计统计（保留）

- 6 格指标原样保留（含全部数据源 hooks 不动），仅标注「累计」口径副标题，样式与新版统一（rounded-2xl 边框卡，数字 font-numeric）。

### ④ 设置分组（重组，逻辑零改动）

iOS 式圆角分组容器（`rounded-2xl border bg-card` + 内部行 `divide-y`），每行：左图标+标题+小字说明，右状态徽章/按钮/箭头：

- **外观**：浅色/深色/跟随系统三态按钮（保留现交互，套行容器）。
- **通知**（notifications-section 逻辑原样保留，只换呈现壳）：
  - 浏览器推送行：状态徽章「已开启」绿 /「未开启」灰，行内操作按钮（订阅/关闭/测试发送）不变；iOS/安卓平台提示文案保留。
  - Server酱行：状态徽章「已配置」/「未配置」，SendKey 输入+保存不变。
- **数据管理**：导出备份行（副行显示「上次备份：X」+≥7 天琥珀色警告，现逻辑平移）；导入恢复行（confirm 流程不动）；存储占用行（navigator.storage.estimate，云端模式显示"数据在云端同步"）。
- **账号**：修改密码行（云端，Dialog 不动）/ 本地模式说明行；**退出登录行置底、红色文字、点击后 Dialog 二次确认**（补研究指出的误操作防线；与导入 confirm 对齐）。
- **移除「我的项目」卡**（决策点 1）：侧边栏/底部 Tab/移动首页卡片三处已有入口，本卡是第四个重复入口；"我的"页语义=身份+偏好+数据+关于，项目导航不属于此处。

### ⑤ 关于区（修复 + 补齐）

- 版本号：`CHANGELOG[0].version` 动态读取，**根治硬编码 v1.2**（bug 修复）。
- 「更新日志」行 → Dialog 列出全部版本（版本号+日期+条目列表，数据现成；可加 max-h 滚动）。
- 「添加到主屏幕」行（新 `src/lib/pwa-install.ts`，~40 行零依赖）：
  - `usePwaInstall()`：捕获 `beforeinstallprompt`（暂存 event）、`matchMedia('(display-mode: standalone)')` 或 `navigator.standalone` 判定已安装、暴露 `{ canInstall, isStandalone, promptInstall }`；
  - 未安装且 canInstall（Android/桌面 Chromium）→ 行内「安装」按钮直接 `prompt()`；
  - iOS（无 API）→ 点行弹说明 Dialog（分享 → 添加到主屏幕，复用现通知区的文案先例）；
  - 已 standalone 运行 → 整行隐藏。
- slogan 一句话保留。

## 4. 实施步骤

| 步骤 | 内容 | 文件 |
|---|---|---|
| 1 | `usePwaInstall` hook（beforeinstallprompt 捕获 + standalone 检测 + prompt 封装） | 新 `src/lib/pwa-install.ts` |
| 2 | 身份卡重写（展示态+编辑 Dialog+三数字+里程碑） | `settings.tsx` |
| 3 | 本周报告卡（import WeeklyTrendChart + 热力条） | `settings.tsx` |
| 4 | 设置分组行容器 + 通知/数据/账号三区套壳（逻辑不动） | `settings.tsx`、`notifications-section.tsx` |
| 5 | 关于区：动态版本 + 更新日志 Dialog + 安装行；移除我的项目卡 | `settings.tsx` |
| 6 | 测试：pwa-install 纯逻辑测试 + me 页轻量冒烟（本地模式渲染、版本号=CHANGELOG[0]、无我的项目卡；QueryClientProvider 包裹） | 新 `tests/pwa-install.test.ts`、新 `tests/me-page.test.tsx` |
| 7 | 全量验证（§5 清单）→ 分模块 commit（`feat(me): 个人中心改版…`，版本号修复并入）→ 发版 | — |

实施细节约束：所有新代码遵循现有风格（lucide `size-4 strokeWidth={1.7}`、`rounded-2xl border-border bg-card`、`font-numeric`）；纯函数不导出在组件文件里（pwa-install 放 `lib/`）；**不动 repository/迁移/api/**——无 contract 测试触发面。

## 5. 验证清单（AGENTS 硬性约定 5）

- [ ] `npm test` 全绿（现 421 基线 + 新增）
- [ ] `npm run build` + `npx vite build` 后 `npm run check:bundle`：预估总量 ~1065/1120 ✅、单 chunk ≤340 ✅（WeeklyTrendChart 跨模块引用若意外并入 me chunk 导致超限，则把该组件提升到 `src/components/` 共享——预案）
- [ ] `npm run lint` 警告 ≤ 基线 12
- [ ] `npx playwright test` e2e 冒烟 8/8（me 页不在冒烟内，确认无回归即可）
- [ ] 手检：本地模式（无 env）整页可用、云端模式账号区/通知区可用；`?` 快捷键、⌘, 快捷键不受影响

## 6. 风险与回滚

- **风险等级：低**。纯前端展示层重组，无仓储、无迁移、无 api/ 改动、无新依赖。
- 最大技术点：跨模块 import WeeklyTrendChart 的 chunk 归属——构建后 check:bundle 实测确认；有提升到 `src/components/` 的预案。
- 版本号动态化后，若 CHANGELOG 首条与 package.json 版本不同步会显性暴露（好事，本来就是 release.mjs 该保证的）；不做运行时比对，避免过度工程。
- 回滚：单 commit `git revert` 即可。

## 7. 决策点（默认按推荐执行，有异议请指出）

| # | 决策 | 推荐 | 理由 |
|---|---|---|---|
| 1 | 「我的项目」卡去留 | **移除** | 第 4 个重复导航入口；本页语义不含项目导航 |
| 2 | h1「个人中心」→「我的」 | **统一** | 与底部 Tab、口头称呼一致 |
| 3 | 身份卡 3 数字 | 连续打卡 / 本周专注 / 待办完成率 | 数据源现成、口径已验证（useHabitStats/useFocusSessions/taskCompletionRate） |
| 4 | PWA 安装行 | **加** | 零依赖 ~40 行，重 PWA 的真实缺口；iOS 走引导说明 |
| 5 | streak 里程碑 🎉 徽章 | **加（P2 顺手）** | streakMilestone 现成，7/30/100 天显示 |

## 8. 发版

- `feat(me)` → minor → **v1.23.0**（含版本号硬编码修复，同批并入）。
- changelog 条目：个人中心五段式改版（本周报告/分组设置/更新日志/添加到主屏幕）+ 修复「关于」版本号过期。
