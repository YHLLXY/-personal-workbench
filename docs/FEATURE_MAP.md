# 个人工作台 · 全功能拆解（v1.34.1）

> **用途**：把当前工作台里「有什么、怎么运作、边界在哪、改哪里」一次讲清，供另一个 AI（或未来的自己）做功能优化时当作事实底稿。
> **基线**：2026-11-26 · `package.json` version **1.34.1** · 全站 143 个 `src` 文件（约 15,000 行）+ 7 个 `api` 函数（1,935 行）+ 74 个测试文件（约 700 用例）+ 20 个 E2E 用例。
> **证据等级**：本文所有结论来自代码/SQL/配置的**直接读取**；涉及行为判断的地方标注了「代码可证 / 需复现 / 设计权衡」，不把猜测写成事实。

## 文档地图

| 章节 | 内容 | 什么时候看 |
|---|---|---|
| §0 | 使用说明、约定、规模基线 | 第一次打开 |
| §1 | 产品定位、设计取向、10 条红线、范围外 | 动手前 |
| §2 | 技术栈、分层、路由、目录、启动链路、状态四层 | 找代码位置 |
| §3 | 21 张表、双仓储、派生字段、缓存键、备份、迁移 | 改数据 |
| §4 | **逐功能拆解**（ID、入口、行为、边界、注意） | 改功能 |
| §5 | 服务端端点、鉴权、缓存、环境变量、AI 日报管线 | 改接口 |
| §6 | 时间口径、错误处理、无障碍、动效、体积、安全 | 横切改动 |
| §7 | 命令、测试分层、flaky、发版、CI | 提交前 |
| §8 | 已知识别的问题与优化候选（P1/P2/P3 + 安全项） | 排优化任务 |
| §9 | 接手协议：改动路径、检查清单、禁止项、DoD | 开工/交付 |
| §10 | 文件索引、localStorage 键、对象字段、术语表 | 查细节 |

> 功能卡统一格式：**入口 → 文件 → 行为 → 边界/坑 → 优化注意**。ID（如 `F-TASK-03`）可被直接引用。

---

## 0. 怎么用这份文档

### 0.1 它是什么 / 不是什么

| 是 | 不是 |
|---|---|
| 功能与数据流的**完整清单**（含空态、边界、已知坑） | 设计稿或视觉规范（视觉看 `src/index.css` 与各页面） |
| 改动的**入口地图**（功能 → 文件 → 数据表） | 逐行代码讲解（需要时按文件路径跳读） |
| 优化候选的**证据化清单**（§8） | 已确认的需求排期（§8 只是候选，优先级需产品确认） |
| 接手前的**红线与验证方式**（§1、§7、§9） | 部署手册（部署看 `README.md`，本文只列环境变量与触发链） |

### 0.2 三条阅读路线

1. **只想快速知道有哪些功能** → §4.0 功能总表（一页看完）。
2. **要动手改某个模块** → §4 对应小节的「功能卡」+ §8 同模块的已知问题 + §9.2 改动路径。
3. **要做全局重构/换栈评估** → §2 架构 + §3 数据层 + §5 API 契约 + §7 质量体系。

### 0.3 约定

- **功能 ID**：`F-<模块>-<序号>`，例如 `F-TASK-03`。引用问题时请带上 ID，便于对照。
- **优先级**：P0 = 数据错误/安全/核心流程不可用；P1 = 明显体验缺陷或有数据风险；P2 = 打磨项。
- **证据强度**：
  - **代码可证**：逻辑在源码里直接成立，不需要运行。
  - **需复现**：代码路径指向该结论，但受运行时/平台影响，需先写测试或真机复现。
  - **设计权衡**：这是有意为之的取舍，不是 bug；改动前要先改约定。
- **路径**：全部相对仓库根目录；`src/` 为前端，`api/` 为 Vercel 函数。

### 0.4 规模与验证基线（2026-11-26）

| 指标 | 数值 | 出处 |
|---|---|---|
| 前端源码 | 143 文件 / 约 15,071 行 | `src/**/*.{ts,tsx,css}` |
| 服务端函数 | 7 文件 / 1,935 行 | `api/*.ts` |
| 测试 | 74 文件 / 约 702 用例 | `tests/`，`npm test` |
| E2E | 20 用例 | `e2e/smoke.spec.ts` |
| 数据库 | 21 张表 / 18 个迁移文件 | `supabase/migrations/` |
| 路由 | 12 个注册页面 + 5 个非注册路由 | `src/registry.ts` + `src/App.tsx` |
| 体积（2026-11-16 实测） | 入口 306KB raw / **83KB brotli**；首屏 726KB / 192KB；全站 1151KB / 324KB | `npm run check:bundle` |

> 已知测试环境失败：`tests/review-real-gateways.test.ts`（无真实网关凭据时跳过/失败），不属于回归。

---

## 1. 产品定位与不可违反的约束

### 1.1 一句话定位

**给一个人用的、数据完全自有的效率工作台 PWA**：待办 / 学习 / 健康 / 复盘 / 资讯 / 资料 / 提醒 / 项目，装进一个手机秒开、离线可用、可安装到主屏幕的 Web 应用。

### 1.2 真实使用场景（决定取舍的上下文）

- 主要设备：**手机**（PWA 添加到主屏幕），桌面作为辅助；因此所有页面都必须先过移动端，再谈桌面增强。
- 使用节奏：早上看今日概览与资讯；白天记任务/专注；晚上写复盘；提醒依赖推送而不是一直开着页面。
- 数据规模：单人、千级条目；没有分页压力，但有「历史越来越长」的折叠/限窗需求。
- 网络：国内网络环境；安卓 Chrome 的 FCM 推送不可用，这是通知方案必须绕开的硬约束。

### 1.3 设计取向（冲突时的裁决顺序）

1. **稳定 > 完美**：宁可少一个功能，不要让核心流程（记任务、打卡、复盘）出错。
2. **实用 > 花架子**：每个交互都要能回答「这解决什么真实动作」。
3. **克制动效**：入场/切换 140–200ms，统一缓动；`prefers-reduced-motion` 全量降级。
4. **移动优先**：桌面可以有双栏/Bento，但移动端必须是完整可用的单列。
5. **数据自有**：本地 IndexedDB/localStorage 或自己的 Supabase；不把数据交给第三方效率服务。
6. **最简实现 + 增量生长**：先跑通端到端，再加抽象；不写预防性抽象，不为旧格式写兼容层。
7. **优先成熟方案**：先翻已有依赖，再看成熟库，最后才手写；只有进入首屏关键路径的依赖才需要掂量体积。

### 1.4 红线（违反 = 事故）

| # | 约束 | 原因/后果 |
|---|---|---|
| 1 | `api/*.ts` **必须单文件**，禁止相对导入 `src/` | Vercel 函数运行时会 `FUNCTION_INVOCATION_FAILED`（2026-08-05 线上结论） |
| 2 | 双仓储**行为必须一致** | 本地模式（测试/离线）与云端模式各跑一套，漂移会造成「本地好的线上坏」；改任一实现必须跑 `tests/repository-contract.test.ts` |
| 3 | 暴露私有内容的 API **必须鉴权** | 例如项目详情用 JWT；响应按人不同时必须 `Cache-Control: private` |
| 4 | 知识库是项目页的**唯一事实源** | 项目页只读镜像（10 分钟缓存），编辑跳 github.dev，禁止双写 |
| 5 | 数据库迁移**幂等**，且必须用户在场执行 | agent 不碰线上库；缺列会让 cron/check 直接 500 |
| 6 | 前端 create/update 提交按钮 `isPending` 时禁用 | 云端一次往返几百毫秒，连点会重复创建（历史上目标/身体记录都中过） |
| 7 | 提醒的 dismiss/restore 不做 | v1.31 起提醒是**派生视图**，出口是「把事处理掉」；加回独立状态会让角标与列表再次对不上 |
| 8 | 不给提醒新增 `channel id` | 服务端按 `sent_channels` 记账；新增 id 会让同一条消息按两个通道各发一次 |
| 9 | 前台系统通知只走 `registration.showNotification()` | `new Notification` 在 SW 控制的页面与 iOS 上抛 `TypeError: Illegal constructor`（v1.23 全站崩溃根因） |
| 10 | 纯函数不要从组件文件导出 | 触发 fast-refresh 警告；放 `*-utils.ts` / `*-view.ts` / `lib/` |

### 1.5 明确不做（当前范围外）

- 多用户 / 团队协作 / 权限体系（单用户，RLS 只保证「只有本人」）。
- 自建后端服务器（只用 Supabase + Vercel Serverless）。
- 站内社交、评论、公开分享。
- 端到端加密、离线写冲突合并（本地模式与云端模式二选一，不做双向同步）。
- 富文本编辑器（速记是 Markdown 子集 + 纯文本存储）。

### 1.6 当前版本状态与未决事项

- **v1.34.1 已发布**：提醒投影统一（`effectiveRows`）、提醒中心筛选/完成/顺延、复盘两段式明日待办、项目刷新回音与回到顶部、动效节奏收敛、SC3 测试发送回显原始响应。
- **未决（阻塞产品方向）**：微信投递通道。现状：Server酱³（SC3）是**自有 App 消息**，不是微信；`code:0` 只代表服务端受理，不代表到达。SCT（微信服务号，免费 5 条/天）与 PushPlus（微信公众号，200 次/天，需迁移 019）二选一或都接，尚未拍板。详见 `docs/plans/RESEARCH_2026-11-17_通知推送.md` §7。
- **已知文档漂移**：README 写「⌘K 命令面板（全局搜索任务/笔记/热点/导航）」，实际只搜命令与页面名（见 §8，P1）。以本文为准。

---

## 2. 系统总览

### 2.1 技术栈

| 层 | 选型 | 说明 |
|---|---|---|
| 前端框架 | React **19.2.8** + TypeScript ~6.0（strict） | 函数组件 + hooks |
| 构建 | Vite **8**（rolldown） | `tsc -b && vite build` |
| 路由 | react-router-dom **7** | `BrowserRouter` + 懒加载 |
| 数据请求 | TanStack React Query **v5** | 每个模块 `api.ts` 导出 queryKey + hooks |
| 本地 UI 状态 | Zustand **v5** | 只有壳层浮层状态与提醒未读数 |
| 样式 | Tailwind CSS **v4** + CSS 变量 | 见 `src/index.css` |
| 组件底座 | `@base-ui/react`（**不是** radix）+ shadcn 风格包装 | `src/components/ui/*` |
| 图标 | lucide-react | 统一 `strokeWidth={1.7}` |
| 提示 | sonner | `<Toaster position="top-center" richColors>` |
| 后端 | Supabase（Postgres + RLS + Auth） | 可选；无 env 时走本地仓储 |
| 服务端 | Vercel Serverless Functions（Node） | 7 个文件，`vercel.json` rewrite 分入口 |
| PWA | vite-plugin-pwa（Workbox `injectManifest`） | 自动升级 + 离线回退 + Web Push |
| 测试 | Vitest + Testing Library（jsdom）、Playwright | 纯函数优先；组件测试不 mock 仓储（本地真库） |

### 2.2 分层与数据流

```
页面组件 src/modules/*/*.tsx、src/app/*
   │  useQuery / useMutation（modules/*/api.ts；queryKey 常量 + onSuccess invalidate）
   ▼
仓储接口 src/lib/db/types.ts  WorkbenchRepository
   │  isCloudMode = Boolean(VITE_SUPABASE_URL && VITE_SUPABASE_ANON_KEY)
   ├── LocalRepository      localStorage（键前缀 wb:）+ 惰性迁移
   └── SupabaseRepository   Postgres + RLS（snake_case ↔ camelCase 映射）
                                 ▲
服务端 api/*.ts ─── service role / 用户 JWT ─── Supabase
   ├── 提醒扫描 + 三通道发送（cron / check / test）
   ├── 热点聚合（25+ 源）+ AI 日报编排（hot / digest）
   ├── 知识库门户口镜像（projects）
   └── 天气/空气质量代理、手机号解析
```

**硬边界**：UI 不直接碰仓储实现；页面不 import `api/`；`api/` 不 import `src/`。

### 2.3 路由表

| 路径 | 页面 | 注册方式 | 移动端入口 | 说明 |
|---|---|---|---|---|
| `/` | 工作台总览 | registry `home` | 底部「总览」 | 移动端单列，桌面 Bento |
| `/tasks` | 今日待办 | registry | 底部「今日待办」 | 今日/逾期/将来/已完成 |
| `/reminders` | 提醒中心 | registry | 侧边栏 / 横幅 / 角标 | 无底部 Tab |
| `/projects` | 我的项目 | registry | 侧边栏 / 首页卡 | 知识库镜像 |
| `/projects/:name` | 项目详情 | `App.tsx` 单独路由 | 列表点击 | `:name` = 知识库目录名（已解码） |
| `/study` | 学习管理 | registry | 底部「学习管理」 | 考试 / 学习目标 |
| `/pomodoro` | 番茄钟 | registry | 侧边栏 / 首页卡 | 无底部 Tab |
| `/hot` | 今日热点 | registry | 底部「今日热点」 | 日报 / 热榜双 Tab |
| `/papers` | 资料库 | registry | 侧边栏 | 论文 + 文案笔记 |
| `/notes` | 灵感速记 | registry | 底部「灵感速记」 | Markdown 子集 |
| `/health` | 运动健康 | registry | 底部「运动健康」 | 打卡 / 习惯 / 记录 |
| `/review` | 今日复盘 | registry | **无底部 Tab**（首页卡/侧边栏/命令面板） | 双栏（≥lg） |
| `/growth` | 自我提升 | registry | 底部「自我提升」 | 行动 / 打卡 / 周复盘 |
| `/settings` | 我的 | `App.tsx` 懒加载 | 底部「我的」 | 五段式 |
| `/changelog` | 更新日志 | `App.tsx` 懒加载 | 设置页 | 整页阅读 |
| `/login` | 登录/注册 | `App.tsx` | — | 仅云端模式；本地模式重定向 `/` |
| `/reset-password` | 重置密码 | `App.tsx` | — | 仅云端模式 |
| `*` | — | 重定向 `/` | — | — |

> 侧边栏由 `modules` 数组生成（6 个主模块 / 12 个子模块）；底部 Tab 取「每个主模块第一个子模块 + 我的」，并**刻意排除复盘**（移动端只保留首页卡片入口）。

### 2.4 目录地图

| 目录 | 职责 | 关键文件 |
|---|---|---|
| `src/app/` | 壳层：布局、主题、认证、启动动画、浮层 | `layout.tsx`、`home.tsx`、`theme.tsx`、`auth.tsx`、`command-palette.tsx`、`quick-capture.tsx`、`boot-*.ts(x)` |
| `src/registry.ts` | 模块/路由/首页卡片唯一注册表 | `modules`、`homeCards()` |
| `src/modules/overview/` | 首页卡片、今日待办、天气、周趋势 | `today-tasks.tsx`、`task-item.tsx`、`task-dialog.tsx`、`api.ts` |
| `src/modules/study/` | 考试、学习目标、番茄钟 | `study-manager.tsx`、`goal-manager.tsx`、`pomodoro.tsx` |
| `src/modules/news/` | 热点/日报、速记、资料库 | `hot.tsx`、`daily-digest.tsx`、`notes.tsx`、`papers.tsx` |
| `src/modules/health/` | 习惯打卡、身体记录、热力图 | `health.tsx`、`habit-manager.tsx`、`derive.ts` |
| `src/modules/review/` | 复盘表单、汇总、趋势 | `review.tsx`、`review-utils.ts` |
| `src/modules/growth/` | 十项行动、行动打卡 | `growth.tsx`、`action-detail.tsx`、`presets.ts` |
| `src/modules/reminders/` | 提醒投影、中心、横幅、通知去重 | `format.ts`、`api.ts`、`reminders-center.tsx`、`notify-log.ts` |
| `src/modules/projects/` | 知识库镜像列表/详情 | `projects.tsx`、`project-detail.tsx`、`api.ts` |
| `src/modules/me/` | 我的页、通知设置 | `settings.tsx`、`notifications-section.tsx` |
| `src/lib/db/` | 仓储接口与双实现 | `types.ts`、`local-repository.ts`、`supabase-repository.ts` |
| `src/lib/` | 纯函数（规则、统计、重复、天气、月亮、备份…） | `task-rules.ts`、`repeat.ts`、`stats.ts`、`weather.ts`、`moon.ts` |
| `src/components/ui/` | shadcn 风格组件（base-ui 底座） | `dialog.tsx`、`sheet.tsx`、`select.tsx` |
| `api/` | Vercel 函数（单文件） | `reminders.ts`、`digest.ts`、`projects.ts`、`hot.ts` |
| `supabase/` | 迁移 + pg_cron SQL | `migrations/001-018`、`cron/reminders-5m.sql` |
| `tests/` `e2e/` | 单测/组件测 + Playwright 冒烟 | — |

### 2.5 启动链路

```
index.html
 └─ src/main.tsx
     └─ App.tsx
         ├─ QueryClientProvider（staleTime 30s, retry 1）
         ├─ ThemeProvider（读 wb-theme，toggle class="dark"）
         ├─ BrowserRouter → AuthProvider（本地/云端）
         ├─ Toaster
         ├─ BootAnimation（时间 × 天气，约 3s，可点跳过；reduced-motion 跳过）
         └─ ErrorBoundary → Suspense → Routes
             └─ Guard（云端未登录 → /login）
                 └─ Shell（侧边栏 + 顶栏 + <main> + 底部 Tab + FAB + 浮层）
                     └─ ErrorBoundary key={pathname} → Suspense → div.page-enter → Outlet
```

