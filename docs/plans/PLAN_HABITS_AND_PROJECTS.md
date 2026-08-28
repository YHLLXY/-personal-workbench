# 实施计划：打卡入口去重 + 「我的项目」详情页

> 背景：两个产品问题——①「运动健康 · 今日打卡」和「自我提升 · 今日行动」的打卡项大量重复（根因见下，不是 bug 而是设计缺陷，顺带发现一个连带隐患）；②「我的项目」页卡片不可点击，无法查看项目详情。
> 本文包含调研结论 + 可直接执行的分步方案。**执行原则：只做本文列出的事，不要顺手重构、不要引入本文未列出的依赖、不要改数据模型。**
> 每个阶段完成后跑 `npm run build` + `npm run lint` 确认通过。项目是个人自用 PWA（React 19 + Vite + Tailwind v4 + Supabase + Vercel），稳定 > 完美。

---

## 问题一：健康打卡与自我提升打卡重复

### 根因（已核实，执行前先读这几处代码确认理解）

1. 「自我提升」一键导入时，**每个行动都会创建一条习惯**：`src/modules/growth/api.ts:29` `repository.createHabit({ name: p.title, icon: p.emoji, ... })`，行动通过 `habitId` 关联该习惯（`GrowthAction.habitId`，见 `src/lib/db/types.ts:83-95`、`supabase/migrations/008_growth_actions.sql:16`）。打卡数据统一落在 `wb_habit_logs`。
2. 「运动健康 · 今日打卡」列出**全部** active 习惯（`src/modules/health/health.tsx:40`），不做任何来源过滤 → 10 个行动习惯全部重复出现在健康页。
3. 同一份 habits 列表还有两个消费方：
   - **快速打卡**（`src/app/quick-capture.tsx` 打卡 tab）：一键给**所有** active 习惯 +1 —— 意味着点一下「打卡」，10 个自我提升行动也被全部打卡了。这是连带隐患，比重复展示更严重。
   - **习惯管理**（`src/modules/health/habit-manager.tsx`）：行动习惯和手工习惯混在一个列表里，且行动习惯可被误删（删掉后行动显示「未绑定打卡」，`src/modules/growth/growth.tsx:97` 有兜底但体验差）。

### 调研结论（习惯类 App 的成熟做法）

主流习惯/打卡类应用（Habitica 的 dailies 与 goals 分层、Loop Habit Tracker 的独立习惯、各类目标-习惯两级模型的讨论）通行的原则是：**一个习惯只有一个「归属入口」，打卡操作收敛到归属模块，其他地方只做只读展示**。习惯数据模型本身不复制，靠「归属标记 + 入口过滤」解决重复。对应到本项目：不需要动数据模型，只需要把「被行动绑定的习惯」从健康模块的三个入口里分离出去。

