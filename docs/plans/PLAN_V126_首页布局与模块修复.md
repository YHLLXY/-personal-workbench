# v1.26 实施计划：首页网格空洞 + 模块缺陷修复 + 日出日落重做

> 本计划只处理「已复现 / 已测量」的问题，每条都带复现证据。AI 日报接入单独成档（`docs/plans/RESEARCH_AI日报接入.md`）。
> 执行原则同前：只做本文列出的事；每阶段 `npm test` + `npm run build` + `npm run check:bundle` + lint 警告数对比（基线 12）；完成后 bump 到 **v1.26**。

---

## 1. 首页网格「莫名其妙的空白」——实测 17 列空洞 + 一整行全空

### 复现证据

Playwright 在 1440×1400 视口量测 `src/app/home.tsx` 的 `grid-cols-12` 容器（网格宽 1168px）：

| 行 | 卡片 | 右侧空洞 |
|---|---|---|
| 1 | 重庆天气 · 今日待办 · 最近考试 | 0 |
| 2 | 今日专注 · 今日热点 | **3 列（296px）** |
| 3 | 灵感速记 | 0 |
| 4 | 习惯打卡 | **5 列（493px）** |
| 5 | 今日复盘 | 0 |
| 6 | 本周趋势 · 我的项目 | **2 列（197px）** |
| 7 | （整行空白） | **7 列（691px）** |

**合计 17 列空洞 + 一整行哑空白；网格总高 1156px。**

### 根因（三层叠加，缺一不可）

1. **跨度算术从未核对**：`src/registry.ts` 里每个 homeCard 的 `span` 是逐个手挑的，没人验证过「同一行相邻卡片之和 = 12」。当前序列 天气4 · 待办5 · 考试3 · 专注4 · 热点5 · 速记12 · 打卡7 · 复盘12 · 趋势5 · 项目5 · 成长5 按 CSS Grid 默认 `grid-auto-flow: row`（不回溯）排布，遇到放不下的 12 跨度卡片直接换行，把剩余列留成空洞。

2. **`GrowthCard` 在无数据时 `return null`**（`src/modules/growth/cards.tsx:19`）：组件不渲染，但 `home.tsx` 给它的**网格项 `<div>` 依然存在**，照样占 5 列 + 满行高 → 表现为「一整行什么都没有」。已 grep 确认：**9 张首页卡片里只有它返回 null**，其余 8 张都有空态。

3. **行内拉伸**：`auto-rows-min` + 默认 `align-items: stretch`，同一行最矮的卡片被拉到与最高卡片等高而内容顶对齐 → 卡内大片空白（重庆天气约 250px 高，同行的「最近考试」只有一行字）。

### 修法

1. **跨度收敛为每行整除 12**（已在浏览器里实测：空洞 **0**，总高 1156 → **1046px，-110px**）：

   | 行 | 卡片（跨度） |
   |---|---|
   | 1 | 重庆天气 4 · 今日待办 4 · 最近考试 4 |
   | 2 | 今日专注 4 · 今日热点 8 |
   | 3 | 灵感速记 12 |
   | 4 | 习惯打卡 7 · 今日复盘 5 |
   | 5 | 本周趋势 5 · 我的项目 7 |
   | 6 | 自我提升 12 |

   注：`SPAN_CLASS` 需补 `'8'`（当前只有 3/4/5/7/12）；或改用 `style={{ gridColumn: 'span N' }}` 摆脱 Tailwind 动态类限制。

2. **布局改成「显式行」而不是「逐卡挑跨度」**：在 `home.tsx` 定义 `HOME_ROWS: string[][]`（行 → 卡片 id + 权重），跨度由行内权重推导，并加 `tests/home-layout.test.ts` 断言「每行权重和 === 12」「每张卡片恰好出现一次」。**这才是本条的真正修复**——让「算错跨度」在 CI 里变红，而不是靠肉眼。

3. **`GrowthCard` 的 `return null` 改为空态卡片**（`EmptyState`：「还没有行动 → 去添加」），与其它卡片一致，网格项永远有内容。

4. **拉伸**：重排后同行高度已接近（天气/待办/考试；打卡/复盘；趋势/项目）。剩下若有落差，给 `CardContent` 加 `flex-1`、带页脚的卡片用 `justify-between` 让页脚贴底。**不引入 `items-start`**——那会让行内参差，观感更差。