- 页面组件全部 `lazyRetry(() => import(...))`：chunk 加载失败自动重试一次并防死循环。
- `Shell` 内挂：全局快捷键、浮层返回键、提醒同步（角标）、提醒定时器。
- 路由切换会重挂载内容区（`key={pathname}`），因此**页面入场动画每次导航都会重播**，同时单页错误不会粘住其他路由。

### 2.6 状态四层（改功能前先判断状态该放哪层）

| 层 | 存什么 | 生命周期 | 例子 |
|---|---|---|---|
| 组件 `useState` | 表单草稿、展开/折叠、当前筛选 | 卸载即失 | 任务对话框字段、提醒筛选 |
| React Query | 服务端/仓储数据 + 派生 select | 缓存 30s（部分 5/10 分钟），失效即重取 | 任务、笔记、提醒、日报 |
| Zustand | 跨组件 UI 状态 | 页面会话 | 命令面板/快速捕获/快捷键弹窗开关、提醒未读数、扫描时刻 |
| localStorage | 需要跨刷新/跨会话的偏好与轻量账本 | 长期 | 主题、番茄钟状态、已读热点、通知去重账本、复盘分区开合、备份时间 |

> 选择原则：**只有需要跨页面/跨刷新共享的才升级到 Zustand/localStorage**；其余留在组件里，避免全局状态膨胀。

### 2.7 部署形态

- **云端模式**：Vercel 静态站点 + Serverless；Supabase 提供库与 Auth；PG Cron 每 5 分钟打 `/api/cron-notify`；GitHub Actions 每 20 分钟兜底；页面开着时前端定时器准点触发。
- **本地模式**：无 Supabase env 时自动落入，数据只在浏览器；PWA、天气/热点/项目列表仍可用（项目详情需服务端，本地模式会 401/503）；提醒只有应用内横幅 + 前台通知，没有外部推送。
- 构建产物由 SW 预缓存，发版后下次打开自动换包（`autoUpdate` + `skipWaiting` + `clientsClaim`）。

---

## 3. 数据层

### 3.1 领域模型（21 张表）

前 12 张是「用户数据」，完整参与导出/导入；后 9 张是系统表，不进备份。

| # | 表 | 域对象 | 关键字段 | 约束/说明 |
|---|---|---|---|---|
| 1 | `wb_tasks` | `Task` | title, focus, priority(high/medium/low), status(todo/doing/done/someday), due_date, due_time, focus_date, tags[], sort, completed_at, repeat(jsonb), checklist(jsonb), note | `sort` 是 double（v1.24 起烘焙）；`repeat` 见 §4.3；`checklist` 是 `{id,text,done}[]` |
| 2 | `wb_habits` | `Habit` | name, icon, color, target_per_day, active | 打卡目标次数；行动绑定的习惯归成长模块 |
| 3 | `wb_habit_logs` | `HabitLog` | habit_id, log_date, count | 唯一 `(user_id,habit_id,log_date)`；`setHabitLog` 是 upsert |
| 4 | `wb_focus_sessions` | `FocusSession` | start_at(UTC ISO), minutes, note | 番茄完成时写入；无「结束时间」字段 |
| 5 | `wb_exams` | `Exam` | exam_date, exam_time, subject, note | 有 exam_time 才有「考前 1 小时」节点 |
| 6 | `wb_notes` | `Note` | content, tags[], archived, pinned, updated_at | 置顶优先、updated_at 倒序；本地与云端都显式刷新 updated_at |
| 7 | `wb_papers` | `Paper` | type(paper/note), title, authors, arxiv_id, url, status(want/reading/done), rating(1-5), folder_id, tags[], content, summary, keywords[], source, finished_at | 论文与文案共用一张表；`finished_at` 随 status |
| 8 | `wb_folders` | `Folder` | name, parent_id, sort | 任意层级；删除级联子树，资料归未分类 |
| 9 | `wb_health_logs` | `HealthLog` | log_date, type(weight/sleep/exercise), value | 体重/睡眠每天一条（迁移 013 部分唯一索引），运动可多条 |
| 10 | `wb_reviews` | `Review` | review_date, mood(1-5), score(1-10 可空), summary, plan_tomorrow, achievements, reflection, gratitude, learnings, updated_at | 唯一 `(user_id,review_date)`，按日期 upsert |
| 11 | `wb_study_goals` | `StudyGoal` | title, target, progress, deadline, status(active/done), note, completed_at | `completed_at` 随 status；进度不自动归档 |
| 12 | `wb_growth_actions` | `GrowthAction` | no(1-10), title, emoji, category, why, steps(JSON 文本), targets(JSON 文本), verify, habit_id, status(active/paused/done), sort | `steps/targets` 在 Postgres 是 text，仓储层 JSON 序列化/解析 |
| 13 | `wb_reminders` | `Reminder` | ref_type(task/exam/goal), ref_id, kind, scheduled_at, sent_at, sent_channels(jsonb) | **派生数据**；唯一 `(user_id,ref_type,ref_id,kind)`；`sent_channels` 按通道记账（迁移 018） |
| 14 | `wb_push_subscriptions` | `PushSubscriptionRow` | endpoint, keys_p256dh, keys_auth, user_agent | 唯一 `(user_id,endpoint)`；410/404 时服务端删除 |
| 15 | `wb_channel_configs` | `ChannelConfigs` | serverchan_key, telegram_bot_token, telegram_chat_id | **整行覆盖**：保存必须传全字段 |
| 16 | `wb_subscriptions` | `Subscriptions` | source_ids[], topics[] | 每个用户一行；热点源筛选 |
| 17 | `wb_login_aliases` | — | phone(PK), user_id | 手机号→邮箱登录；RLS 只允许本人；不进备份 |
| 18 | `wb_hot_items` | — | title, url(normalized 维一), source_name, ai_score, ai_category, ai_summary, ai_status(pending/processing/done/skipped/failed), event_id | AI 日报原料层；见迁移 015/016 |
| 19 | `wb_hot_events` | — | title, category, heat, item_ids[], source_count, event_date | 聚簇后的事件层 |
| 20 | `wb_daily_reports` | `DailyReport` | report_date, title, overview, sections(jsonb), item_count, source_count, model, generated_at | 唯一 `(user_id,report_date)`；前端只读 |
| 21 | `wb_digest_runs` | — | report_date? stage, status, detail, items_in/out | enrich/build 的运行日志（服务端写） |

> 本地模式没有「表」，就是 `wb:<key>` 的 JSON 数组；键名与上表前 12 张一一对应（见附录 B）。

### 3.2 双仓储契约

`src/lib/db/types.ts` 定义 `WorkbenchRepository`（约 40 个方法）。两个实现：

| 行为 | LocalRepository | SupabaseRepository |
|---|---|---|
| 选择 | 无 Supabase env | 有 env（构建期决定，运行时不切换） |
| 存储 | localStorage，`wb:` 前缀，数组整体读写 | Postgres + RLS，行级读写 |
| 排序 | 在 JS 里排（tasks 按 sort desc；notes 置顶+updated_at） | SQL `order` |
| 惰性迁移 | tasks 的 sort 烘焙、focusDate 补全、notes 的 tag→tags、papers 新字段默认值 | 只做 focusDate / tags / 默认值；sort 由迁移 011 回填 |
| 事务 | 无（`importAll` 先快照、失败回滚） | 无跨表事务；`importAll` 逐表独立 try，失败表报告 |
| 删除习惯 | 同时删 habitLogs、清 growthActions.habitId | 删 habit + 日志（外键 cascade）+ 清 actions.habit_id |
| 删除文件夹 | 收集子树 → 资料 folder_id=null → 删文件夹 | 同上（显式两步，因 papers.folder_id 无外键） |
| 健康记录去重 | 取同日同类型**最后一条**覆盖，并清理重复行 | `order(id desc).limit(1)` 更新；迁移 013 部分唯一索引兜底 |
| 日报 | 恒为空（无 service role） | 只读 `wb_daily_reports` |

**契约测试**：`tests/repository-contract.test.ts` 用同一段操作脚本分别驱动两套实现并对比快照。改任一侧都要跑。

### 3.3 派生字段规则（最容易被改坏的地方）

| 字段 | 规则 | 共用位置 |
|---|---|---|
| `Task.completedAt` | `status→done` 写 `now`；`status` 改为非 done 清空；显式传 `completedAt` 采纳；否则保持 | `applyTaskPatch`（types.ts）被仓储 + 乐观更新共用 |
| `Task.sort` | `1e13 × (high=3/medium=2/low=1) + 毫秒时间戳`；列表按降序；拖拽写「上下邻中点」 | `bakeTaskSort`（types.ts）、迁移 011、两端 createTask、`lib/drag-sort.ts` |
| `Task.focusDate` | focus=true 且无 focusDate → 创建日（本地时区）惰性补；打开焦点=今天；编辑已焦点任务保持原绑定日；关闭=nil | 两端 `listTasks` + `TaskDialog` |
| `StudyGoal.completedAt` | status→done 写；离开 done 清；纯进度更新不动 | 两端 `updateStudyGoal` |
| `Paper.finishedAt` | status→done 写；离开 done 清 | 两端 `updatePaper` |
| `Note.updatedAt` | **每次 update 都显式写 now**（云端无触发器） | 两端 `updateNote` |
| `Reminder.sent_at` | 所有「已配置通道」都成功才写；否则保持 NULL，下轮补发失败通道 | `api/reminders.ts sendDue` |
| `Reminder.sent_channels` | 按 `webpush/serverchan/telegram` 记账 + `errors`；已成功不重发 | 同上 |

> 口诀：**任何「跟随状态」的时间字段，都必须在双仓储里用同一套分支**；任何「乐观更新」的对象必须和落库对象完全一致（否则列表先消失再回来，出现空帧）。

### 3.4 React Query 键与缓存

| queryKey | 数据 | staleTime | 备注 |
|---|---|---|---|
| `['tasks']` | 全部任务 | 30s（全局默认） | 多处消费；mutation 乐观更新 |
| `['exams']` / `['focusSessions']` / `['studyGoals']` | 学习域 | 30s | `useExamsSoon` 用 select 过滤 |
| `['habits']` / `['habitLogs']` / `['healthLogs']` | 健康域 | 30s | 统计用 select 派生，共享缓存 |
| `['notes']` / `['papers']` / `['folders']` | 资讯域 | 30s | `useNotes` select 过滤归档 |
| `['reviews']` | 复盘 | 30s | 今日复盘用 select |
| `['growthActions']` | 行动 | 30s | — |
| `['reminders']` | 提醒（云端会触发一次全量扫描） | 30s | `staleTime` 是为压住重接口；窗口聚焦仍可能重取 |
| `['projects']` | 项目列表 | 10 min | 失败回落 `/projects-status.json` |
| `['project-detail', dir]` | 项目全文 | 10 min | 401/503 有专门文案；不重试 |
| `['dailyReports', limit]` | AI 日报 | 5 min | **limit 必须在 key 里**（否则首页 1 条会污染日报页 30 条） |
| `['weather']` | 天气+空气 | 10 min | 卡片与弹窗共用 |

### 3.5 备份格式

```json
{
  "app": "personal-workbench",
  "version": 1,
  "exportedAt": "ISO",
  "mode": "local | cloud",
  "tables": { "tasks": [], "habits": [], ... 12 张表 }
}
```

- 导出：`downloadBackupFile()` → 12 张表 → `workbench-backup-YYYYMMDD.json`；成功后记 `wb:last-backup`，设置页显示「上次备份 N 天前」并在 ≥7 天时提醒。
- 导入：`validateBackup` 校验 `app/version/12 张表都是数组` → 二次确认 → `repository.importAll`。本地模式先快照全部 `wb:` 键，失败回滚；云端逐表 delete+upsert，失败表汇总报错。
- **不包含**：提醒、推送订阅、通道配置、订阅源、日报、登录别名、本地偏好（主题/番茄钟/已读热点）。换设备后这些需要重配。

### 3.6 迁移与定时任务

- 迁移 `001–018`（002 编号重复：`002_add_folders` 与 `002_subscriptions`，历史既成不改名）。全部幂等，可重复执行；`003_reminders` 的策略块是历史例外（不要重复跑）。
- 升级顺序：**先执行 018（`sent_channels`），再部署 v1.32+ 代码**；缺列会让 cron/check 直接 500。
- 提醒触发三层：
  1. 页面开着：`useReminderTimer` 在「下一条提醒时刻」invalidate → `/api/check-reminders`（准点）。
  2. Supabase pg_cron：`*/5 * * * *` → `/api/cron-notify`（主触发器，SQL 见 `supabase/cron/reminders-5m.sql`）。
  3. GitHub Actions：每 20 分钟 → 同一端点（兜底；实测中位 199 分钟，不可依赖）。
- AI 日报：`.github/workflows/digest.yml` 定时跑 `/api/digest-enrich` 与 `/api/digest-build`；`/api/build-digest` 供用户手动重生成。

---

## 4. 功能拆解

### 4.0 功能总表

| ID 段 | 模块 | 功能数 | 一句话 |
|---|---|---|---|
| F-SHELL | 壳层与全局 | 13 | 导航、主题、命令面板、快速捕获、快捷键、引导、概览弹窗、启动动画、PWA、离线、日志 |
| F-OV | 总览 | 7 | Bento 首页、移动首页、四格概览、周趋势、天气卡与详情、各模块首页卡 |
| F-TASK | 今日待办 | 10 | 分区、对话框、重复、任务卡、完成/撤销、逾期治理、将来箱、拖拽、筛选 |
| F-STUDY | 学习与科研 | 6 | 考试倒计时、学习目标、番茄钟、今日专注 |
| F-NEWS | 资讯与资料 | 12 | AI 日报、热榜、热点源、速记、资料库、文件夹、arXiv/DOI 导入、引用 |
| F-HEALTH | 健康 | 6 | 今日打卡、习惯管理、身体记录、热力图/连击 |
| F-REVIEW | 复盘 | 6 | 心情/评分、六分区、明日待办两段式、历史、周汇总、趋势 |
| F-GROWTH | 成长 | 5 | 十项行动、今日打卡、行动详情、周复盘 |
| F-REM | 提醒 | 8 | 生成规则、投影、中心、横幅、前台通知、通道、测试、触发 |
| F-PROJ | 项目 | 5 | 列表/刷新语义、详情、回到顶部、门户口解析 |
| F-ME | 我的 | 7 | 身份卡、统计、外观、通知、数据、账号、关于 |
| F-AUTH | 认证 | 4 | 邮箱/手机号登录、注册、重置密码、别名 |

### 4.1 壳层与全局（F-SHELL）

#### F-SHELL-01 响应式壳层

- **入口**：所有已登录页面。
- **文件**：`src/app/layout.tsx`、`src/registry.ts`。
- **行为**：
  - `≥md`：左侧栏（200px；`≥xl` 224px 并显示模块分组标题与文字标签；`md–xl` 只有图标 + aria-label）。
  - `<md`：底部固定 Tab，取「每个主模块第一个子模块 + 我的」；`/review` 不在 Tab 中。
  - 移动端右下 FAB（+）→ 打开快速捕获的「任务」Tab；位置 `bottom-20 right-4`，避开底部 Tab。
  - 内容区 `<main>` 是**滚动容器**（不是 window）——所有「回到顶部/滚动监听」都要找 `closest('main')`。
  - 顶栏 sticky；离线时显示琥珀色横条（`online/offline` 事件）。
- **边界**：`main` 底部 `pb-32 md:pb-6` 给底部 Tab 与 FAB 让位；路由切换靠 `key={pathname}` 重挂载内容区。
- **优化注意**：新增页面必须进 registry（否则无路由/无导航）；新增主模块会自动出现在侧边栏，但底部 Tab 只取第一个子模块。

#### F-SHELL-02 顶栏

- **文件**：`src/app/layout.tsx`。
- **内容**：时段问候（`greeting()`：<6 夜深了 / <12 早上好 / <18 下午好 / 否则晚上好）、日期、搜索按钮（桌面显示「搜索任务、笔记、热点…」文案 + ⌘K；移动仅图标）、主题切换、头像（首字母 + `avatarColor`）。
- **注意**：顶栏搜索文案**大于实际能力**（见 §8 P1）。

#### F-SHELL-03 主题

- **文件**：`src/app/theme.tsx`、`src/index.css`、设置页 `AppearanceSection`。
- **行为**：三态 `light | dark | system`，存 `wb-theme`；`system` 跟随 `prefers-color-scheme` 并实时响应；切换时给 `<html>` 加/去 `.dark`，并更新 `meta[name=theme-color]`（深 #262B28 / 浅 #F8F6F2）。
- **交互**：顶栏按钮只做「当前生效主题的明暗互换」（避免三态循环看起来没反应）；「跟随系统」只能在设置页选。
- **配色**：米白底/鼠尾草绿/燕麦黄/陶红；深色模式独立一套；任务「中优先级」用 `--priority`（不是 `--accent`，后者对比度不够）。

#### F-SHELL-04 命令面板（⌘K / Ctrl+K）