参考：[7 UI patterns from designing a habit-tracking app](https://uxdesign.cc/micro-habits-ui-design-patterns-4b2b7c1b4f07)、[Loop Habit Tracker](https://play.google.com/store/apps/details?id=org.isoron.uhabits)、[habit app 设计模式讨论](https://designmeetsai.substack.com/p/ritual-warmth-and-identity-what-habit)。

### 方案对比

| 方案 | 做法 | 结论 |
|---|---|---|
| A. 入口过滤（推荐） | 健康/快速打卡/习惯管理过滤掉被行动绑定的习惯，行动打卡收敛到「自我提升」 | 零数据迁移、改动 3 个组件 + 1 个纯函数，行为符合直觉 |
| B. 健康页分组展示 | 今日打卡里分「我的习惯」「成长行动」两组 | 重复仍在，只是视觉上分开，页面归属依旧混乱 |
| C. 行动独立打卡表 | GrowthAction 建自己的 log 表，不依赖 habits | 最干净但要新迁移 + 双 repository + 导入/统计全改，投入产出比最低，否决 |

### 方案 A 详细设计

**第 1 步：新建纯函数** `src/modules/health/derive.ts`：

```ts
import type { GrowthAction, Habit } from '../../lib/db/types'

/** 被任意状态行动绑定的习惯 id 集合（归属判定：结构关系，与行动 active/paused/done 无关） */
export function growthBoundHabitIds(actions: GrowthAction[]): Set<string> {
  return new Set(actions.map(a => a.habitId).filter((x): x is string => x != null))
}

/** 把习惯分成「健康自有」与「行动绑定」两组（今日打卡/快速打卡/习惯管理共用） */
export function partitionHabits(habits: Habit[], bound: Set<string>) {
  const own: Habit[] = [], linked: Habit[] = []
  for (const h of habits) (bound.has(h.id) ? linked : own).push(h)
  return { own, linked }
}
```

写 2-3 个 vitest 用例（`tests/` 下已有测试目录，仿照现有测试文件风格）：无行动时全归 own、部分绑定、habitId 为 null 的行动。

**第 2 步：健康「今日打卡」过滤**（`src/modules/health/health.tsx` `CheckinPanel`）：
- 引入 `useGrowthActions()`（从 `../growth/api` 导入，React Query 有缓存，代价为零）。
- 列表数据从 `habits.filter(h => h.active)` 改为 `partitionHabits(activeHabits, growthBoundHabitIds(actions ?? [])).own`。
- 当 `linked.length > 0` 时，列表底部加一行提示：`{linked.length} 项行动在「自我提升」中打卡`，用 `<Link to="/growth">` 跳转（样式参考 health.tsx 现有的 muted 小字）。

**第 3 步：快速打卡过滤**（`src/app/quick-capture.tsx` `addLog` mutationFn）：
- 在 `const habits = (await repository.listHabits()).filter(h => h.active)` 之后，追加 `const actions = await repository.listGrowthActions()`，用 `growthBoundHabitIds(actions)` 过滤掉行动习惯。
- 全部习惯都被过滤掉时（用户还没建自有习惯），`Promise.all([])` 正常结束，toast 文案「今日习惯已打卡」会失真——把 toast 改为：过滤后无可打卡习惯时 `toast.info('今日习惯已全部完成')` 之类，执行时看现有文案风格定。

**第 4 步：习惯管理分组**（`src/modules/health/habit-manager.tsx`）：
- 用 `partitionHabits` 把列表分成两组。自有习惯组保持现状（可删除）。
- 行动绑定组单独一个 section，标题「由「自我提升」管理」，条目**不渲染删除按钮**，行尾加一个 `<Link to="/growth">` 小箭头或「前往管理 →」文字链接。
- 组为空时不渲染该 section。

**第 5 步（明确不改，防止执行 agent 发挥）**：
- `useHabitStats` / `HeatmapCard`（首页热力图和「今日完成 N 次打卡」）**保持包含行动打卡**——它是全局活跃度视图，不去重。
- 首页 `GrowthCard`（`src/modules/growth/cards.tsx`）保持现状——它是「自我提升」的首页小组件，属于合理的只读+快捷打卡预览面。
- 「自我提升」模块（`growth.tsx`）完全不动。
- 不给 `Habit` 加 source 字段、不写任何数据库迁移。

**验收**：健康今日打卡只剩手工习惯 + 底部跳转提示；快速打卡不再波及行动习惯；习惯管理两个分组展示正确、行动习惯不可删除；删除一个行动绑定的习惯后 growth 页该行动显示「未绑定打卡」（既有兜底）；build/lint/test 通过。

---

## 问题二：「我的项目」卡片点击进入详情页

### 现状（已核实）

- 数据源：`/api/projects`（`api/projects.ts`）读私有仓库 `YHLLXY/Konwledge-home` 的 `30-项目/<目录>/<目录> - 门户口.md`，解析 frontmatter + 简介，返回摘要列表；失败降级到 `public/projects-status.json` 静态快照。
- 列表页 `src/modules/projects/projects.tsx` 的 `ProjectCard` 是纯 `<div>`，不可点击（`src/modules/projects/cards.tsx` 首页卡片同样）。
- 关键缺口：`ProjectInfo` 里只有 `name`（来自 frontmatter 的 `project` 字段），**没有知识库目录名 `dir`**，而详情接口必须按目录名寻址。
- 注意 `api/projects.ts` 头部注释的硬约束：**该文件必须保持单文件**（Vercel 函数环境不支持跨文件相对导入，2026-08-05 线上排障结论），新增逻辑必须写在这个文件里。

### 调研结论

1. **交互模式**：卡片网格 → 点击 → 详情页是标准的 master-detail 模式；移动端用整页路由（可分享 URL、返回键可用）优于弹层。参考：[Master/Detail Pattern Revisited](https://medium.com/@lucasurbas/case-study-master-detail-pattern-revisited-86c0ed7fc3e)、[Dashboard UX Patterns](https://www.pencilandpaper.io/articles/ux-pattern-analysis-data-dashboards)。
2. **Markdown 渲染**——详情页本质是渲染知识库的门户口 md。三个选项：
   - **服务端用 GitHub Markdown API 渲染（推荐）**：`POST https://api.github.com/markdown`（`{ text, mode: 'gfm' }`），返回 GitHub 官方渲染 + **官方消毒**的 HTML，客户端零新增依赖、零新增包体积。项目此前为移动端首屏专门砍过 312KB（recharts → SVG），这个优势是决定性的。且 `api/projects.ts` 已持有 `GITHUB_TOKEN`、必须单文件，服务端渲染完全契合。参考：[GitHub Markdown REST API 官方文档](https://docs.github.com/v3/markdown)、[渲染实战](https://til.simonwillison.net/markdown/github-markdown-api)。
   - 客户端 `marked`（约 12KB gzip）+ DOMPurify 消毒——`marked` 自身不消毒，`sanitize` 选项已废弃不足靠，必须配消毒器。参考：[Snyk 对 marked sanitize 的分析](https://snyk.io/blog/marked-xss-vulnerability/)、[DOMPurify](https://github.com/cure53/dompurify)。
   - `react-markdown`（约 33KB gzip）默认安全但体积最大，参考：[react-markdown](https://github.com/remarkjs/react-markdown)、[体积对比](https://www.pkgpulse.com/compare/markdown-it-vs-marked)。
3. **内容边界**：项目「详情」的可信来源就是门户 md 本身（它含简介、现状、步骤等）。**编辑入口做跳转而不是内置编辑器**——知识库是唯一事实源，工作台只做镜像视图，避免双写。GitHub 侧成熟做法是给 `github.dev` / `github.com` 的 blob/tree 链接。参考：[GitHub 开发者作品集模式](https://www.geeksforgeeks.org/blogs/how-to-build-a-awesome-github-developer-portfolio/)。

### 详细设计

**第 1 步：`ProjectInfo` 增加 `dir` 字段（类型三处同步）**
- `api/projects.ts`：`ProjectInfo` 接口加 `dir: string`；`parseGateway` 加参数 `dir`（= GitHub 目录名）返回时带上；`fetchFromGithub` 调用处传 `dir.name`；`FALLBACK_PROJECTS` 每条补 `dir`（值先用与 name 相同的字符串，之后你自己在知识库核对目录名后可修正——**名称含中文没关系，前后端都 encodeURIComponent**）。
- `src/modules/projects/api.ts`：`ProjectInfo` 接口同步加 `dir: string`。
- `public/projects-status.json`：每条项目补 `dir` 字段（与 FALLBACK_PROJECTS 一致）。
- 兼容：详情页取目录名用 `p.dir ?? p.name`（防止 CDN 上还缓存着旧的无 dir 响应）。

**第 2 步：`api/projects.ts` 增加详情入口（仍单文件）**
- handler 改为读 `req.query.entry`：
  - 无 `entry` → 现有列表逻辑不动（完全向后兼容）。
  - `entry=detail&dir=<目录名>` → 新逻辑：
    1. **鉴权**：仿照 `api/reminders.ts:115-122` 的 `authUser(req)`（anon client `auth.getUser(token)` 校验 Authorization Bearer JWT），失败返回 401。原因：列表接口本就公开（既有事实，本文不扩大处理），但详情返回整篇私有知识库文档，是新增暴露面，必须鉴权。
    2. `ghJson('30-项目/<dir>')` 列目录（8s 超时，仿现有写法），找不到该目录 → 404 `{ error: 'not_found' }`；找不到门户口文件 → 404 `{ error: 'no_gateway' }`。
    3. 取门户口 md 内容（base64 解码，仿现有 `ghFile`）。
    4. `fetch('https://api.github.com/markdown', { method: 'POST', headers: ghHeaders(token), body: JSON.stringify({ text: md, mode: 'gfm' }) })` → 返回 HTML 字符串。渲染失败（非 200）时降级返回原文 `markdown` 字段 + `rendered: false`，前端自行处理。
    5. 同时返回 `files: entries.filter(e => e.type==='file').map(e => ({ name: e.name, path: e.path }))`（目录内文件清单，前端渲染成「目录内文档」链接列表）。
    6. 返回 `{ dir, name, html, rendered, files, gatewayPath }`，`Cache-Control: private, s-maxage=600`（**必须带 private**：内容因鉴权而因人而异，不能共享缓存）。
  - `GITHUB_TOKEN` 缺失时 detail 直接 503 `{ error: 'unavailable' }`（快照里没有详情内容，无法降级）。
- `x-github-api-version`、user-agent 沿用现有 `ghHeaders`。

**第 3 步：新建详情页** `src/modules/projects/project-detail.tsx`
- 路由参数 `:name`（即 `dir`）。用 `useParams` 取值，`useQuery({ queryKey: ['project-detail', dir], queryFn: fetchDetail, staleTime: 10 * 60 * 1000 })`。
- `fetchDetail`：先从 `useProjects()` 的缓存数据里拿对应项目的 `dir/name/emoji/phase/stack/updatedAt/summary` 渲染头部（列表页数据已在缓存，详情秒开）；再请求 `/api/projects?entry=detail&dir=...` 拿正文。**鉴权头**：用 `src/lib/db/supabase-client.ts` 导出的 client `await client.auth.getSession()` 取 `session.access_token`，有就带 `Authorization: Bearer <token>`；本地模式无会话则不带，收到 401/503 时正文区降级显示「详情需登录且联网，可到 GitHub 查看」+ 下方 GitHub 链接按钮。
- 页面结构（自上而下）：
  1. 返回按钮（`navigate(-1)` 或 Link to `/projects`，样式参考其他子页）+ 标题区：emoji、name、phase 徽章（复用 projects.tsx 的 `PHASE_STYLE`——把这个常量和 `fmtDate` 从 projects.tsx 抽到 `src/modules/projects/shared.ts` 共用，避免复制）、更新时间、stack Badge、aliases。
  2. 正文：`rendered === true` 时 `<div className="md-body" dangerouslySetInnerHTML={{ __html: html }} />`；`rendered === false` 时显示 `<pre className="whitespace-pre-wrap text-xs">` 原文。
  3. 「目录内文档」小节：`files.map(...)` 每项一个外链 `https://github.com/YHLLXY/Konwledge-home/blob/main/<encodeURIComponent(path)>`（path 已含目录，逐段编码或整段 encodeURI，注意保留 `/`）。
  4. 底部操作区两个按钮：「在 GitHub 打开」（`https://github.com/YHLLXY/Konwledge-home/tree/main/30-项目/<encodeURIComponent(dir)>`）、「编辑门户口」（`https://github.dev/YHLLXY/Konwledge-home/blob/main/30-项目/<encodeURIComponent(dir)>/<encodeURIComponent('<dir> - 门户口.md')>`——编辑回答"能否修改"：修改发生在知识库，10 分钟 CDN 缓存过期后工作台自动同步）。
  5. Loading 用 Skeleton（仿 projects.tsx），错误态文案 + 重试。
- `.md-body` 排版样式：项目没有 @tailwindcss/typography，**手写约 25 行 scoped 样式**（放 index.css 或组件内 `<style>` 外的 className 组合均可，按项目现有样式组织方式来），覆盖 `h1/h2/h3/p/ul/ol/li/blockquote/code/pre/table/a/img` 的字号、间距、`code` 用 muted 底色圆角、`a` 用 `text-primary`。不要为此引入 typography 插件或任何新依赖。

**第 4 步：接线**
- `src/App.tsx:37-39` 的 Guard 块内、catch-all 之前加：`<Route path="/projects/:name" element={<ProjectDetail />} />`。懒加载方式与 registry 现有子模块的 lazy 处理保持一致（查 `src/registry.ts` 里组件是怎么包 lazy/lazyRetry 的，照抄同样包装）。
- `src/modules/projects/projects.tsx`：`ProjectCard` 外层包 `<Link to={`/projects/${encodeURIComponent(p.dir ?? p.name)}`}>`，卡片加 `hover:border-primary/50 transition-colors` + 标题行尾 ChevronRight（仿 `growth.tsx:136-141` 行动卡片的可点击样式）。
- `src/modules/projects/cards.tsx`（首页卡片）：三行项目条目同样改成 Link 跳详情（encodeURIComponent 同上）。可选，做了更好。

**第 5 步（明确不做）**：不给非 GitHub 项目拉 commits/星标等活数据（知识库 frontmatter 没有 repo 映射字段，以后你想加，在门户口 frontmatter 加 `repo:` 再说）；不做内置编辑器；不改列表接口的公开性（如要收紧另行立项）。

**验收**：列表卡片可点击进入 `/projects/<dir>`；详情页头部信息秒开（缓存）、正文数秒内渲染；未登录或断网时正文区优雅降级且 GitHub 链接可用；旧缓存（无 dir 字段）不白屏；build/lint 通过；`/api/projects`（无参）行为与现在完全一致。

---

## 执行顺序与汇报

1. 问题一全部（纯前端，风险低）→ build + 手动冒烟：健康打卡、快速打卡、习惯管理、自我提升打卡互相不影响。
2. 问题二第 1、2 步（API 与类型）→ 本地 `vercel dev` 或部署预览环境验证 `/api/projects?entry=detail&dir=个人工作台` 返回 401（无 token）/ 200（带 token）。
3. 问题二第 3、4 步（前端）→ 手动冒烟：点卡片、返回、离线降级、移动端宽度。
4. 分 commit 提交（`feat(health): 打卡入口去重…` / `feat(projects): 详情页…`），汇报格式：每步一行——改了哪些文件、怎么验证的、有没有遇到与本文档不符的代码现实（遇到时**以实际代码为准并记录**，不要硬套文档）。