### 验收
- Playwright 量测：每行 `gapCols === 0`，最后一行也必须满 12
- 新增单测覆盖「每行权重和 = 12」
- 1440 / 1280 / 390 三档截图无空洞

---

## 2. 番茄钟「专注主题」不持久化（已复现）

### 复现证据

Playwright：`/pomodoro` 输入「写毕业论文第三章」→ 跳 `/tasks` → 回 `/pomodoro` → `input.value === ''`，页面文本不含该主题。

### 根因

`src/modules/study/pomodoro.tsx:88` —— `const [focusNote, setFocusNote] = useState('')` 是**纯组件内状态**，而同一屏的**计时状态是持久化的**（`wb:pomodoro-state` 的 `loadState` / `saveState`）。二者不一致：切页 / 刷新 / 切后台重建组件后，**计时器活下来，主题丢了**。

后果不止「少打几个字」：若专注在后台跑完，`mutate({ minutes, note: note || undefined })` 会写入一条**没有主题的专注记录**，数据永久缺失（记录已成行，无法补）。

### 修法

把 `note` 并入 `PersistedPomodoroState`，与计时状态同生共死：

- `PersistedPomodoroState` 增加 `note: string`
- `loadState` 读取（旧数据缺 `note` 时补 `''`，符合避坑清单「前端字段 optional 兼容旧数据」）
- 输入框 `value` 改读 `state.note`，`onChange` 走 `setState`
- 完成落库后清空 `state.note`（等价于现在的 `setFocusNote('')`）
- 补一条单测：`loadState` 对缺 `note` 的旧 payload 不崩且补空串

### 顺带排查结论（用户问「其他地方有没有这样的问题」）

- 仓储接口层只有 `createHealthLog`（见 §3）一处「一天一个数」语义；`setHabitLog` / `upsertReview` 都已是 upsert，**无同类缺陷**。
- 表单局部状态在切换页面后丢失，在其它页面属正常行为；番茄钟之所以是缺陷，是因为**同一屏的其它状态被持久化了**，形成「一半记得一半忘」。修完即一致。

---

## 3. 身体记录「更新了原来的数据还在」

### 代码事实（不是没做覆盖）

`createHealthLog` 在**本地与云端两边都已经是当日 upsert**（体重 / 睡眠覆盖、运动保留多条），落地于 `bc9341f1ac`（v1.11），并有 `tests/repository-contract.test.ts:215-224` 契约测试守着。

### 剩下的缺口（按可能性排序）

1. **v1.11 之前的重复行从未清理**。`docs/plans/PLAN_V111_UX_FIXES.md` §执行顺序第 3 步原文：「存量清理 SQL **单独发给你确认后**在 Supabase 执行（不进代码迁移）」——这是**手工动作**，是否做过无从查证（本机无 Vercel / Supabase 凭据，读不到线上库，git 里也不会有痕迹）。**这是最可能的成因。**

2. **一旦存在重复行就永远不会自愈**：云端 upsert 查当日同类型用的是 `.select('id').eq(...).limit(1).maybeSingle()`，**没有 `order`** —— PostgREST 返回哪一行不确定，只更新其中一行，其余旧行继续留在列表里 → 表现正是「更新了，原来的还在」。

3. 云端 `listHealthLogs` 只按 `log_date` 倒序，同日多行顺序不定。

### 修法（结构性，不依赖「记得跑那段 SQL」）

1. 新增幂等迁移 `supabase/migrations/013_dedupe_health_logs.sql`：体重/睡眠按 `(user_id, log_date, type)` 分组，**保留 `id` 最大的一条**（`id` 由 `Date.now()` base36 生成，字典序越大越新），删其余。
2. **加部分唯一索引**：`create unique index if not exists ... on wb_health_logs (user_id, log_date, type) where type in ('weight','sleep')` → 这类重复**从结构上不可能再发生**（准则 #7「架构决策往长了做」）。
3. 云端 upsert 改用 `onConflict: 'user_id,log_date,type'` 语义，摆脱 `.limit(1)` 的任意行问题。
4. 本地仓储同样按 `logDate + type` 覆盖（当前 `findIndex` 取第一条；改为取最后一条，与云端「保留最新」一致）。
5. 契约测试补一条：同日同类型连写 3 次 → `listHealthLogs` 只应有 1 行且值为最后一次。