- **文件**：`src/app/command-palette.tsx`、`src/app/hotkeys.tsx`、`src/lib/hotkeys.ts`。
- **行为**：三组——新建（任务/速记/打卡）、操作（切主题/导出备份/快捷键/设置）、导航（全部子模块）。输入框按 `label.includes(q)` 过滤；空结果给「没有匹配结果」；Esc 关闭；点遮罩关闭。
- **不做什么**：**不搜索任务/笔记/热点内容**（尽管顶栏文案暗示可以）。
- **优化注意**：要加全局搜索，数据源应走 React Query 缓存（`['tasks']`/`['notes']`/`['dailyReports']`），不要新开请求；结果分组与键盘上下选择需要补齐（当前只能点击）。

#### F-SHELL-05 快速捕获

- **文件**：`src/app/quick-capture.tsx`、`src/app/store.ts`。
- **入口**：FAB（任务 Tab）、⌘N / ⌘⇧N / ⌘⇧X、命令面板「新建」。
- **三个 Tab**：
  1. **任务**：标题 + 「存入将来收件箱」勾选（`status='someday'`，无日期）；否则 `dueDate=今天`。按钮 `isPending` 禁用。
  2. **速记**：多行文本 → `createNote(content)`（无标签，标签在速记页补）。
  3. **打卡**：「全部打卡」= 对**健康自有习惯**（排除被成长行动绑定的）逐个 +1，封顶 `targetPerDay`；已达目标值的写回同值（相当于不变）。没有可打卡习惯时 toast「没有可打卡的个人习惯」。
- **边界**：浮层是自绘 div（不是 Dialog 组件），Esc 关闭但受命令面板优先级保护；打开时压一条同 URL 历史（F-SHELL-07）。
- **优化注意**：「全部打卡」对 `targetPerDay>1` 的习惯只 +1，不等于「完成」，文案有歧义（见 §8 P2）。

#### F-SHELL-06 全局快捷键

| 快捷键（Mac / Win） | 动作 |
|---|---|
| ⌘K / Ctrl+K | 开关命令面板 |
| ⌘N / Ctrl+N | 快速捕获·任务 |
| ⌘⇧N / Ctrl+Shift+N | 快速捕获·速记 |
| ⌘⇧X / Ctrl+Shift+X | 快速捕获·打卡 |
| ⌘, / Ctrl+, | 打开设置 |

- **文件**：`src/lib/hotkeys.ts`（纯函数 `matchHotkey` / `formatShortcut`）、`src/app/hotkeys.tsx`。
- **边界**：不判断焦点是否在输入框——在输入框里按也会触发（有意：全局快捷键优先）。首次引导打开时全部禁用。

#### F-SHELL-07 浮层返回键

- **文件**：`src/app/use-overlay-back.ts`。
- **问题**：浮层只在 zustand 里，不进 history；手机返回键会翻走背后的页面，浮层关不掉。
- **方案**：浮层打开时 `pushState({wbOverlay:true})`（同 URL）；返回键 → popstate → 关闭全部浮层；手动关闭时在微任务里 `history.back()`，并用 token 处理「命令面板→快速捕获」同 tick 接力。
- **注意**：任何新浮层（Dialog/Sheet 以外自绘的）都要接进 `useOverlayBack` 的 `open` 判断，否则会出现同样的「退不出来」。

#### F-SHELL-08 首次引导

- **文件**：`src/app/onboarding.tsx`。
- **行为**：3 步（欢迎 / 快速输入 / 数据安全），右下「下一步 / 开始使用」，左上「跳过」；完成后写 `wb-onboarded=1`；显示期间 `onboardingActive=true` 禁用全局快捷键。
- **注意**：只在 localStorage 没有标记时出现；清浏览器数据会重来。

#### F-SHELL-09 今日概览弹窗

- **文件**：`src/app/daily-summary.tsx`、`src/app/home.tsx`。
- **触发**：进入首页、数据就绪后，若「今日待办非空或近期考试非空」且本会话没弹过（`sessionStorage: wb:daily-summary-shown`）→ 弹一次。
- **内容**：左栏今日待办（进度条 + 未完成列表可勾选完成）、考试倒计时（前 3）；右栏最新版更新日志（3 条）+ 去整页。
- **边界**：桌面 `sm:max-w-[820px]` 双栏，移动单列可纵向滚动；禁止横向滚动（`min-w-0` + `truncate` 必须保留）。
- **优化注意**：弹窗内勾选直接 `update {status:'done'}`，**没有走 `completionPatch`**——对重复任务会终结整条序列（与提醒中心/待办页不一致，见 §8 P1）。

#### F-SHELL-10 启动动画

- **文件**：`src/app/boot-animation.tsx`、`boot-scene.ts`、`boot-atmosphere*.ts(x)`、`boot-weather.ts`、`boot-animation.css`。
- **行为**：按「时段（dawn/noon/dusk/night）× 天气」组合场景；天空渐变 → Canvas 双层氛围（星/云/雨/雪/雾）→ Meteocons 主角 → 远山 → 品牌；总时长约 3s（`BOOT_PLAY_MS`），点击任意处淡出 680ms；天气取 `/api/weather`，失败降级纯时间场景。
- **重播**：冷启动必播；从后台恢复且隐藏 ≥5 分钟重播（`REPLAY_AFTER_HIDDEN_MS`）。
- **跳过**：`prefers-reduced-motion` 或 `localStorage wb-boot-skip='1'`（E2E 用）。
- **预览钩子**：`?boot=night&wx=rain`（仅调试，不影响正常用户）。
- **优化注意**：每次冷启动 3s 是**感知成本**；如果优化，优先做「老用户可关」而不是删场景（用户明确喜欢这套视觉）。

#### F-SHELL-11 PWA 安装

- **文件**：`src/lib/pwa-install.ts`、`src/pwa.ts`、设置页 AboutSection。
- **行为**：启动期捕获 `beforeinstallprompt`（挂设置页会永久丢事件），状态存模块级 + `useSyncExternalStore`；`promptInstall()` 消费一次性事件；`appinstalled` 后标记 installed；standalone 检测含 iOS `navigator.standalone`。
- **展示**：设置页「添加到主屏幕」行；Android/桌面 Chromium 显示「安装」，iOS 显示「查看方法」（Safari 分享 → 添加到主屏幕）。

#### F-SHELL-12 离线与错误边界

- **文件**：`src/app/layout.tsx`、`src/components/error-boundary.tsx`、`src/sw.ts`、`src/App.tsx`。
- **离线**：`navigator.onLine` + 事件监听，顶栏下方横条；SW 导航失败回退缓存 `index.html`；自家 `/api/*` GET 走 StaleWhileRevalidate（1h/10 条）。
- **错误边界**：外层包路由，内层 `key={pathname}` 路由级重置；单页渲染错误不会粘死全站。**不要删这个 key**。
- **兜底**：懒加载 chunk 失败由 `lazyRetry` 重试一次并防死循环。

#### F-SHELL-13 更新日志

- **文件**：`src/app/changelog.ts`（数据源，最新在前）、`src/app/changelog-page.tsx`（整页）。
- **行为**：按版本倒序列出；每条自动识别「新增/修复/变更/提速/安全/移除：」前缀并加粗；当前版本标「最新」。
- **约定**：`CHANGELOG[0]` 就是应用内显示的版本号（没有硬编码 version），发版必须先改它。

### 4.2 总览（F-OV）

#### F-OV-01 桌面 Bento 首页

- **文件**：`src/app/home.tsx`、`src/registry.ts`、`src/lib/bento.ts`、`src/index.css`。
- **网格**：12 列，`grid-auto-flow: row`；每行跨度之和必须 = 12，否则行尾留洞（`tests/home-bento.test.ts` 守）。
- **顺序**：天气卡固定第一（span 4），其余按 `desktopOrder`：热榜 1（span 8）→ 待办 2（4）→ 周趋势 3（4）→ 专注 4（4）→ 热力 5（4）→ 成长 6（4）→ 项目 7（4）→ 考试 8（4）→ 速记 9（4）→ 复盘 10（4）。
- **整卡跳转**：`CARD_LINK` 只允许「内部不含链接」的卡（待办/趋势/考试/专注/热力/复盘/速记）。热榜、项目、成长卡内部有链接，**不能**整卡包 `<a>`（嵌套 a 会 hydration 报错）。
- **等高**：`.home-cell > * {height:100%}` 与 CardContent `flex:1` 让同一行等高；新增卡片若不自适应高度会露出空洞。
- **入场**：每卡 `card-enter` + 40ms stagger；reduced-motion 关闭。

#### F-OV-02 移动端首页

- **文件**：`src/modules/overview/overview-home.tsx`（根自带 `md:hidden`）。
- **顺序**：四格概览条 → 天气卡 → 今日焦点（最多 3）→ 今日待办（最多 5，可看全部）→ 最近考试倒计时 → 习惯热力（MiniHeatmap）→ 快捷入口（MobileHomeEntries）→ 本周趋势。
- **注意**：今日口径只含 `isTodayScope` 且未完成；逾期由概览条「逾期 N 项」承接，不混入列表。

#### F-OV-03 今日概览条（四格）

- **文件**：`src/modules/overview/overview-summary.tsx`。
- **四格**：今日待办 `done/total`（有逾期则副文案「逾期 N 项」，否则完成率）、今日专注分钟、今日打卡 `todayCount/activeHabits` + 连续天数、今日复盘「✓ 已写 / ○ 待写」。
- **口径**：`isTodayScope`（今日到期 / 今日焦点 / doing）+ 历史逾期单独计数。桌面与移动共用。

#### F-OV-04 本周趋势

- **文件**：`src/modules/overview/weekly-trend.tsx`、`weekly-trend-chart.tsx`、`src/lib/stats.ts`。
- **数据**：近 7 天（含今天）完成任务数（按 `completedAt` 本地日期）与专注分钟（按 `startAt`）。
- **图**：纯 SVG 手绘，柱=专注（左轴 max/0），折线=任务（独立缩放），桌面 hover / 移动点击出 tooltip，默认选中最后一天；`ResizeObserver` 自适应宽度。
- **空态**：7 天都没有记录 → EmptyState。

#### F-OV-05 天气卡

- **文件**：`src/modules/overview/weather-card.tsx`、`weather-data.ts`、`src/lib/weather.ts`、`api/weather.ts`、`api/air-quality.ts`。
- **数据**：重庆固定坐标（29.563N, 106.5516E）；实况 + 3 日；空气质量并行拉取（可失败）；10 分钟新鲜期、失败重试 1；`Promise.allSettled`，空气失败只隐藏该块。
- **展示**：Meteocons 图标 + 温度 + 今日高低温 + 三日预报；点击打开详情。
- **注意**：城市不可配置（见 §8 P2）；dev 用 vite proxy 直连 Open-Meteo，生产走薄代理（同一份解析）。

#### F-OV-06 天气详情弹窗

- **文件**：`src/modules/overview/weather-dialog.tsx`、`weather-dialog.css`、`src/lib/moon.ts`。
- **结构**：场景头（按天气 × 昼夜的天空渐变 + 星/月/云/雨/雪/雾层）→ 日出日落弧 → 月出月落（本地解算月相，含盈亏形状/照亮比例/月出月落/是否在地平线上）→ 六指标（湿度/体感/风速/UV/AQI/降水概率）→ 24 小时横滑 → 7 日温度区间条。
- **注意**：月相不依赖接口（Open-Meteo 无月亮字段）；`suncalc` 只用于测试裁判，运行时不引。

#### F-OV-07 首页卡片清单

| 卡片 | 数据 | 空态 | 备注 |
|---|---|---|---|
| 今日待办 | 前 5 条今日任务 | 「今天没有待办 🎉」 | 整卡跳 /tasks |
| 周趋势 | 近 7 天 | 「本周还没有记录」 | 整卡跳 /tasks |
| 最近考试 | 全部考试按日期前 3 | 「暂无考试安排」 | 整卡跳 /study |
| 今日专注 | 今日分钟 + 番茄数 | 0 也显示 | 整卡跳 /pomodoro |
| 习惯热力 | 28 格 + 连续天数 + 今日完成 | — | 整卡跳 /health |
| 自我提升 | 进行中行动前 3 个未打卡 + 今日/本周进度 | 有专门空态卡（**不能 return null**，否则 Bento 留一整行空白） | 内部有链接，不整卡跳 |
| 我的项目 | 进行中前 3 + 总数 | 「暂无进行中的项目」 | 内部有链接，不整卡跳 |
| 灵感速记 | 最近 3 条（置顶优先） | 「暂无速记」 | 整卡跳 /notes |
| 今日复盘 | 今日总结前 2 行 | 「今天还没复盘…」 | 整卡跳 /review |
| 今日热点 | 有日报优先显示日报摘要，否则热榜前 4 | Skeleton | 内部有外链，不整卡跳 |

### 4.3 今日待办（F-TASK）

#### F-TASK-01 分区与计数

- **文件**：`src/modules/overview/today-tasks.tsx`、`api.ts`。
- **分区顺序**：已逾期（近 7 天，红框）→ 「更早过期」（`<details>` 折叠）→ 今日 → 已完成（默认展开，可折叠）→ 将来（`<details>`，空时不渲染）。
- **口径**：
  - `isTodayScope` = `dueDate===today` 或 `focus && focusDate===today` 或 `status==='doing'`。
  - `todayTasks` = 未完成（`isDoneForToday` 为假）且（今日口径 或 已过期），排序 = 焦点 → doing → `sort` 降序。
  - `todayDone` = 今天完成（`completedAt` 本地日期 = 今天），完成时间倒序。
  - `recentOverdue` = 近 7 天逾期；`oldOverdue` = 更早。今日列表会剔除逾期，避免同一任务两处出现。
- **头部**：今日 N 项 / 已完成 N / 逾期 N；「新建」按钮。
- **优化注意**：`doing` + 逾期会同时命中 `todayTasks` 与 `recentOverdue`，靠 `todayList` 的过滤兜住；改口径时三处要一起改。

#### F-TASK-02 新建/编辑任务对话框

- **文件**：`src/modules/overview/task-dialog.tsx`。
- **字段**：标题（Enter 提交）、备注（2 行，卡片上灰字最多 2 行）、优先级（高/中/低）、今日焦点（开关）、状态（待办/进行中/将来，带一行语义说明）、日期（将来时禁用）、重复、提醒时间、标签（逗号分隔）。
- **状态语义（用户可见文案）**：
  - 待办：有日期，到期进今日，过期进逾期。
  - 进行中：不管日期天天留在今日顶部，直到改回待办或完成。
  - 将来：无日期、不提醒，收在页尾收件箱。
- **焦点规则**：只在「由关变开」时绑今天；编辑已有焦点任务保留原 `focusDate`；关闭写 null。
- **标签解析**：`/[,，]/` split + trim + 去空。
- **备注键**：有内容才挂 `note`；编辑时清空显式写 `null`（避免 undefined 在两端的语义分叉）。
- **提交**：`isPending` 禁用；成功 toast「已添加/已保存」并关闭。
- **⚠️ 已知缺陷**：编辑**已完成**任务时，`status` 回填为 `'todo'`（done 不在三态里），保存会把任务重新打开并清空 `completedAt`（§8 P1）。

#### F-TASK-03 重复任务

- **模型**：`TaskRepeat { freq: daily|weekly|monthly, interval≥1, weekdays?[], anchor: 'due'|'complete' }`（不用 RRULE）。
- **规则**（`src/lib/repeat.ts`）：
  - `anchor='complete'`：base = max(完成日本地日期, 计划日)；提前完成不早于计划日。
  - weekly 多选：base 之后最近的选中星期；`interval>1` 时 UI 限单选、整周步进。
  - monthly：月末钳制（1/31 → 2/28）。
  - **跳过不补**（Apple Reminders 式）：推进结果 < today 时继续推进到首个 ≥ today 的槽位。
- **完成**：`completionPatch` 对重复任务**不写 status='done'**，而是写 `completedAt` + 推进 `dueDate`；撤销用闭包里的原值。
- **重开（撤销完成）**：`reopenPatch` 把 dueDate 退回上一槽位（anchor='complete' 且晚完成时是近似值）。
- **对话框**：预设 不重复/每天/每个工作日/每周/每月/自定义；自定义可设每 N 天/周/月 + 按计划日/按完成日；weekly 显示星期 chips。
- **徽章**：`repeatLabel`（每天 / 每 3 天 / 每个工作日 / 每周·一/三 / 每 2 周·周三 / 每月 15 日）。
- **优化注意**：重复任务没有「结束条件（次数/日期）」；月任务在 29-31 日会钳制，长期看日期会漂移。

#### F-TASK-04 任务卡

- **文件**：`src/modules/overview/task-item.tsx`、`task-card.ts`。
- **结构**：左侧 3px 状态轨（高=destructive/中=priority/低=无）→ 拖拽把手（仅今日区）→ 方形勾选（完成态悬停变 ↺）→ 焦点星 + 优先级圆点 + 标题（完整换行）+ 备注（最多 2 行）→ 元信息行（到期徽章/时间/重复/焦点/进行中/清单 x/y/标签/完成时刻）→ 操作簇（顺延/星标/展开清单/改期菜单/删除）。
- **标识**：底色中性，紧急度靠轨道；焦点是金色边框 + 金星；完成态轨道保留但 40% 透明（颜色褪去而非消失）。
- **清单**：行内展开，可勾选/删除/回车新增；编辑入口只在这里（对话框不做清单）；全部勾完不自动完成父任务。
- **删除**：无二次确认（移动端长列表误触风险，见 §8 P2）。
- **改期菜单**：今天/明天/后天/下周一/自选日期；重复任务多一项「跳过一次」。

#### F-TASK-05 完成与撤销

- **入口**：勾选框、今日概览弹窗、提醒中心「完成」。
- **规则**：统一 `completionPatch(t, today)`（普通 → status done；重复 → completedAt+dueDate 推进）。
- **反馈**：toast「已完成」，描述带「下次：YYYY-MM-DD」或「已划线保留」，5 秒内可撤销；完成时自动展开已完成区。
- **撤销**：普通任务恢复原 status；重复任务恢复原 completedAt/dueDate。
- **已完成区**：划线 + 灰色 + 完成时刻；点方块可撤销；删除可删。

#### F-TASK-06 逾期治理

- **近 7 天**：红框卡片 + 行内「顺延到今天」；区块右上「全部顺延到今天」（`window.confirm` + 批量 patch + 5 秒撤销，撤销按 id 还原原 dueDate）。
- **更早**：折叠区，逐条可操作，另有「清理历史待办（全部标记完成）」（confirm + 批量 done + 撤销回 todo）。
- **注意**：批量操作是 N 个独立 mutation，不是事务；中途失败会部分成功（toast 只报总数）。

#### F-TASK-07 将来收件箱

- **入口**：`status==='someday'`，全站唯一可见处是今日待办页尾折叠区。
- **操作**：移到今天（status todo + dueDate 今天）、⋯ 菜单（选日期转正式待办 / 编辑 / 删除）。
- **注意**：将来任务不设日期、不提醒；切回待办会恢复切走前的日期（`savedDate`）。

#### F-TASK-08 拖拽排序

- **文件**：`src/lib/drag-sort.ts`、今日区容器。
- **行为**：Pointer Events；把手 `touch-action:none` + 拦截 `contextmenu`（iOS 放大镜）；拖动时 `overscroll-contain`；落点写「上/下邻 sort 中点」（`midpointSort`），只更新被拖一项。
- **FLIP**：`useLayoutEffect` 调 `flipIn(root)`，同列表重排/跨区块滑移；reduced-motion 时直接落位。
- **边界**：只有今日区可拖；焦点/doing 分组由比较器保持，拖拽不会改变分组语义（拖到顶部也不会自动变焦点）。

#### F-TASK-09 筛选

- **标签 chips**：全部 + 所有任务去重标签；作用域是今日/逾期/将来三个区块（同时过滤）。
- **搜索**：标题不区分大小写 contains；与标签 AND；无结果显示「没有匹配的任务」。
- **注意**：筛选状态在页面内，切走即失；标签来源于全部任务（含已完成/将来）。

#### F-TASK-10 今日概览弹窗里的待办操作

- 见 F-SHELL-09；**它不走 completionPatch**，是重复任务一致性的缺口。

### 4.4 学习与科研（F-STUDY）

#### F-STUDY-01 考试列表

- **文件**：`src/modules/study/study-manager.tsx`、`exam-dialog.tsx`、`api.ts`。
- **行为**：Tabs（考试/学习目标）；科目 chips（去重、可取消）；按日期升序；卡片显示倒计时天数（≤7 天红色紧急；已过显示「已过」）、日期、科目、备注（>40 字可展开/收起）；编辑/删除。
- **空态**：无考试或该科目无考试，带「添加考试」。
- **注意**：`daysUntil` 用 `Math.ceil`，当天是 0（卡片显示「0 天后」而不是「今天」，小文案瑕疵）。

#### F-STUDY-02 考试对话框

- 字段：名称*、日期*、科目、考试时间（填了才有考前 1 小时提醒）、备注；提交防连击。
- 提醒节点由服务端生成：考前 3 天/1 天 08:00（上海），考前 1 小时（需 examTime）；已过时刻不生成。

#### F-STUDY-03 学习目标

- **文件**：`src/modules/study/goal-manager.tsx`、`goals-api.ts`。
- **展示**：目标名、进度条（25/50/75 刻度）、`progress/target`（点数字可精确输入）、截止速率（剩 N 天，每天约 ceil(remain/d)；今天截止/已逾期）、备注、完成时间。
- **推进**：±1、+5/+10（target≥10 才显示）、精确设置；clamp 到 [0,target]。
- **反馈**：跨 25/50/75 → `celebrate(single)` + toast；到 100 → `grand` + 「达成目标，去归档吧」；**不自动归档**，需点「进度已满，归档完成」。
- **归档/恢复**：status done ↔ active；`completedAt` 由仓储维护；归档后卡片 60% 透明、划线。
- **拆解到今日待办**：按合理步长生成一条今日任务（target≥10 步长 5，否则 1），只推进剩余量；每目标每次会话只允许一次（`brokenRef`）；创建中禁用。
- **排序**：active 在前，同状态按进度比例降序。

#### F-STUDY-04 目标对话框

- 字段：名称*、目标量（≥1，默认 100）、截止日、备注；`isPending` 防连击（历史线上「一设变两个」）。

#### F-STUDY-05 番茄钟

- **文件**：`src/modules/study/pomodoro.tsx`、`src/lib/pomodoro.ts`。
- **阶段**：专注 / 短休息 5 / 长休息 15；每 4 个专注一次长休息（`breakForFocusIndex`）。
- **时长**：15–60 分钟，5 分钟步进；运行中调整会延长本节剩余（`totalSeconds` 改，`elapsed` 不动）。
- **计时**：`startedAt` + `elapsed` 推导剩余，切后台不漂移；每秒 tick 只重渲染；标题显示剩余时间（停止恢复「个人工作台」）。
- **持久化**：`wb:pomodoro-state`（phase/focusIndex/totalSeconds/elapsed/startedAt/running/note）；`wb:pomodoro-settings`（focusMinutes）；运行中挂载超过 12 小时视为陈旧重置。
- **完成**：专注结束 → 记录 `FocusSession`（分钟=round(实际/60)，最少 1；note 可选）→ 三连音（Web Audio，失败静默）→ 撒花 → toast；进入休息。休息结束 → 回专注，保留已填主题。
- **今日统计**：今日番茄数 + 总分钟 + 最近 8 条（时间/分钟/主题）。
- **注意**：页面关闭期间计时结束，要等下次打开才结算；超过 12 小时会丢这条记录（设计取舍）。

---

### 4.5 资讯与资料（F-NEWS）

#### F-NEWS-01 今日热点页框架

- **文件**：`src/modules/news/hot.tsx`。
- **Tab**：日报 / 热榜。初始 `tab=null`，等日报查询落地后决定：有日报 → 日报，否则 → 热榜（避免迁移 015 未执行时默认打开空页）。
- **数据**：日报 `useDailyReports()`（30 条）；热榜 `loadHot()`（localStorage 缓存 + `/api/hot`）。
- **加载**：日报查询未完成时整页 Skeleton（防止「先日报后热榜」闪跳）。
- **文案**：日报 Tab「AI 整理的每日报告 · 每天早上自动生成」；热榜「更新于 HH:mm · 每 30 分钟自动刷新」。

#### F-NEWS-02 AI 日报

- **文件**：`src/modules/news/daily-digest.tsx`、`digest-view.ts`、`api.ts`（`useDailyReports` / `useRebuildDigest`）、服务端 `api/digest.ts`。
- **展示**：日期 chips（>1 条时）、标题、总述、分节（分类 → 事件：标题/要点/来源外链）、页脚模型名 + 重新生成。
- **复制**：`reportToMarkdown` → 剪贴板（失败退回 `execCommand`）→ 按钮短暂变「已复制」。
- **重新生成**：仅云端模式；POST `/api/build-digest`（JWT）；返回 `built/items/error`，成功后前缀失效 `['dailyReports']`。
- **空态分三种**：
  1. 表不存在（PGRST205/42P01 或错误文案含 `wb_daily_reports`）→「日报功能还没启用」+ 去看热榜。
  2. 云端但今天没有 →「还没有日报」+「立即生成」（需要当天已有 enrich 记录）。
  3. 本地模式 → 说明需要云端模式。
- **服务端管线**（详见 §5.3）：`digest-enrich` 抓取 → 落 `wb_hot_items` → 逐条 AI 摘要/分类/打分 → 聚簇成 `wb_hot_events`；`digest-build` 按事件编排日报（分类与排序在代码里做，模型只写文字）。
- **注意**：`limit` 必须进 queryKey（首页卡 1 条、日报页 30 条）；model/overview/points 由模型写，分类与条数由代码控制。

#### F-NEWS-03 热榜

- **文件**：`src/lib/hot.ts`、`src/modules/news/hot.tsx`、`api/hot.ts`。
- **数据**：`/api/hot?sources=...` 并发抓 25+ 源，单源 8s 超时/8 条，总量 60 条；失败源静默跳过；CDN `s-maxage=600`。
- **前端缓存**：`wb:hot-cache-v2`，TTL 30 分钟；过期先返回缓存并标 `stale`，页面静默后台刷新一次（`staleRetriedRef` 防循环）。
- **降级**：代理失败 → 前端直连 GitHub/HN/V2EX 三源；再失败 → 缓存；再失败 → 空 + toast。
- **交互**：刷新按钮；搜索标题；主题 chips（来自订阅 topics，AND 过滤）；点击条目外链 + 标记已读（`wb:hot-read`，最多 500 条，已读降透明度）；「存速记」（标题 + 换行 + 链接）。
- **空态**：未订阅任何源 →「暂无热点数据」；有源但无匹配 →「去管理源调整」。
- **⚠️ 文案漂移**：「每 30 分钟自动刷新」实际没有定时器，只有挂载时加载、手动刷新、缓存过期后的静默重试（§8 P2）。

#### F-NEWS-04 热点源管理

- **文件**：`src/modules/news/hot-settings-dialog.tsx`。
- **语义**：`sourceIds=[]` = **订阅全部**（不是「一个都不订」）；勾选任意源后变成白名单。
- **UI**：按 category（技术/学术/社区）分组；全选/取消全选；实验源标「实验」；主题关键词 chips（回车添加、X 删除）。
- **保存**：`repository.saveSubscriptions`（云端 upsert 单行），保存后立即用新源刷新热榜。
- **注意**：全选 ↔ 空数组的语义反直觉；若改成显式「全部」需要同时迁移数据与 UI。

#### F-NEWS-05 灵感速记列表

- **文件**：`src/modules/news/notes.tsx`、`news-view.ts`。
- **展示**：按置顶 → `updatedAt` 倒序；标签 Badge、更新时间、📌；卡片正文最多 4 行；点击卡片进入编辑。
- **搜索**：content 不区分大小写 contains；标签 chips（AND）；无匹配提示。
- **操作**：置顶/取消、归档、删除（**无二次确认**）；归档箱折叠区（恢复/删除）。
- **新建**：`?new=1` 打开内联编辑器；「完成」清掉 query。
- **注意**：归档箱用同 queryKey 再查一次全量（共享缓存，不发新请求）。

#### F-NEWS-06 速记编辑器

- **文件**：`src/modules/news/note-editor.tsx`、`news-view.ts`（`renderMarkdown`）。
- **自动保存**：内容/标签变化后 **1.2s** 防抖；有内容才保存；显示「已保存 HH:mm」。
- **预览**：Markdown 子集（标题/粗斜体/行内代码/代码块/列表/链接/裸链/段落），**先整体 HTML 转义再转换**，链接仅 http(s)。
- **标签**：逗号/顿号/空白分隔；新建时**只写入第一个标签**（`tag: tags[0]`），后续编辑才写全量。
- **⚠️ 高风险缺陷（需复现）**：新建态 `note=null`，自动保存每次都走 `create`，且创建成功后没有把新 id 回填给编辑器；用户停顿一次就建一条，继续输入再停顿又建一条（§8 P1）。

#### F-NEWS-07 资料库列表

- **文件**：`src/modules/news/papers.tsx`、`cite.ts`。
- **筛选**：文件夹（左树/移动 Sheet）、状态（全部/想读/在读/读完）、类型（全部/论文/文案）、评分门槛（全部/≥3/≥4/≥5，未评分只在「全部」出现）、搜索（标题/作者/关键词/内容）。
- **排序**：默认（仓储顺序，created_at desc）、评分高→低（null 沉底）、标题 A→Z（`zh-Hans-CN`）。
- **行内操作**：状态下拉（直接 update，`finishedAt` 跟随）、复制引用、删除（confirm）。
- **注意**：新增「添加论文/文案」时默认文件夹取当前筛选（全部/未分类则 null）。

#### F-NEWS-08 文件夹树

- **文件**：`src/modules/news/folder-tree.tsx`、`src/lib/db/folder-tree.ts`（`assertNoCycle`）。
- **固定入口**：全部资料 / 未分类；多级递归树、折叠、缩进 12px/层。
- **操作**：新建根/子文件夹、重命名、删除（confirm；资料移到未分类，子文件夹一并删）。
- **移动**：仓储有 `moveFolder` 与防环校验，但**UI 没有拖动/移动到其他文件夹的入口**（只能新建时指定父级）。
- **注意**：重命名/新建用 Dialog（替换 `window.prompt`）；`papers.tsx` 顶部「新建文件夹」仍用 `window.prompt`（不一致）。

#### F-NEWS-09 添加论文

- **文件**：`src/modules/news/add-paper.tsx`、`src/lib/arxiv.ts`。
- **三种方式**：
  1. arXiv 搜索：关键词 → 结果列表（标题/作者/日期/原文外链/收藏）；已在库（同 `arxivId`）显示「已收藏」禁用。
  2. 手动录入：标题*、作者、URL、文件夹、标签。
  3. DOI 直达：`api.crossref.org/works/<doi>` 解析标题/作者/链接，可改后保存；失败可手填。
- **注意**：文件夹下拉只列**顶层**文件夹（详情页是拍平带缩进的全量），层级深时体验不一致（§8 P2）。

#### F-NEWS-10 添加文案笔记

- **文件**：`src/modules/news/add-note.tsx`、`src/lib/parse-import.ts`。
- **粘贴**：标题（空则「未命名」）、来源链接、标签、总结（AI JSON 或自由文本）、全文*。
- **上传**：`.json` / `.md`，解析后自动填表；JSON 需含 `content`（title/source_url/platform/summary/keywords）；Markdown 需 frontmatter + 正文。
- **保存**：`type='note'`，`status='want'`，content 必填；作者留空。
- **注意**：文件选择按钮在 `<label>` 内，靠 label 触发 input；键盘可达性一般。

#### F-NEWS-11 资料详情

- **文件**：`src/modules/news/paper-detail.tsx`。
- **形式**：右侧 Sheet（移动全宽）。
- **可编辑**：标题、作者、评分（1-5/未评分）、链接、状态、文件夹（全量拍平带缩进）、标签、笔记。
- **只读**：AI 总结（JSON 则渲染「拟标题/核心观点/金句/结构拆解」，否则 pre）、全文（max-h 滚动）。
- **操作**：复制引用、复制 BibTeX、删除（confirm）、保存（标题必填 + isPending）。
- **注意**：详情编辑不会刷新列表中的 `paper` 对象，关闭后列表靠 invalidate 重取。

#### F-NEWS-12 引用与 BibTeX

- **文件**：`src/modules/news/cite.ts`。
- **人读引用**：`作者 (年份). 标题. 来源. 链接`，各段缺失自动省略。
- **BibTeX**：`@misc{key, title/author/year/url}`，字段缺失整行省略。
- **key**：首作者姓氏（中文常见姓氏→拼音，西文取末词小写）+ 年份 + 标题首词；全缺兜底 `item`。
- **注意**：年份取 `createdAt` 的 4 位数字，不是发表年；中文姓氏映射是硬编码子集，未命中保留原字。

#### F-NEWS-13 资料库新手指引

- **文件**：`src/modules/news/guide-dialog.tsx`。
- **内容**：资料库是什么、论文三种导入、文案两种导入、与「视频文案提取器」的推荐工作流、组织管理、常见问题。
- **入口**：标题栏 ❓ 按钮 → 右侧 Sheet。

### 4.6 健康（F-HEALTH）

#### F-HEALTH-01 今日打卡

- **文件**：`src/modules/health/health.tsx`、`derive.ts`、`api.ts`。
- **Tabs**：今日打卡 / 习惯管理 / 身体记录。
- **打卡**：只列 `active` 且**未被成长行动绑定**的习惯；显示 icon/名称/`done/target`；点圆形按钮：未达标 +1；达标后每次点 -1（逐次减到 0，防误触不清零）；每次写 `setHabitLog`（upsert）。
- **归属**：被行动绑定的习惯显示为底部链接「N 项行动在『自我提升』中打卡」，不在此处打卡。
- **空态**：无任何习惯 →「还没有习惯」+ 去习惯管理。

#### F-HEALTH-02 习惯管理

- **文件**：`src/modules/health/habit-manager.tsx`。
- **创建**：输入名称（Enter 或按钮，防连击）+ 预设 chips（早起/运动/背单词/不熬夜）。
- **展示**：自有习惯（每日 targetPerDay、删除）；行动绑定习惯只读列表 + 去成长页链接。
- **注意**：没有编辑名称/目标次数/图标/颜色的入口（仓储支持 updateHabit，UI 未暴露）；默认 icon ✓、颜色鼠尾草绿、target 1。