**⚠️ 迁移必须由用户在场执行**（AGENTS.md 硬性约定）。执行前先跑一条分组计数确认重复行数。

### 顺带排查结论

除 `wb_health_logs` 外没有第二张「同一自然键允许多行」的表（`wb_habit_logs` 有 upsert、`wb_reviews` 有 `onConflict`）。但两者靠的是**唯一约束而非代码自觉**——建议一并核对 `wb_habit_logs` 是否真有 `(user_id, habit_id, log_date)` 唯一约束（`wb_reviews` 的 `onConflict: 'user_id,review_date'` 若约束不存在会直接报错，说明它在）。

---

## 4. 「我的」页累计统计整合（纯 UI）

### 现状

`settings.tsx:156-184` 的 `StatsGrid` 把 6 项（待办完成率 / 连续打卡 / 专注总时长 / 复盘次数 / 笔记数 / 资料库）渲染成 **6 张独立卡片**（`grid-cols-2 md:grid-cols-3`），每张 100px 高、各带边框 → 视觉碎片化，这正是「分开放有些难看」。

### 修法（推荐）

**合并为一张卡 + 内部分隔线网格**，复用同页 `ProfileHero` 已用过的 `divide-x divide-border` 模式：

- 单张 `rounded-2xl border bg-card`，内部 `grid grid-cols-3 divide-x divide-y divide-border`
- 每格：主数字（`text-lg font-bold font-numeric`）+ 标签（`text-xs text-muted-foreground`）+ 副标题（`text-[10px]`）
- 移动端 2 列、桌面 3 列
- **零新增依赖，体积不变**

### 顺带：去掉重复数字

`ProfileHero` 的三个大数字（连续打卡 / 本周专注 / 待办完成率）与 `StatsGrid` 第 1、2 项**是同一个值**，同屏出现两次。分工建议：

- **Hero 保留「当下 / 本周」**：连续打卡、本周专注、待办完成率
- **累计卡保留「累计」**：专注总时长、复盘次数、笔记数、资料库、**累计专注次数**（`sessions.length`，新增，凑满 6 格）

---

## 5. 通知通道：接入 Telegram（保留 Server酱）

### 现状

`api/reminders.ts` 目前两个通道：**Web Push**（VAPID，写 `wb_push_subscriptions`）+ **Server酱**（`sctapi.ftqq.com/<key>.send`，密钥存 `ChannelConfigs.serverchanKey`）。UI 在 `src/modules/me/notifications-section.tsx`。

### 关键事实（决定架构一行不改）

`api.telegram.org` 在中国大陆**被墙**，浏览器直连不通；但推送是 **Vercel 函数（服务端）**发起的出网请求——与 Server酱 走**同一条路径**，**架构不变**，只是多一个通道。

### 修法

1. `ChannelConfigs` 增加 `telegramBotToken` + `telegramChatId`；`saveChannelConfigs` 是覆盖写，天然向后兼容。
2. `api/reminders.ts` 增加 `sendTelegram(token, chatId, text)`：`POST https://api.telegram.org/bot<token>/sendMessage`，用 `parse_mode: 'HTML'`（避开 Markdown 转义坑）。
3. **保存时校验**：先调 `getMe` 验证 Token 再落库；错误原样回显（401 Unauthorized / chat not found 都是常见配置错误，必须让用户看到）。
4. 「通知设置」加一组行：Bot Token（`type=password`）+ Chat ID + 「保存并测试」。
5. **不删 Server酱**：微信触达更即时，两条并列；`sent` 计数已按通道累加，无需改。
6. 文案更新：安卓 Chrome 提示保留，并加一句「推荐 Telegram：服务端直发，不受 FCM 被墙影响」。

### 验收
- 非法 Token → `getMe` 返回 401，UI 明确报错且**不落库**
- 合法配置 → 点「测试发送」手机 Telegram 收到消息
- 定时 `/api/cron-notify` 到期提醒同时走 Web Push + Server酱 + Telegram

---

## 6. 天气「日出日落」重做

### 现状（`weather-dialog.tsx:151-183`）

- 轨道 `h-2`（8px）圆角条，背景是**全天彩虹渐变**（琥珀 → 蓝 → 琥珀）
- 太阳是 28px 的 meteocons **彩色** SVG，用 `left: calc(t% - 14px)` 贴在轨道上，再叠加最多 10px 的 `sin` 抬升
- 日出 / 日落文案与时间**挤在同一行**，字号 11px