#### F-HEALTH-03 身体记录

- **UI**：类型 pills（体重 kg / 睡眠 h / 运动 min）+ 数值输入 + 记录（`isPending` 禁用）；列表按日期倒序，最多 20 条，带删除。
- **语义**：体重/睡眠**一天一个数**（再记 = 更新当日值，并清理历史重复行）；运动一天可多条。
- **校验**：数值 > 0；睡眠 input max=24；体重 step 0.1。
- **注意**：记录日期固定今天，不能补记历史。

#### F-HEALTH-04 热力图与连击

- **文件**：`src/lib/heatmap.ts`、`src/modules/health/cards.tsx`、`src/components/mini-heatmap.tsx`。
- **热力**：最近 N 天（首页 Bento 卡 28、移动首页 MiniHeatmap 14、行动详情 14）每天打卡条数封顶 3 → 4 档颜色。
- **连击**：`streakFromLogDates` 从**今天**往前连续计数；今天没打卡就断（= 0）。
- **注意**：连击是「所有习惯的任一打卡」而非单习惯；行动详情里是单习惯。今天未打卡时首页显示 0，用户可能觉得「昨天还连着」——见 §8 P2。

#### F-HEALTH-05 打卡归属单一入口

- **规则**：`GrowthAction.habitId` 绑定的习惯（无论行动 active/paused/done）只在「自我提升」打卡；健康模块三入口（今日打卡/快速捕获/习惯管理）统一用 `growthBoundHabitIds` 过滤。
- **原因**：同一习惯两处打卡会让连击/统计各算一套。
- **注意**：删除习惯时仓储会把行动的 `habitId` 置 null，行动变成「未绑定打卡」，且 UI 无重新绑定入口（§8 P2）。

### 4.7 复盘（F-REVIEW）

#### F-REVIEW-01 心情与评分

- 心情 5 档（很差/较差/一般/不错/很棒，默认 3）；评分 1–10 可留空，再点同一数字取消。
- 存 `mood` / `score`（score null 合法）。

#### F-REVIEW-02 六个分区表单

- **文件**：`src/modules/review/review.tsx`（`FormSection`）、`review-utils.ts`。
- **分区**：今日成就、今日反思、今日感恩、今日收获、今日总结（默认展开）、明日计划（默认展开）。
- **折叠规则**：`manual ?? (defaultOpen || 有内容)`——编辑旧复盘时已写过的分区自动展开；手动开合按「日期:分区」存 `wb-review-open:*`，换日期不串味。
- **切换日期**：换 `activeDate` 时用 `key={date:section}` 重挂载，重置本地手动态。
- **回填**：只在「该日期复盘首次就绪」时回填（`lastSynced` ref），避免 refetch 覆盖正在输入的内容。

#### F-REVIEW-03 保存

- `useSaveReview` → `repository.upsertReview(activeDate, patch)`；云端按 `(user_id,review_date)` upsert。
- 成功后 toast（今天/历史日期不同文案）；`isPending` 禁用按钮。
- 注意：没有自动保存，离开页面会丢未保存内容（与速记相反）。

#### F-REVIEW-04 明日待办两段式

- **解析**：`parsePlan` 按换行/；/;/，拆分 → 去行首 `- * + •`、`1. / 1) / 1、`、`#` → 去空/长度≤1/纯标点（`\p{L}|\p{N}`）。
- **去重**：`existingTitles(tasks, 明天)` 只跳过「同一天已存在同标题」；**批内重复保留**（一天两次「背单词」合法）。
- **第一段**：点「生成明日待办（N 条）」→ 预览卡片，每条可改文字、可取消勾选，默认全选。
- **第二段**：确认 → 逐条 `createTask({dueDate: 明天})` → `Promise.all`；结果卡片 `role=status` 列出生成条目 + 跳过数 + 「去待办查看」链接 + 说明「明天到期，明日起出现在今日待办」。
- **失败**：toast「生成明日待办失败，请重试」；已成功的条目会保留（非事务）。
- **注意**：`parsePlan` 会按逗号拆，所以「读书 30 分钟，跑步」会被拆成两条——预览是安全网。

#### F-REVIEW-05 历史复盘

- 历史列表按日期倒序；显示日期、心情、评分、总结/成就/反思摘要（最多 2 行）。
- 点击 → 切回「今日复盘」Tab 并把 `activeDate` 设为该日期；顶部出现「正在编辑 YYYY-MM-DD 的复盘」+「回到今天」。
- **⚠️ 口径问题**：右栏汇总（完成任务/专注/打卡/体重）永远用 `todayStr()` 计算，编辑历史日期时看到的仍是**今天**的数据（§8 P2）。

#### F-REVIEW-06 汇总、周回顾与趋势

- **四格**：完成任务（当日 + 累计）、专注时长、打卡次数、体重（是否今天）。
- **本周回顾**（近 7 天）：完成任务/专注分钟/打卡次数/复盘篇数/平均心情/平均评分。
- **趋势**：最近 14 条复盘，心情（accent）与评分（primary）双折线，值归一到 0–1；score 留空按 5。
- **考试提醒**：底部列出最近 3 场考试。
- **连续复盘**：`streakFromLogDates(reviewDates)`，与打卡同一算法（今天没写就断）。

### 4.8 成长（F-GROWTH）

#### F-GROWTH-01 十项行动与一键导入

- **文件**：`src/modules/growth/presets.ts`、`api.ts`、`growth.tsx`。
- **预置**：10 条（睡眠/学业×2/表达×2/职业/心理/财务/决策/精力），每条含 title/emoji/category/why/steps/targets/verify，来自知识库《自我提升十项行动清单》。
- **导入**：`buildImportPlan(existing)` 按 `no` 跳过已存在；逐条 `createHabit({name=title, icon=emoji, targetPerDay:1})` + `createGrowthAction({...p, habitId})`；失败时删除本次已建习惯（回滚），不留半截数据。
- **空态**：无行动时显示导入卡片（📈 + 说明 + 按钮）。
- **注意**：若用户删了某条行动但保留习惯，再次导入会**新建一个同名习惯**（旧习惯变孤儿）——§8 P2。

#### F-GROWTH-02 今日行动打卡

- **列表**：`status='active'` 按 `no` 升序；显示 emoji/标题/「行动 N · 分类」/单习惯连续天数/打卡按钮。
- **打卡**：未打卡 → count 1；已打卡 → 0（取消）；勾选动画 `check-pop`。
- **反馈**：单条 → `celebrate(single)` + toast；当天全部完成 → `grand` +「今日行动全部完成 🎉 连击 N 天」；连击命中 7/30/100 → 加强 toast。
- **注意**：打卡写的是健康习惯日志（`setHabitLog`），所以成长与健康共享同一份数据；没有绑定习惯的行动显示「未绑定打卡」，不能打卡。

#### F-GROWTH-03 行动计划列表

- **筛选**：全部/进行中/已暂停/已完成 + 数量。
- **卡片**：emoji/标题/状态 Badge/why（1 行）/行动编号/本周 7 格/本周 N/7/连续天数/今日 ✓ 或未打卡。
- **详情**：点击卡片打开 ActionDetail Sheet。

#### F-GROWTH-04 行动详情

- **文件**：`src/modules/growth/action-detail.tsx`。
- **内容**：标题/编号/分类/连续天数；状态 Badge（进行中/暂停/完成，点击切换）；14 天热力 + 今日打卡按钮；「为什么做」；「怎么做」步骤清单（可勾选，存 `localStorage growth-steps-<id>`）；量化目标列表；验证方式；删除（confirm，删行动但保留习惯与打卡记录）。
- **注意**：步骤勾选**只在本地、不进备份/云端**，换设备会丢（§8 P2）；状态切换没有确认，误点「完成」可再点回。

#### F-GROWTH-05 周复盘 Tab

- **内容**：本周复盘条数（近 7 天）；周日文案（「今天周日，花 15 分钟…」）与非周日文案；「去写复盘」按钮；「复盘时看什么」清单（行动 1 睡眠/行动 8 表达/焦虑清单/下周微调）。
- **注意**：这只是一个引导页，不是独立的周复盘数据结构——周复盘仍写在每日复盘里。

---

### 4.9 提醒（F-REM）

#### F-REM-01 生成规则

- **文件**：`api/reminders.ts`（`computeReminders`）。
- **任务**：仅当 `status !== 'done'` 且 `dueDate` 与 `dueTime` 都存在 → 一个 `due` 节点，时刻 = dueDate+dueTime 按 Asia/Shanghai 固定 +8 换算成 UTC。无时区库，无夏令时。
- **考试**：`examDate >= 今天（上海）`；考前 3 天/1 天 08:00；有 `examTime` 才生成考前 1 小时节点。只生成未来节点（临近考试才建不会补发过去节点）。
- **目标**：`status !== 'done'` 且有 deadline；截止前 3 天 08:00、截止当天 08:00；只生成未来节点。
- **字段**：ref_type/ref_id/kind/scheduled_at/title；kind 枚举 6 种（due/exam-3d/exam-1d/exam-1h/goal-3d/goal-due），迁移 009 有 CHECK。

#### F-REM-02 存活与三向对齐

- **文件**：`liveRefKeys`、`planReminders`、`runCheck`。
- **存活**：
  - task：未完成 + dueDate + dueTime + 合法时间（与生成条件完全一致；清空提醒时间 = 行消失、不再推送）。
  - exam：`examDate >= 今天`（已发出的节点记录保留到考试结束）。
  - goal：未归档 + 有 deadline。
- **三向对齐**：
  - create：key 不存在。
  - update：同 key 但 `scheduled_at` 时间戳不同（必须按时间比，不能比字符串：PostgREST 返回 +00:00，代码生成 .000Z）；新时刻在未来则清空 sent_at 重新计时。
  - remove：ref 不在 live 集合（任务完成/删除、考试已过、目标归档/删除）。
- **补发窗口**：新建行的 scheduled_at 已过期但 ≤12 小时 → 保留 sent_at=null，紧接着发送并标「（补发）」；>12 小时视为历史直接标已发送。
- **并发**：create 用 upsert(onConflict:'user_id,ref_type,ref_id,kind', ignoreDuplicates:true)，cron/check 同时跑不会撞唯一键。

#### F-REM-03 投影（唯一数据源）

- **文件**：`src/modules/reminders/format.ts`（`effectiveRows`）、`api.ts`（`useReminderView`）。
- **规则**：
  - task 行：任务不存在 / 今天已完成（`isDoneForToday`，含重复任务当天完成）/ dueDate 或 dueTime 为空 → 不出现；出现时 scheduledAt 用任务现算时刻（改期立刻生效，不等服务端扫描）。
  - exam/goal 行：原样透传；引用对象缺失时保留行并给「（已删除）」降级文案。
  - `sources.tasks === undefined` 表示任务还没加载完，首帧不过滤（避免闪空）。
- **消费者**：提醒中心列表、侧边栏角标、首页横幅、前台通知，全部只读它。不许再各算一套（v1.31 的「角标 3 条、列表 2 条」就是各算一套）。
- **状态**：upcoming（未到点）/ due（到点但引用日期 = 今天）/ overdue（引用日期 < 今天）。逾期是日期级，与待办页同一把尺。
- **计数**：`countDue` 只看 scheduledAt <= now，不看 sentAt、不看已读（没有已读状态）。

#### F-REM-04 提醒中心

- **文件**：`src/modules/reminders/reminders-center.tsx`。
- **头部**：「上次扫描：N 分钟前」/「刚刚」，数据来自 `useReminderStore.scannedAt`（每次 check-reminders 响应写入）。
- **筛选 chips**：全部 / 已逾期 / 待处理 / 即将到来（可点，再点取消；aria-pressed）。
- **分组**：已逾期（红）→ 待处理（主色）→ 即将到来（默认）；组内按 scheduledAt 升序（拖最久/最早在前）。
- **行**：图标、文案（`reminderFacts`）、kind 标签、计划时刻、sentAt ? 已通知 : 待通知/未送达、逾期标记；任务行有「顺延」（仅逾期）+「完成」；「查看」跳 /tasks 或 /study；引用缺失时不显示查看。
- **完成**：`completionPatch`（重复任务不终结序列）+ 5 秒撤销；成功后才 toast（避免失败也报成功）。
- **顺延**：dueDate → 今天，撤销还原原值。
- **空态**：「暂无提醒」说明设置路径；筛选无结果单独文案。

#### F-REM-05 首页横幅与前台通知

- **文件**：`src/modules/reminders/reminder-banner.tsx`、`notify-log.ts`。
- **横幅**：dueCount=0 不渲染；否则取最早到期的一条文案 + 总数徽章；点击进提醒中心。
- **前台通知**：Notification.permission === 'granted' 时，对「未 sentAt 且已到点」的行，用 localStorage 账本 wb-notified 去重（键 = 提醒 id + 计划时刻，TTL 7 天）；单条给正文，多条报「N 条提醒待处理（最紧急：…）」；走 registration.showNotification，失败静默。
- **注意**：去重在「认领」时就写账本，若后续 showNotification 失败不会重试（§8 P2）。

#### F-REM-06 通道与按通道记账

- **文件**：`api/reminders.ts`（`sendDue`）。
- **通道**：
  1. Web Push：多设备只算一个通道，一台成功即视为该通道送达；410/404 删除过期订阅。
  2. Server酱³（SC3）：SendKey 形如 sctp<uid>t... → https://<uid>.push.ft07.com/send/<key>.send；表单 urlencoded title/desp；5s 超时。非 sctp 的 key 不猜端点，直接记错误「不是 SC3 格式」。记账键仍是 serverchan（换端点不换通道 id，否则同一条会发两次）。
  3. Telegram：服务端直发 sendMessage（HTML 转义正文、8s 超时），不受大陆网络限制。
- **记账**：sent_channels = {webpush?, serverchan?, telegram?, errors?}；已成功的不重发，失败的下一轮补发；所有「已配置」通道都成功才写 sent_at，否则保留 NULL。
- **语义警告**：SC3 code:0 只代表服务器受理，不代表手机收到；data.error 非 SUCCESS 时只打 console.warn（v1.34.1 测试发送会把原始响应回显到设置页）。

#### F-REM-07 测试发送与 Telegram 校验

- **文件**：`src/modules/me/notifications-section.tsx`、`api/reminders.ts`（`sendTest` / `telegram-test`）。
- **测试发送** POST /api/test-notify：逐通道返回 {channel, ok, error?, detail?}；Web Push 聚合为一条；SC3 成功也回传前 200 字原文（pushid/readkey/data.error）；UI 把失败原因与 SC3 原文摊在按钮下方。
- **Telegram** POST /api/telegram-test：先 getMe 校验 Token，再真发一条；返回 {ok, step: token|chat|input, error, botUsername}；通过才落库，错误不污染数据库。
- **保存配置**：`saveChannelConfigs` 是整行覆盖，必须同时传 serverchanKey/telegramBotToken/telegramChatId；漏传即清空另一通道。
- **校验**：SC3 key 前端用 `isSc3Key`（/^sctp\d+t/i）拦截，格式不对不保存。
- **平台提示**：iOS 需先添加到主屏幕；安卓 Chrome 的 FCM 在大陆不可用，引导用 SC3/Telegram。

#### F-REM-08 触发三层与可见性

| 层 | 谁 | 精度 | 说明 |
|---|---|---|---|
| ① 页面开着 | useReminderTimer | 准点 | 在下一条提醒时刻 invalidate ['reminders']，服务端顺手生成+发送 |
| ② Supabase pg_cron | */5 * * * * → /api/cron-notify | ~5 分钟 | 主触发器；Bearer CRON_SECRET；service role |
| ③ GitHub Actions | 每 20 分钟 | 实测中位 199 分钟 | 兜底，不可依赖 |

- **入口鉴权**：cron/test/digest 用 CRON_SECRET（timingSafeEqual）；check/test/telegram/build 用用户 JWT（RLS）。
- **可观测性**：/api/check-reminders 返回 scannedAt；设置页/提醒中心显示新鲜度；失败原因写 errors 与服务端日志。

---

### 4.10 我的项目（F-PROJ）

#### F-PROJ-01 列表

- **文件**：`src/modules/projects/projects.tsx`、`api.ts`、`shared.ts`。
- **数据**：GET /api/projects → {updatedAt, source, projects[]}；失败回落 /projects-status.json（离线快照，source='fallback'）；staleTime 10 分钟。
- **排序**：phase（进行中 → 已完成 → 已归档 → 暂停）→ updatedAt 倒序。
- **卡片**：emoji、名称、phase 徽章、更新日期、summary（2 行）、stack badges、aliases；点击进详情（encodeURIComponent(dir)）。
- **降级**：fallback 时标题下方提示「当前为离线快照，可能不是最新」。
- **注意**：列表本身不鉴权（详情才鉴权），且 CDN 公共缓存 10 分钟；见 §8 安全审查项。

#### F-PROJ-02 刷新回音

- **行为**：点刷新 → refetch() → 比较接口返回的 updatedAt（不是客户端 dataUpdatedAt）：
  - fallback →「网络不可用，当前为离线快照」
  - updatedAt 变了 →「已更新 · N 个项目（生成于 HH:mm）」
  - 没变 →「服务端未更新 · 生成于 HH:mm（CDN 最长缓存 10 分钟）」
  - 无 updatedAt →「服务端未返回生成时间 · N 个项目」
- **无障碍**：常驻 p role=status aria-live=polite（不是 toast，信息要能停留）。
- **注意**：服务端每次成功生成都会写新的 updatedAt，但 CDN 可能给 10 分钟内的旧副本，所以「没变」是正常的。

#### F-PROJ-03 详情

- **文件**：`src/modules/projects/project-detail.tsx`、`api/projects.ts`。
- **鉴权**：/api/projects?entry=detail&dir=... 需 JWT；响应 Cache-Control: private, s-maxage=600。
- **内容**：优先 html（GitHub Markdown API 渲染并消毒）；渲染失败回退 markdown（pre）；剥掉 frontmatter（BOM 与 ---）。
- **元信息**：列表缓存里的 info（emoji/name/phase/updatedAt/summary/stack/aliases）；直链进入未命中时用 dir 兜底。
- **目录文档**：files[] 列出目录内文件，点击 GitHub blob。
- **错误态**：401「详情需登录后查看」；503「离线快照不含详情内容」；其他「加载失败」+ 重试/GitHub。
- **底部**：在 GitHub 打开、编辑门户口（github.dev）；说明「修改在知识库完成，最多 10 分钟同步」。

#### F-PROJ-04 回到顶部

- 监听 closest('main') 的 scroll，scrollTop > 480 显示；scrollTo({top:0, behavior: reduce ? 'auto' : 'smooth'})；按钮 fixed bottom-36 right-4 md:bottom-8 md:right-8。
- **注意**：滚动容器是 main，不是 window；换布局要同步改。

#### F-PROJ-05 门户口解析

- **frontmatter 子集**：project/phase/date|updated 标量 + aliases/stack 数组（缩进 -）。
- **标题 emoji**：^#\s*(\p{Extended_Pictographic})，缺省 🚪。
- **摘要**：## 项目简介 首段，跳过引用块，去 Markdown 链接，截 120 字（避免截断链接残片）。
- **dir**：知识库目录名（≠ frontmatter 的 project 名），详情按 dir 寻址。

---

### 4.11 我的（F-ME）

#### F-ME-01 身份卡

- **文件**：`src/modules/me/settings.tsx`。
- **展示**：头像（首字母 + 颜色）、昵称（或「未设置昵称」）、邮箱（本地模式显「本地模式」）、模式徽章（云端同步 / 本地存储）、编辑按钮。
- **三数字**：连续打卡（+ 里程碑 7/30/100）、本周专注分钟、待办完成率（累计）。
- **编辑**：昵称 + 6 色莫兰迪头像色；保存防连击；云端 updateUser 后必须 refreshSession 才能读到新 metadata。

#### F-ME-02 累计统计

- 6 格：专注总时长、专注次数、累计完成任务、复盘篇数、笔记（未归档）、资料库条数。
- 与身份卡去重：连续打卡/完成率只在身份卡出现。

#### F-ME-03 外观

- 主题三态（浅色/深色/跟随系统），aria-pressed；见 F-SHELL-03。

#### F-ME-04 通知设置

- **文件**：`src/modules/me/notifications-section.tsx`。
- **Web Push 行**：状态徽章；订阅（请求权限 → pushManager.subscribe → 存 endpoint/keys → 本地 base64）；退订；测试发送。
- **SC3 行**：SendKey 输入 + 保存（前端格式校验）；说明文案引导到 sc3.ft07.com、装 App、复制 sctp 开头的 key；测试发送后显示「SC3 响应：<raw>」。
- **Telegram 行**：Token + Chat ID +「保存并测试」（服务端 getMe + 真发，通过才落库）。
- **测试发送**：一次打全部已配置通道；结果逐条显示失败原因与 SC3 原文。
- **本地模式**：整段替换为「本地模式不支持系统推送」。
- **文案缺陷**：Web Push 说明里写了字面量星号（Markdown 的强调语法在 JSX 里不会变粗体，会直接显示 ** 符号，§8 P2）。
- **产品缺口**：当前没有微信投递；SC3 是自有 App（见 §1.6）。

#### F-ME-05 数据管理

- 导出：12 表 → JSON 下载；记录 wb:last-backup；显示「上次备份 N 天前」/「今天已备份」/「从未备份」，≥7 天琥珀提醒。
- 导入：validateBackup（app/version/12 表数组）→ confirm「覆盖当前全部数据」→ importAll → 全缓存失效；本地配额错误有专门文案。
- 存储占用：本地模式 navigator.storage.estimate()；云端显示「数据在云端同步 / 无本地占用」。

#### F-ME-06 账号

- 云端：修改密码（≥6 位、两次一致、成功后强制退出）、退出登录（二次确认）。
- 本地：说明「本地模式无账号，数据仅存本机」。

#### F-ME-07 关于

- 安装行（见 F-SHELL-11）；更新日志入口（整页）+ 当前版本标题；底部版本与一句话。
- iOS 安装指引 Dialog（Safari 分享 → 添加到主屏幕）。

### 4.12 认证（F-AUTH）

#### F-AUTH-01 登录

- **文件**：`src/app/auth-page.tsx`、`src/app/auth.tsx`。
- **标识**：邮箱或手机号；邮箱走 signInWithPassword；手机号先 POST /api/resolve-phone 换邮箱（404 = 未注册并切到注册并带入手机号；服务异常提示「手机号登录服务暂不可用，请先用邮箱登录」）。
- **错误映射**：invalid_credentials →「账号或密码不正确」；Email not confirmed →「邮箱尚未验证」；其他原文。
- **忘记密码**：输入邮箱 → resetPasswordForEmail，redirect 到 /reset-password。
- **本地模式**：/login 直接重定向 /。

#### F-AUTH-02 注册

- **必填**：邮箱、密码（≥6）、确认密码；手机号选填（11 位，可带 +86）。
- **校验**：实时错误文案（提交后或已输入时显示）；手机号占用预检（best-effort，接口不可用则跳过）。
- **分支**：SignUp 返回 session（邮箱验证关闭）→ 直接进首页；无 session（需验证）→ 切登录并提示去邮箱验证。
- **别名**：注册时把规范化手机号写进 user_metadata.phone，登录后由 ensurePhoneAlias 补 wb_login_aliases 行（幂等、静默失败、手机号被占则放弃）。

#### F-AUTH-03 重置密码页

- /reset-password：Supabase 重置链接进入后可设新密码；成功后回登录/首页（具体见 `src/app/reset-password.tsx`）。

#### F-AUTH-04 手机号解析接口

- POST /api/resolve-phone：service role 查别名 → auth.admin.getUserById → 返回邮箱；IP 限流 5 次/分钟；未注册 404；格式错 400。
- **隐私风险**：任意人可对已知手机号查询「是否注册 + 对应邮箱」；限流基于可伪造的 x-forwarded-for。单用户项目风险有限，但属于需要审查的接口（§8 安全项）。

---

## 5. 服务端 API 契约

所有函数都在 `api/` 下，**单文件**；入口由 `vercel.json` rewrite 到 `?entry=`。除天气/空气/热点/项目列表/手机号解析外，其余都要鉴权。

### 5.1 端点总表

| 方法/路径 | entry | 鉴权 | 作用 | 缓存/超时 |
|---|---|---|---|---|
| GET /api/weather | — | 无 | 代理 Open-Meteo 实况+逐小时+8 日 | `s-maxage=1800, swr=86400`；上游 4s |
| GET /api/air-quality | — | 无 | 代理 Open-Meteo 空气质量 | 同上 |
| GET /api/hot | — | 无 | 并发聚合 25+ 热榜源 | `s-maxage=600`；单源 8s |
| GET /api/projects | — | 无 | 知识库项目列表（GitHub Contents） | `s-maxage=600`；fallback 300 |
| GET /api/projects?entry=detail&dir= | detail | **JWT** | 单项目门户口全文（Markdown 渲染） | `private, s-maxage=600`；GitHub 8s |
| GET /api/check-reminders | check | **JWT** | 扫描/生成/发送 + 返回提醒列表 | 无缓存；重接口 |
| POST /api/cron-notify | cron | **CRON_SECRET** | 同上，service role 全用户 | 无缓存 |
| POST /api/test-notify | test | **JWT** | 向本人所有通道发测试 | — |
| POST /api/telegram-test | telegram-test | **JWT** | getMe 校验 + 试发，通过才由前端落库 | — |
| POST /api/resolve-phone | resolve-phone | 无（限流） | 手机号 → 邮箱 | 5 次/分钟/IP |
| POST /api/digest-enrich | enrich | **CRON_SECRET** | 抓取→落库→AI 摘要→聚簇 | 预算默认 50s |
| POST /api/digest-build | build | **CRON_SECRET** | 按事件编排当日日报 | — |
| POST /api/build-digest | force | **JWT** | 用户手动重生成当日日报 | — |
| GET /api/digest-selftest | selftest | **CRON_SECRET** | 环境/表/模型连通自检 | — |

### 5.2 提醒端点细节

- **check**：`runCheck` → 读 tasks/exams/goals/reminders → 计算 specs → 三向对齐写库 → `sendDue` → 返回 `{ok, created, updated, removed, due, sent, skipped, reminders[], vapidPublicKey, scannedAt}`。
- **cron**：与 check 同一 `runCheck`，但用 service role（跨用户）；`CRON_SECRET` 用长度 + `timingSafeEqual` 比较，认证失败不泄漏 env 名。
- **test**：`sendTest` 返回 `{ok, sent, results[]}`；`results[].detail` 仅 SC3 成功时有（前 200 字原始响应）。
- **telegram-test**：两步错误定位（token / chat），返回 `botUsername`；**不写库**，写库由前端在成功后调用 `saveChannelConfigs`。

### 5.3 AI 日报管线（`api/digest.ts`）

```
[GitHub Actions / 手动]
  → /api/digest-enrich (cron)
      ├─ fetchHot(origin)：HTTP 自调本站 /api/hot（单文件约束，不能 import）
      ├─ persistItems：URL 归一化去重、写 wb_hot_items（ai_status=pending）
      ├─ enrichPending：并发 5，逐条 chat() 生成 分类/分数/摘要；写 done；预算 60%
      ├─ clusterItems：同事件聚簇（LLM 判断 + 标题/URL 规则），写 wb_hot_events；预算 40%
      └─ logRun 写 wb_digest_runs
  → /api/digest-build (cron)
      ├─ 取当日事件按 heat 排序；分类/配额/顺序在代码里做
      ├─ 每个事件带「最有分量的摘要」一起喂模型
      ├─ 模型只写 title/overview/每个 point
      └─ upsert wb_daily_reports（(user_id, report_date) 唯一）
```

- **模型**：OpenAI 兼容；`LLM_BASE_URL`（默认 DeepSeek）、`LLM_MODEL`（默认 deepseek-flash）、`LLM_API_KEY`（回落 `DEEPSEEK_API_KEY`）。
- **思考模式**：默认关闭（`thinking: {type:'disabled'}`），`LLM_THINKING=on` 可开；必须读 `finish_reason`，截断当场抛错。
- **预算**：`DIGEST_BUDGET_MS` 默认 50s；抓取（约 11s）先扣，再按剩余 60/40 分给摘要/聚簇；`DIGEST_ENRICH_LIMIT=35`、`DIGEST_CONCURRENCY=5`。
- **配额**：`DIGEST_PER_CATEGORY=4`，`DIGEST_FOCUS_CATEGORY=科技`，`DIGEST_FOCUS_PER_CATEGORY=12`。
- **归属**：`DIGEST_USER_ID` 指定用户；未配置取「库里的第一个用户」（多用户环境必须显式配）。
- **自检**：检查 env、表、模型连通；模型连通判据是「这次调用通不通」，不是「有没有正文」（思考模式可能吃满 token 返回空）。

### 5.4 环境变量

| 变量 | 侧 | 必需 | 说明 |
|---|---|---|---|
| `VITE_SUPABASE_URL` | 前端+函数 | 云端必需 | 也用于函数端 service role 客户端 |
| `VITE_SUPABASE_ANON_KEY` | 前端+函数 | 云端必需 | 用户 JWT 客户端 |
| `SUPABASE_SERVICE_ROLE_KEY` | 函数 | cron/digest 必需 | **只在服务端**，绝不进前端 |
| `VITE_VAPID_PUBLIC_KEY` | 前端+函数 | 推送必需 | 浏览器订阅 |
| `VAPID_PRIVATE_KEY` | 函数 | 推送必需 | 服务端签名 |
| `CRON_SECRET` | 函数 | cron 必需 | pg_cron / workflow 的 Bearer |
| `GITHUB_TOKEN` | 函数 | 项目页必需 | 读私有知识库（fine-grained，只读 Contents） |
| `LLM_BASE_URL` / `LLM_MODEL` / `LLM_API_KEY` | 函数 | 日报必需 | 兼容 OpenAI |
| `DEEPSEEK_API_KEY` | 函数 | 可选 | `LLM_API_KEY` 的回落 |
| `LLM_THINKING` | 函数 | 可选 | `on` = 打开思考模式 |
| `DIGEST_USER_ID` | 函数 | 多用户必需 | 日报写哪个账号 |
| `DIGEST_*` | 函数 | 可选 | 预算/并发/配额/关注分类 |

---

## 6. 横切机制（改任何模块都会碰到）

### 6.1 时间与日期口径（最容易出错）

| 场景 | 表示 | 比较方式 |
|---|---|---|
| 任务/考试/目标/复盘/健康日期 | `YYYY-MM-DD` 字符串（本地日期） | 字符串字典序即可 |
| 完成时刻/专注开始/创建时间 | UTC ISO 字符串 | 先 `localDateOfISO()` 转本地日期再与 `YYYY-MM-DD` 比 |
| 提醒计划时刻 | UTC ISO（由上海 +8 换算） | `new Date(...).getTime()` 比，**不要比字符串** |
| 服务端「今天」 | `todayShanghai(now)` | 固定 +8，无夏令时 |
| 前端「今天」 | `todayStr()` | 浏览器本地时区 |

- **原则**：凡是「哪一天」的统计，都用 `localDateOfISO`；凡是「哪一刻」的比较，都用毫秒时间戳。
- **已知限制**：提醒按上海时区固定换算，用户换时区/出国会偏移；这是单用户项目的明确取舍。

### 6.2 数值与单位

- 体重 kg（step 0.1）、睡眠 h（0–24）、运动 min；专注分钟为整数；评分 1–10（可空）；心情 1–5；资料评分 1–5。
- `font-numeric` = `tabular-nums`，所有数字列必须加，避免跳动。

### 6.3 错误处理与反馈

- **mutation**：每个 create/update/delete 都要有 `onError` toast；关键提交按钮 `isPending` 禁用；失败保留表单内容。
- **PostgREST 错误是普通对象**（`{message, code, details, hint}`），不是 `Error`；服务端用 `errText()` 摊平，前端不要把 `instanceof Error` 当唯一判据。
- **通知类增强能力全程 catch 静默**（SW/Notification/震动/纸屑），绝不冒泡到 ErrorBoundary。
- **异步错误不会被 ErrorBoundary 捕获**：React Query 的 error 要显式渲染错误态（各页已有「加载失败」分支）。

### 6.4 无障碍

- 图标按钮必须有 `aria-label`；筛选 chips 用 `aria-pressed`；Tab 用 `role=tab` + `aria-selected`；状态行用 `role=status` + `aria-live=polite`。
- 颜色不是唯一载体：优先级有 `sr-only` 文本；逾期除红色外还有图标/文字。
- 键盘：Dialog/Sheet 由 base-ui 管理焦点；自绘浮层（命令面板/快速捕获）需自己保证 Esc 与焦点。
- `prefers-reduced-motion`：页面/卡片/sheet/fade/check-pop/启动动画/撒花/平滑滚动全部降级。

### 6.5 动效预算

| 动效 | 时长 | 实现 |
|---|---|---|
| 页面入场 | 180ms | `.page-enter` rise-in |
| 卡片入场 | 200ms + 40ms stagger | `.card-enter` |
| 快速捕获 | 180ms | `.sheet-enter` |
| 骨架→内容 | 140ms 淡入 | `.fade-rise` |
| 勾选完成 | 180ms 一次放大 | `.check-pop` |
| 任务重排/跨区 | FLIP | `lib/flip.ts`，reduced-motion 直接落位 |
| 启动动画 | ~3s | 可跳过；reduced-motion 整段跳过 |

> 统一缓动 `--ease-out-soft`；不要新增 300ms+ 的 UI 动效，也不要用带回弹的曲线。

### 6.6 体积与懒加载

- 页面全部经 `lazyRetry` 懒加载；设置页、更新日志页、项目详情额外在 `App.tsx` 懒加载。
- `canvas-confetti` 动态 import；Meteocons SVG 独立文件（不内联 base64）；changelog 是纯数据 chunk。
- `npm run check:bundle` 只拦灾难线：首屏 brotli >400KB / 总量 raw >2500KB / 单 chunk >800KB。正常加功能不会红。

### 6.7 缓存与离线

- SW：precache 全部产物 + `cleanupOutdatedCaches`；自家 `/api/*` GET StaleWhileRevalidate（1h/10 条）；跨域图片 CacheFirst（30 天/50 张）；导航失败回退 `index.html`。
- 浏览器：React Query（内存）+ localStorage（热点缓存、已读、通知账本、番茄钟、主题、复盘折叠、备份时间）。
- CDN：天气/空气 30 分钟；热榜/项目列表 10 分钟；项目详情 private 10 分钟。