### 现存问题（代码可验证）

1. **两种饱和色打架**：彩色图标压在彩虹渐变轨道上，互不相让。
2. **抬升只有 10px**，看起来不是「划弧」而是「没对齐」。
3. **头重脚轻**：8px 轨道配 28px 图标，比例失衡。
4. **端点出血**：`t = 0` 时 `left = -14px`，太阳左半边**溢出容器**（父级无 `overflow-hidden`）；`t = 1` 同理。
5. 信息层级扁平：图标、标签、时间全挤在一行。

### 目标设计（依据用户提供的参考图）

- **上排**：左「↑ 日出」图标 + 文字，右「↓ 日落」图标 + 文字，两端对齐
- **中排**：一条圆角轨道，**以太阳所在位置为界分两段**——已过去的低不透明度、未到来的高不透明度；太阳**正好坐在交界处，不抬起**
- **下排**：左 `06:55`、右 `18:24`，字号明显放大（参考图约为主字号的 1.6 倍）
- **配色跟随主题**：用 `--primary` / `--muted`（暖色系），**去掉固定的琥珀蓝彩虹渐变**——贴合「偏暖、不花哨」的基调
- **端点内缩**：太阳定位改为轨道内部留 14px 边距的语义，两端不再出血

### 实现
- 只改 `SunArc` 一个组件 + 少量 CSS，**零新增依赖，体积不变**
- 需要一个「实心带光线」的太阳图形：复用现有 meteocons 的 `clear-day.svg` 但用 CSS filter 去色，或手写一个 8 光线的小 SVG（约 300B，比引图标库划算）
- 补一条渲染测试：`t` 取 0 / 0.5 / 1 时太阳 `left` 不越界

---

## 7. 体积门禁的定位（用户提问，本条只立结论不改代码）

**现状**：`scripts/check-bundle.mjs` 两个阈值 `totalJsKb: 1120` / `maxChunkKb: 340`，注释写「阈值 = 当前基线 + 10% 余量（基线 1016KB / 306KB）」。

**实测**：`JS 总量 1098 KB / 1120 KB（98%）`、`最大 chunk 302 KB (index-*.js) / 340 KB（89%）`。

**回答「是不是限制了迭代」**：不是禁止加功能，是要求「加功能不显著加体积」。所有页面都走 `lazyRetry` 懒加载、各自成 chunk，**不影响首屏**。

**但它有两个真问题，建议单独立项修**：

1. **判据与意图不符**：注释说红线是为「移动端首屏」（recharts → SVG 那次砍 312KB），量的是 `dist/assets/*.js` **全部文件之和**（含所有懒加载 chunk）。它实际是「代码总量上限」，**懒加载并不能让你绕过它**。
2. **余量只剩 22KB** —— 任何中等依赖（markdown 渲染 / 图表 / 日期库）都会顶穿。

**建议**：
1. 把门禁拆成两个独立数字：**首屏**（entry chunk + 其静态 import 闭包）与 **总量**，各自阈值。首屏才是真红线（决定手机打开速度）。
2. 拆分完成前，新功能一律按「**零依赖**」设计（日报就是这么定的，见 `RESEARCH_AI日报接入.md`）。
3. 确需上调 `BUDGET` 时按注释的规矩来：改阈值 + commit message 写理由。

---

## 执行顺序

1. §1 首页布局（改 `registry.ts` / `home.tsx` / `growth/cards.tsx` + 新增布局单测）→ 全量测试 + 截图复核
2. §2 番茄钟 note 持久化（改 `pomodoro.tsx` + 单测）
3. §3 身体记录（写迁移 013 + 改双仓储 + 契约测试）→ **迁移文件交付后等用户在场执行**
4. §4 「我的」页统计整合（纯 UI，改 `settings.tsx`）
5. §5 Telegram 通道（改 `api/reminders.ts` + `lib/db/types.ts` + `notifications-section.tsx`）
6. §6 日出日落（改 `weather-dialog.tsx` + 测试）
7. changelog v1.26 + 分模块 commit + push

**顺序理由**：先修「看得见的空」再修「交互丢数据」；迁移放中间是为了尽早交给用户执行，不阻塞后面的纯前端项。