### 6.8 安全与隐私

- Supabase RLS：所有 `wb_*` 表默认「本人行」；service role 只在 `api/` 内使用。
- JWT 校验：anon client `getUser(token)`；失败 401，不做 GitHub/DB 请求。
- 因鉴权而异的响应必须 `Cache-Control: private`（项目详情已做）。
- 密钥：`SUPABASE_SERVICE_ROLE_KEY`/`VAPID_PRIVATE_KEY`/`GITHUB_TOKEN`/`CRON_SECRET`/`LLM_API_KEY` 只在服务端；前端只有 anon key 与 VAPID public。
- **待审查**：项目列表公开缓存、手机号解析可枚举（见 §8）。
- 备份文件含全部个人数据，无加密；设置页有「导出文件请自行妥善保管」提示。

### 6.9 文案与国际化

- 全站中文硬编码，无 i18n；日期用 `zh-CN` 本地化；相对时间手写（刚刚/N 分钟前/N 天后）。
- 文案风格：短句、具体、不用营销词；错误文案要说「下一步怎么办」。
- **已知文案漂移**：命令面板搜索范围、热榜「每 30 分钟自动刷新」、通知设置的 Markdown 星号（§8）。

### 6.10 数据演进策略

- **不写兼容层**；旧数据靠**读路径惰性迁移**：tasks 的 sort/focusDate、notes 的 tag→tags、papers 的新字段默认值、reviews 的字段补空。
- 数据库结构性变更：幂等迁移文件 + 用户执行；新增列前端用 optional / 默认值兜底（防 CDN 旧缓存）。
- 新增字段的检查清单：类型 → 双仓储映射 → 迁移 SQL → 备份表 → UI → 测试 → 文档。

---

## 7. 质量体系

### 7.1 命令

| 命令 | 作用 | 基线 |
|---|---|---|
| `npm test` | Vitest 全量 | 约 702 用例；1 个已知环境失败 |
| `npm run build` | `tsc -b && vite build` | 必须 0 TS 错误 |
| `npm run lint` | oxlint | 警告 ≤ 12 条（当前基线） |
| `npm run check:bundle` | 体积烟雾报警 | 只拦灾难线 |
| `E2E_PORT=5199 npx playwright test` | 冒烟 20 用例 | 本地 IndexedDB 模式，无需 env |
| `node scripts/release.mjs --yes --title="…"` | 发版（lint→test→build，失败回滚） | 见 `VERSIONING.md` |

> **本机长命令会被掐断**（约 10s 返回空输出且进程被杀）：用 `Start-Process` 后台跑，stdout/stderr 分开重定向到日志，再轮询。中文 commit message 用 `git commit -F <UTF-8 文件>`。

### 7.2 测试分层

| 层 | 例子 | 原则 |
|---|---|---|
| 纯函数 | `repeat.test.ts`、`task-rules.test.ts`、`reminders-format.test.ts`、`digest-view.test.ts` | 规则/边界优先，注入 `today/now` |
| 组件 | `reminders-center.test.tsx`、`projects-page.test.tsx`、`task-dialog.test.tsx` | 本地真仓储（无 env），QueryClientProvider 包裹；断言业务锚点 |
| 双仓储契约 | `repository-contract.test.ts` | 同一脚本对比两实现，防漂移 |
| 数据库语义 | `digest-schema.test.ts` | 直接解析迁移 SQL，断言代码写入值落在 CHECK 内 |
| 服务端 | `digest-handler.test.ts`、`reminders-api.test.ts` | Supabase 替身必须**忠实**（比真库宽松就是 bug 藏身处） |
| E2E | `e2e/smoke.spec.ts` | 待办完成/撤销、项目刷新、复盘两段式、reduced-motion 等 |

### 7.3 已知 flaky / 环境问题

- E2E「今日概览：桌面双栏」在 4 workers 下偶发 teardown 超时（30s）；单跑 6s 通过，判定为负载抖动，不是回归。
- `review-real-gateways.test.ts` 需要真实网关凭据，CI/本地无凭据时失败/跳过。
- 本机 5173 可能被其他项目占用：Playwright 会静默复用，导致全部用例打在别的应用上；用 `E2E_PORT` 换端口。

### 7.4 发版规则（VERSIONING.md 摘要）

- feat → minor；fix → patch；破坏性 → major；多 commit 取最高档；24h 内追加修复并入当前版本；`docs:/chore:/refactor:` 不发版。
- 发版 = 改 `src/app/changelog.ts` 头部 + `package.json` version → `git tag vX.Y.Z` → push（tag 触发部署）。
- 版本号**不在代码里硬编码**：应用内显示的是 `CHANGELOG[0].version`。
- 每条 changelog 以「新增：/修复：/变更：/提速：/安全：/移除：」开头（整页会加粗类别）。

### 7.5 CI

- `.github/workflows/ci.yml`：oxlint + vitest + build + check:bundle。
- `ci.yml` 的 `e2e` job：Playwright 冒烟（同一 workflow 的另一个 job，失败上传 `test-results/`）。
- `.github/workflows/reminders.yml`：每 20 分钟兜底提醒。
- `.github/workflows/digest.yml`：日报 enrich/build 定时。

---

## 8. 已知问题与优化候选（证据化）

> 这一节是**候选清单**，不是已确认需求。每条都给了证据与验证方式；动手前先复现/补测试，再决定是否修。
> 优先级定义见 §0.3。没有已知 P0。

### 8.1 P1（数据风险或明显体验缺陷）

#### ISSUE-01 新建速记会在每次停顿时重复创建

- **现象**：点「速记」→ 输入一段 → 停 1.2 秒（自动保存）→ 继续输入 → 再停 → 速记列表出现多条内容相近的记录。
- **证据（代码可证）**：`src/modules/news/note-editor.tsx` 的自动保存 effect 在 `note === null` 时调用 `create.mutate({content, tag})`，但创建成功后**没有把新 id 回填**给编辑器；编辑器仍以 `note=null` 挂载（`notes.tsx` 里 `key="new"`），下一次防抖又走 create。
- **影响**：新速记流程（最高频入口之一）产生重复数据；用户要手工删。
- **建议修法**：创建成功后把返回的 Note 存进本地 state / 或让父组件用返回 id 切换成编辑态；或首次保存后调用 `onDone` 并由父组件重新打开编辑。推荐「本地记住 createdId，后续走 update」。
- **验证**：组件测试——输入→等 1.2s→再输入→再等 1.2s，断言 `createNote` 只调用一次、`updateNote` 调用一次。
- **风险**：自动保存的防抖/卸载时序；别引入「保存两次」的新问题。

#### ISSUE-02 编辑已完成任务会把它重新打开

- **现象**：在「已完成」区点任务标题 → 对话框 → 改标题/备注 → 保存 → 任务从已完成区消失，回到今日待办（`completedAt` 被清空）。
- **证据（代码可证）**：`task-dialog.tsx` 回填 `status` 时把 `done` 落到 `'todo'`（三态只有 todo/doing/someday），提交时 payload 始终带 `status`；仓储 `applyTaskPatch` 看到 `status !== 'done'` 就清空 `completedAt`。
- **影响**：改一个字的备注 = 撤销完成；重复任务不受影响（它们完成时 status 仍是 todo）。
- **建议修法**：编辑态单独保存「原始 status」；完成态任务禁止改状态（或提供显式「重新打开」按钮）；提交时若 status 未变则不挂该键。
- **验证**：组件测试——编辑 done 任务只改标题，断言 patch 不含 status 或 status 仍为 done、completedAt 不变。
- **风险**：让「编辑已完成任务」与「重复任务」两条路径都保持正确。

#### ISSUE-03 今日概览弹窗完成重复任务会终结整条序列

- **现象**：在启动弹窗里勾掉一个每日重复任务 → 之后它不再每天出现。
- **证据（代码可证）**：`src/app/daily-summary.tsx` 的 checkbox 直接 `update {status:'done'}`，没有走 `completionPatch`；而重复任务的完成语义是「completedAt + dueDate 推进」，写 done 等于终止。
- **影响**：与待办页/提醒中心行为不一致，且是数据语义破坏。
- **建议修法**：改用 `completionPatch(t, today)` + 撤销 toast（与 F-TASK-05 相同）。
- **验证**：组件测试——弹窗里完成一个 repeat 任务，断言 status 仍 todo、dueDate 推进。
- **风险**：弹窗的列表数据是 `todayTasks`，注意与已完成区刷新同步。

#### ISSUE-04 命令面板不搜索任务/笔记/热点

- **现象**：顶栏写着「搜索任务、笔记、热点…」，点开只能搜命令名和页面名；输入任务关键词为空。
- **证据（代码可证）**：`command-palette.tsx` 的 `groups` 只由 `allSubModules` 与固定命令生成，没有任何数据查询；README 也写了「全局搜索任务/笔记/热点」。
- **影响**：核心承诺落空；用户会反复尝试。
- **建议修法**：新开「搜索」组，读 React Query 缓存（tasks/notes/dailyReports/hot items），输入 ≥1 字才显示；结果分组（任务/速记/热点/页面），支持 ↑↓ + Enter；空结果保留「没有匹配结果」。
- **验证**：组件测试 mock 三种数据，输入关键词断言分组与跳转。
- **风险**：数据可能未加载（懒加载页面没访问过）——需要按需 fetch 或只搜已缓存；不要让面板一开就并发三个大查询。

#### ISSUE-05 提醒通道没有微信投递

- **现象**：Server酱³ 消息只进 SC3 App；用户要的是「像微信一样」的公众号/服务号消息。
- **证据（产品事实）**：SC3 官方定位「自有客户端」，消息先入库后由客户端拉取；SCT 才是微信服务号（免费 5 条/天），PushPlus 是微信公众号（200 次/天，需实名 + 迁移加列）。详见 `docs/plans/RESEARCH_2026-11-17_通知推送.md` §7。
- **影响**：提醒的「离开 App 也能收到」这一核心价值在微信场景不成立。
- **建议**：先拍板通道（SCT 零迁移 / PushPlus 需迁移 019），再按 §9.2「加通道」流程做；**不要**新增 channel id（复用 serverchan 记账，或另立 id 时同步迁移 sent_channels 语义）。
- **验证**：真机收到微信消息 + `/api/test-notify` 回显原始响应；数据库 sent_channels 正确。
- **风险**：SCT 5 条/天额度、PushPlus 实名与迁移；不要把「受理」当「送达」。

#### ISSUE-06 编辑历史复盘时右栏汇总仍是今天的数据

- **现象**：从历史复盘点进 11-20 的复盘，左栏在编辑 11-20，右栏「完成任务/专注/打卡/体重」还是今天。
- **证据（代码可证）**：`review.tsx` 里 `const s = buildDailySummary(today, ...)`，`today` 是 `todayStr()` 而非 `activeDate`。
- **影响**：写历史复盘时被错误数据误导。
- **建议修法**：`buildDailySummary(activeDate, ...)`；「本周回顾」保持近 7 天（明确标题），或在历史模式下隐藏当日四格。
- **验证**：组件测试选择历史日期，断言四格数字来自该日期。
- **风险**：历史数据可能缺（旧记录没有 completedAt），显示 0 是正常的。

### 8.2 P2（体验/性能/一致性）

| ID | 问题 | 证据 | 建议 | 验证 |
|---|---|---|---|---|
| ISSUE-07 | 逾期区星标不会成为今日焦点 | `today-tasks.tsx` 逾期/更早行的 `onFocus` 只 patch `focus`，不写 `focusDate`；惰性迁移会把 focusDate 补成创建日 | 与今日区统一：`{focus, focusDate: 今天}` | 组件测试：逾期任务点星后出现在今日焦点 |
| ISSUE-08 | 新建速记只保存第一个标签 | `note-editor.tsx` 新建分支 `createNote(content, tag: tags[0])` | 创建后补一次 update 写全量 tags，或扩展仓储签名 | 测试多标签新建 |
| ISSUE-09 | 行动步骤勾选只存 localStorage | `action-detail.tsx` `growth-steps-<id>` | 加 `steps_done` jsonb（迁移 019）或接受「本机进度」并明说 | 换设备/清缓存后不丢 |
| ISSUE-10 | 删除习惯后行动无法重新绑定 | `deleteHabit` 把 habit_id 置 null；ActionDetail 无绑定 UI | 行动详情加「选择打卡习惯」下拉 | 绑定后能打卡 |
| ISSUE-11 | 重导入十项行动会产生孤儿习惯 | `buildImportPlan` 只按 no 跳过；已删行动但习惯还在时会新建同名习惯 | 复用同名习惯，或导入前清理无行动引用的习惯 | 删除一条行动后再导入，习惯不重复 |
| ISSUE-12 | 今天没打卡时连击显示 0 | `streakFromLogDates` 从今天倒推，今天无记录立即 break | 从昨天起算并在 UI 标「今天还未打卡」，或保留 0 但文案解释 | 单元测试两种语义 |
| ISSUE-13 | 热榜文案说「每 30 分钟自动刷新」但没有定时器 | `hot.tsx` 只在挂载/手动/过期重试时 load | 加 30 分钟 interval（页面可见时）或改文案 | 停留 30 分钟观察 |
| ISSUE-14 | 通知设置里有字面量 `**` 星号 | `notifications-section.tsx` 的 `**安卓大陆不可用**` 在 JSX 里不会渲染成粗体 | 改成 `<strong>` 或去掉星号 | 目视 |
| ISSUE-15 | 窗口聚焦会重打 check-reminders 全量扫描 | `useReminders` staleTime 30s，React Query 默认 `refetchOnWindowFocus` | 对该 query 设 `refetchOnWindowFocus: false`，只靠计时器/手动 | 聚焦 5 次，网络面板只 1 次 |
| ISSUE-16 | 通知去重「认领即记账」，show 失败不重试 | `notify-log.ts` `claimNotifications` 先写账本；`reminder-banner.tsx` 再 show | 成功后再记账（两段式），或失败回滚该键 | mock showNotification 抛错，下次能重弹 |
| ISSUE-17 | 速记/任务/健康记录删除无确认或撤销 | 对应列表的删除按钮直接 mutate | 统一「confirm 或 5 秒撤销」；高频列表优先撤销 | 目视/组件测试 |
| ISSUE-18 | 命令面板无键盘上下选择 | 只有点击；无 `aria-activedescendant` | ↑↓/Enter + 高亮项 | 键盘走查 |
| ISSUE-19 | 快速捕获不是语义化 dialog | 自绘 div，无 `role=dialog`/`aria-modal`/焦点陷阱 | 补语义与焦点管理 | axe/键盘走查 |
| ISSUE-20 | 添加论文的文件夹下拉只列顶层 | `add-paper.tsx` 直接 `folders.map`；详情页是拍平带缩进 | 抽公共 `flattenFolders` 复用 | 选二级文件夹 |
| ISSUE-21 | 文件夹不能移动 | 仓储有 `moveFolder` + 防环，UI 无入口 | 树节点「移动到…」或拖拽 | 移动后资料跟随 |
| ISSUE-22 | 项目列表未鉴权且公共缓存 | `api/projects.ts` 列表分支无 auth，`s-maxage=600`；详情才 auth | 若隐私优先：列表也校验 JWT（但离线快照仍公开）；至少文档化 | 未登录 curl 列表 |
| ISSUE-23 | 手机号解析可枚举注册状态与邮箱 | `api/auth.ts` 404/200 差异 + 返回 email；限流基于可伪造 IP | 改为统一响应 + 验证码/登录后绑定；或仅在自有客户端使用 | 安全评审 |

### 8.3 P3/P4（打磨与产品增强）

| ID | 方向 | 说明 |
|---|---|---|
| ISSUE-24 | 提醒只支持准点 | 没有「提前 5/15/60 分钟」；可在 TaskRepeat/Reminder 增加 offset 节点，但要同步生成/存活/文案 |
| ISSUE-25 | 重复任务没有结束条件 | 没有「共 N 次 / 到某日停止」；长序列只能手动删 |
| ISSUE-26 | 天气城市写死重庆 | 城市/坐标进设置；`api/weather` 需支持 query 参数（当前常量） |
| ISSUE-27 | 启动动画每次冷启动 3s | 老用户可能烦；建议「设置里可关」或 7 天内只播一次（保留首次惊艳） |
| ISSUE-28 | 番茄钟跨结束结算 | 关闭页面期间结束只在下一次打开结算；>12h 丢记录；可考虑 SW/Notification 提醒 |
| ISSUE-29 | 考试「0 天后」文案 | 当天应显示「今天」；ExamCard/daysLabel 统一 |
| ISSUE-30 | 快速捕获「全部打卡」对多目标习惯只 +1 | 文案改为「+1 次」或循环到 target |
| ISSUE-31 | 习惯不能编辑名称/目标/图标 | 仓储支持 updateHabit，UI 未暴露；补一个编辑弹层 |
| ISSUE-32 | 复盘无自动保存 | 与速记相反；可加草稿 localStorage 或 beforeunload 提醒 |
| ISSUE-33 | 本地模式昵称/头像不进备份 | 换设备丢失；可并入备份或明确说明 |
| ISSUE-34 | 通知配置不进备份 | 密钥类，按设计排除；恢复后需重填（文档已说明） |
| ISSUE-35 | 项目列表 fallback 快照硬编码在 api/projects.ts | 知识库变化后快照会旧；需要时更新 `FALLBACK_PROJECTS` 与 `public/projects-status.json` |
| ISSUE-36 | 设置页/关于的版本信息依赖 CHANGELOG | 正常；但改 changelog 必须同步 package.json，否则 tag 与显示不一致 |
| ISSUE-37 | SW 更新只在页面加载时检查 | 已安装 PWA 从后台恢复（隐藏 ≥5 分钟）只重播启动动画、不检查更新；修法见 `docs/plans/FIX_PLAN_SW_UPDATE_ON_RESUME.md` |
| ISSUE-38 | 无全局数据搜索/筛选（跨模块） | 与 ISSUE-04 同源；可先做命令面板搜索 |
| ISSUE-39 | 无周/月统计页 | 目前只有 7 天趋势与本周回顾；可加「统计」页（专注/完成/习惯/复盘） |
| ISSUE-40 | 无提醒偏好（免打扰时段/每日汇总） | 可在服务端 sendDue 前过滤；要注意时区与「补发」语义 |

### 8.4 安全审查项（需产品确认，不一定是 bug）

1. **项目列表公开**（ISSUE-22）：项目名/技术栈/摘要属于私有知识库内容；当前设计为了「未登录也能看离线快照」而公开。若不可接受，列表也加 JWT（离线时只显示本地快照）。
2. **手机号枚举**（ISSUE-23）：风险最高的是「返回对应邮箱」。建议至少把 404/200 统一成「已发送验证」类响应，或要求先通过邮箱验证。
3. **备份文件无加密**：包含全部个人记录；设置页已有提示，可考虑导出时可选密码加密（WebCrypto）。
4. **localStorage 明文**：本地模式的数据、通道配置在浏览器明文；这是本地模式的固有属性，需在文档/UI 说明。
5. **第三方外链**：热点/资料/项目链接均 `target=_blank rel=noreferrer`；新增外链保持。

---

## 9. 给接手 AI 的工作协议

### 9.1 开工前按顺序读

1. `AGENTS.md`（工程宪法：8 条准则、硬性约定、避坑清单、交付纪律）。
2. 本文 §1（红线）与 §6（横切口径）。
3. 目标模块的 §4 功能卡 + §8 同模块问题。
4. `docs/plans/` 里该模块的旧计划（很多「为什么这样」写在里面，例如 `PLAN_V134_提醒项目复盘与推送.md`）。
5. 相关测试（`tests/`）——它们是行为的第二份文档。

### 9.2 常见改动路径

| 想做什么 | 必改 | 别忘了 |
|---|---|---|
| 给任务加字段 | `types.ts` → 双仓储映射/写入 → 迁移 019 → `task-dialog`/`task-item` → 备份（自动） | 契约测试、迁移幂等、旧缓存 optional、changelog |
| 加一个页面 | `src/modules/<域>/<page>.tsx` → `registry.ts`（path + lazyRetry + 可选 homeCard/badge） | 移动端入口（底部 Tab 只取第一个子模块）、首页卡跨度之和 = 12、E2E |
| 加提醒通道 | `api/reminders.ts` 的 sendDue/test；`ChannelState`；设置页 | **不要新增 channel id**；先定「受理 vs 送达」判据；迁移列要幂等；真机验证 |
| 改时间/今日口径 | `isTodayScope` / `todayTasks` / `effectiveRows` / `buildDailySummary` | grep 所有消费方（待办、概览条、弹窗、提醒、复盘、周趋势）；时区用 `localDateOfISO` |
| 加服务端 API | `api/<name>.ts` 单文件 + `vercel.json` rewrite | 鉴权、`Cache-Control`（private/public）、超时、错误文本摊平、README 环境变量 |
| 改主题/视觉 | `src/index.css` 的 token（含 .dark） | 对比度（非文本 ≥3:1、文本 ≥4.5:1）、reduced-motion、Bento 等高 |
| 改速记/资料库 | `news-view.ts` 纯函数 + 组件 + `add-*` 表单 | 自动保存时序、标签解析、文件导入格式、Markdown 安全 |
| 加统计/复盘指标 | `lib/stats.ts` / `review-summary.ts` / `review-utils.ts` | 口径写清（当日/累计/近 7 天）；UTC→本地日期；单测注入 today |
| 换 UI 底座/组件库 | `components/ui/*` | base-ui 不是 radix；`.home-cell [data-slot=card]` 依赖 shadcn 结构；升级后回归 Bento |
| 改 AI 日报 | `api/digest.ts`（prompt/预算/模型）+ `daily-digest.tsx` | `finish_reason`、summary 必须喂给模型、分类排序在代码、schema 测试、迁移 015 |
| 改项目页 | `api/projects.ts` 两个分支 + `shared.ts` + 前端 | 单文件约束、frontmatter 剥离、鉴权与 private 缓存、fallback 快照三处同步 |

### 9.3 提交前检查清单

- [ ] `npm test` 全绿（除已知 `review-real-gateways`）。
- [ ] `npm run build` 通过（注意 tsc 失败时 `dist` 仍是旧产物，不要误判）。
- [ ] `npm run lint` 警告 ≤ 12 条（对比改动前后数量）。
- [ ] 改动核心流程（待办/目标/速记/复盘/主题/提醒/项目）→ `E2E_PORT=5199 npx playwright test`。
- [ ] 动了任一仓储 → `tests/repository-contract.test.ts`。
- [ ] 动了迁移/CHECK → `tests/digest-schema.test.ts` 或对应的 SQL 解析测试。
- [ ] 新增/修改文案 → 更新 `changelog.ts` 头部（feat/fix 才发版）。
- [ ] 有没有值得沉淀的经验 → `docs/lessons-learned.md` + 知识库笔记 + 操作日志。
- [ ] `git status` 无临时脚本/截图/日志（`.tmp-*`、`gui-test-screenshots` 已 gitignore，但仍建议清理）。

### 9.4 明确禁止

- ❌ 在 `api/*.ts` 里相对导入 `src/` 或其他 `api/` 文件。
- ❌ 在 `src/` 里 import `api/`。
- ❌ 新增一个独立「提醒已读/忽略」状态（v1.31 已删，别再引入）。
- ❌ 给提醒加新的 channel id 而不改记账语义。
- ❌ 在组件里 `new Notification(...)`。
- ❌ 用 `ERR instanceof Error` 作为服务端 PostgREST 错误的唯一判据。
- ❌ 为了「以后可能」加抽象层/配置层/兼容层。
- ❌ 用 KB 体积否决正常功能（只有进首屏关键路径才掂量）。
- ❌ 改一条仓储实现而不改另一条。
- ❌ 直接把 `window.confirm` 当成移动端好体验（可用，但优先 toast 撤销/对话框）。

### 9.5 完成定义（DoD）

1. 行为符合本文功能卡；有边界的写清边界。
2. 双仓储一致（如涉及数据）。
3. 有测试（纯函数单测优先；交互加组件测；核心流程加 E2E）。
4. 空态/加载态/错误态齐全；移动端与桌面端都过一遍。
5. 无障碍：aria/键盘/reduced-motion。
6. 文案与 changelog 同步；无文档漂移。
7. 交付说明含：改了什么、为什么、怎么验证、遗留什么。

### 9.6 与用户协作方式（本项目的实际习惯）

- **先计划后动手**：调研 → 写 `docs/plans/RESEARCH_*` / `PLAN_*` → 简要说明 → 用户同意 → 实施。
- **要证据**：不要只说「好了」，给数字/截图/真机结果/测试输出。
- **分模块 commit**：`fix(reminders)` / `feat(ui,notify)` / `docs`，一个 commit 一件事。
- **中文 commit message 用文件**：`git commit -F msg.txt`（PowerShell 内联中文会乱码）。
- **不重复问同一个问题**：用户跳过的问题，按最合理默认继续，并在交付时说明假设。

---

## 10. 附录

### 10.1 文件索引（功能 → 文件）

| 功能 | 主要文件 |
|---|---|
| 壳层/导航 | `src/app/layout.tsx`、`src/registry.ts`、`src/App.tsx` |
| 主题 | `src/app/theme.tsx`、`src/index.css` |
| 命令面板 | `src/app/command-palette.tsx`、`src/app/store.ts`、`src/lib/hotkeys.ts` |
| 快速捕获 | `src/app/quick-capture.tsx`、`src/app/use-overlay-back.ts` |
| 启动动画 | `src/app/boot-animation.tsx`、`boot-scene.ts`、`boot-atmosphere*.ts(x)`、`boot-weather.ts`、`boot-animation.css` |
| 今日概览弹窗 | `src/app/daily-summary.tsx` |
| 首页 | `src/app/home.tsx`、`src/modules/overview/overview-home.tsx`、`overview-summary.tsx` |
| 首页卡片 | `src/modules/*/cards.tsx`、`weekly-trend.tsx`、`weather-card.tsx` |
| 待办 | `src/modules/overview/today-tasks.tsx`、`task-item.tsx`、`task-dialog.tsx`、`task-card.ts`、`api.ts` |
| 任务规则 | `src/lib/task-rules.ts`、`src/lib/repeat.ts`、`src/lib/drag-sort.ts`、`src/lib/flip.ts` |
| 天气 | `src/lib/weather.ts`、`weather-icons.ts`、`src/modules/overview/weather-dialog.tsx`、`src/lib/moon.ts`、`api/weather.ts`、`api/air-quality.ts` |
| 学习/考试 | `src/modules/study/study-manager.tsx`、`exam-dialog.tsx`、`api.ts` |
| 学习目标 | `src/modules/study/goal-manager.tsx`、`goals-api.ts` |
| 番茄钟 | `src/modules/study/pomodoro.tsx`、`src/lib/pomodoro.ts` |
| 热点/日报 | `src/modules/news/hot.tsx`、`daily-digest.tsx`、`digest-view.ts`、`hot-settings-dialog.tsx`、`src/lib/hot.ts`、`api/hot.ts`、`api/digest.ts` |
| 速记 | `src/modules/news/notes.tsx`、`note-editor.tsx`、`news-view.ts`、`api.ts` |
| 资料库 | `src/modules/news/papers.tsx`、`paper-detail.tsx`、`folder-tree.tsx`、`add-paper.tsx`、`add-note.tsx`、`cite.ts`、`guide-dialog.tsx`、`src/lib/arxiv.ts`、`parse-import.ts` |
| 健康 | `src/modules/health/health.tsx`、`habit-manager.tsx`、`derive.ts`、`api.ts`、`src/lib/heatmap.ts` |
| 复盘 | `src/modules/review/review.tsx`、`review-utils.ts`、`src/lib/review-summary.ts` |
| 成长 | `src/modules/growth/growth.tsx`、`action-detail.tsx`、`api.ts`、`presets.ts` |
| 提醒 | `src/modules/reminders/format.ts`、`api.ts`、`reminders-center.tsx`、`reminder-banner.tsx`、`notify-log.ts`、`store.ts`、`api/reminders.ts` |
| 项目 | `src/modules/projects/projects.tsx`、`project-detail.tsx`、`api.ts`、`shared.ts`、`api/projects.ts` |
| 我的 | `src/modules/me/settings.tsx`、`notifications-section.tsx`、`src/lib/backup.ts`、`pwa-install.ts` |
| 认证 | `src/app/auth-page.tsx`、`auth.tsx`、`reset-password.tsx`、`api/auth.ts` |
| 数据层 | `src/lib/db/types.ts`、`local-repository.ts`、`supabase-repository.ts`、`index.ts` |
| PWA | `src/pwa.ts`、`src/sw.ts`、`vite.config.ts` |

### 10.2 localStorage / sessionStorage 键

| 键 | 作用域 | 内容 | 清掉会怎样 |
|---|---|---|---|
| `wb:tasks` 等 `wb:` 前缀 | localStorage | 本地模式 12 张表 | 本地数据全丢（云端模式不用） |
| `wb-theme` | localStorage | light/dark/system | 回浅色 |
| `wb:profile` | localStorage | 本地模式昵称/头像色 | 回默认 |
| `wb-onboarded` | localStorage | 首次引导已完成 | 再弹一次 |
| `wb-boot-skip` | localStorage | '1' 跳过启动动画（E2E） | 恢复播放 |
| `wb:pomodoro-settings` | localStorage | focusMinutes | 回 25 |
| `wb:pomodoro-state` | localStorage | 计时状态+主题 | 计时重置 |
| `wb:hot-cache-v2` | localStorage | 热榜缓存（30 分钟） | 重新抓取 |
| `wb:hot-read` | localStorage | 已读热点 url（≤500） | 全部变未读 |
| `wb-notified` | localStorage | 前台通知去重账本（7 天） | 可能重弹已通知项 |
| `wb-review-open:<date>:<section>` | localStorage | 复盘分区开合 | 回默认开合 |
| `wb:last-backup` | localStorage | 上次导出时间 | 显示「从未备份」 |
| `wb:subscriptions` | localStorage | 本地模式热点订阅 | 回默认全部 |
| `wb:channelConfigs` | localStorage | 本地模式通道配置（若写入） | 需重配 |
| `growth-steps-<actionId>` | localStorage | 行动步骤勾选 | 步骤进度丢失 |
| `wb:daily-summary-shown` | sessionStorage | 本会话已弹概览 | 再弹一次 |

### 10.3 领域对象字段（TS 权威）

- **Task**：id, title, focus, priority, status(todo/doing/done/someday), dueDate, dueTime, focusDate, tags[], sort, completedAt, createdAt, repeat?, checklist?, note?
- **TaskRepeat**：freq(daily/weekly/monthly), interval, weekdays?[], anchor(due/complete)
- **ChecklistItem**：id, text, done
- **Habit**：id, name, icon, color, targetPerDay, active, createdAt
- **HabitLog**：id, habitId, logDate, count
- **FocusSession**：id, startAt, minutes, note
- **Exam**：id, title, examDate, examTime, subject, note, createdAt
- **StudyGoal**：id, title, target, progress, deadline, status(active/done), note, completedAt
- **Note**：id, content, tags[], archived, pinned, createdAt, updatedAt
- **Paper**：id, title, authors, arxivId, url, status(want/reading/done), rating, note, createdAt, type(paper/note), folderId, tags[], content, finishedAt, summary, keywords[], source
- **Folder**：id, name, parentId, sort
- **HealthLog**：id, logDate, type(weight/sleep/exercise), value
- **Review**：id, reviewDate, mood, score, summary, planTomorrow, achievements, reflection, gratitude, learnings, updatedAt
- **GrowthAction**：id, no, title, emoji, category, why, steps[], targets[], verify, habitId, status(active/paused/done), sort, createdAt
- **Reminder**：id, refType(task/exam/goal), refId, kind, scheduledAt, sentAt, createdAt
- **ChannelConfigs**：serverchanKey, telegramBotToken, telegramChatId
- **DailyReport**：id, reportDate, title, overview, sections[], itemCount, sourceCount, model, generatedAt
- **BackupTables**：tasks, habits, habitLogs, focusSessions, exams, studyGoals, notes, papers, folders, healthLogs, reviews, growthActions

### 10.4 术语表

| 术语 | 含义 |
|---|---|
| 今日口径 / `isTodayScope` | 今日到期 或 今日焦点 或 doing；不含历史逾期 |
| doing（进行中） | 「正在推进、要天天看到」；不管日期都进今日区（逾期时会被逾期区收走） |
| someday（将来） | 无日期收件箱；不提醒；只在今日页尾出现 |
| 今日焦点 | `focus=true` 且 `focusDate=今天`；最多 3 个（UI 建议，未强制） |
| 投影（projection） | 提醒行 = 引用对象的派生视图；`effectiveRows` 是唯一实现 |
| 通道记账 | `sent_channels` 按 webpush/serverchan/telegram 分别记成功；全成功才写 sent_at |
| 补发窗口 | 新建提醒已过期 ≤12h 仍补发，文案带「（补发）」 |
| 门户口 | 知识库 `30-项目/<dir>/<dir> - 门户口.md`，项目页只读镜像的数据源 |
| 双仓储 | LocalRepository / SupabaseRepository，行为必须一致 |
| 本地/云端模式 | 由构建期 Supabase env 决定；测试跑本地模式 |
| Bento | 桌面首页 12 列卡片网格（跨度/顺序在 registry） |
| 快照 | 项目列表的 fallback JSON（`public/projects-status.json`） |
| 热榜 / 日报 | 同一批热点的两个视图：素材层 / 成品层 |
| 行动绑定 | GrowthAction.habitId → 习惯；打卡归属收敛到成长模块 |
| 体积体检 | `check:bundle` 烟雾报警（只拦灾难线） |
| 迁移 | `supabase/migrations/*.sql`，幂等，用户执行 |

### 10.5 本文的维护

- 新增/修改功能时，同步更新对应功能卡与 §10.1 文件索引；**不要**让本文变成过期文档。
- 修复 §8 的 ISSUE 后，把该条移到「已修复」或在行内标注版本与 commit（可保留一行「v1.35 已修」）。
- 本文是「事实底稿」，不是「计划」；计划仍写 `docs/plans/PLAN_*`。
- 生成基线：v1.34.1 / 2026-11-26。下一次大改（v1.35+）建议重新核对 §2.3 路由、§3.1 表、§5.1 端点。

