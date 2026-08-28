# 修复计划（基于对 CODE_REVIEW_ISSUES.md 的逐条核查）

> 本计划由独立核查产生：72 条问题中约 1/3 不属实或前提错误，多数"属实"项在个人自用场景下无实际损害。
> **执行原则：只修下列明确列出的问题，其余一律不动。** 不要"顺手重构"，不要改没列出的代码。
> 每完成一个阶段跑一次 `npm run build`（或项目的 typecheck 命令）确认无编译错误。
> 项目定位：个人自用 PWA（React + Supabase + Vercel），稳定 > 完美。

---

## 总体结论（不要被原报告误导）

- 原 5 条 CRITICAL：**C3、C5 不存在**（pomodoro 有守卫不会重复写库；hot.tsx 有完整 try/catch）；C1 的"静默放行"方向搞反了（实际是 fail-closed 全拒绝）；C2、C4 属实但严重度低，顺手加固。
- 原 26 条 HIGH：真正需要修的只有 **H8（moveFolder 循环引用）**，这是全清单里唯一的真实功能性数据损坏风险。
- 原 31 条 MEDIUM：值得修的只有 **M6、M27**，顺手修 M15、M5、M28。
- 明确**不用修**的代表性条目（已核实为不属实或无损害）：C3、C5、H5（sources 是白名单筛选，无 SSRF）、H9（不动点算法必然终止）、H12（有 fallback）、H13/H25/M25（前提错误）、H18（是 setTimeout 且有 cleanup）、H26（三个入口都有 Bearer 鉴权）、M3（有 ErrorBoundary + React Query 兜底）、M10（有随机后缀）、M14（根本没有 storage 监听）、M17/M22/M23/M26（描述与代码不符）、L3/L8/L9（不属实）。

---

## 阶段一：真实功能 Bug（必须修）

### 1. H8 — moveFolder 无循环引用检查（唯一的高优先级）

**文件**：`src/lib/db/supabase-repository.ts:207-210`、`src/lib/db/local-repository.ts:125` 附近

**问题**：把文件夹 A 移动到它自己的子孙文件夹 B 下会形成环。Supabase 版连"移动到自己"都没检查；local 版只查了自己。环一旦形成，文件夹树渲染和子树遍历会出问题，云端数据需手工修复。

**修法**（两处 repository 都要改）：
1. `newParentId === id` 时抛错（Supabase 版目前缺这条）。
2. `newParentId !== null` 时，从 `newParentId` 沿 `parentId` 向上遍历祖先链，若途中遇到 `id`，说明目标父级是被移动文件夹的子孙 → 抛 `new Error('不能移动到自己的子文件夹内')`。遍历需要先拿到全部 folders（Supabase 版用 `select('id, parent_id')` 全量拉取即可，个人项目文件夹数量级很小），并设一个安全上限（如 1000 次迭代）防御脏数据。
3. 抽成共享函数放在 `src/lib/db/` 下（如 `folder-tree.ts` 的 `assertNoCycle(folders, id, newParentId)`），两个 repository 共用，local 版替换掉现有的只查自身的判断。
4. UI 侧：调用处（搜 `moveFolder` 的调用方）把抛出的错误 toast 出来即可，不用改交互。

**验收**：A→B、B→A 的往返移动被拒绝并提示；普通移动不受影响；`npm run build` 通过。

### 2. M27 — 离线时热点页无限后台重试

**文件**：`src/modules/news/hot.tsx:26`

**问题**：`if (r.stale) load(true, true)` —— 网络持续不可用且缓存过期时，`loadHot` 每次都返回 `stale:true`，形成无限后台请求循环（耗电、刷日志）。

**修法**：加一个 `useRef(false)` 标志（如 `staleRetriedRef`），只在首次发现 `stale` 时重试一次；重试后无论结果如何不再触发。或者给 retry 加计数上限（如 2 次）。组件卸载时不需要特殊处理（effect 已有依赖）。

### 3. M6 — 复盘摘要 tasksTotal 语义错误

**文件**：`src/lib/review-summary.ts:25`

**问题**：`tasksTotal` 统计的是**全部历史**已完成任务数，而 `tasksDone` 只统计当日，导致当日摘要里的"完成率"比值无意义。

**修法**：先看这个函数的消费方（grep `tasksTotal`），确认展示语义：
- 若用于"当日完成 / 当日应完成"，`tasksTotal` 应改为**当日范围内**的任务总数（当日 due、当日 focus、逾期的任务数，口径与 `src/app/overview-summary.tsx` / `src/modules/overview/api.ts` 的 `todayTasks` 一致），`tasksDone` 取其中 status === 'done' 的数量。
- 若消费方根本没展示这个比值，则直接删掉 `tasksTotal` 字段及其展示处，比错误数据更好。
- 执行 agent 不要发明新口径：以上两种二选一，优先看现有 UI 文案（"完成率"/"x/y"）决定。

### 4. M15 — 快速打卡串行网络请求

**文件**：`src/app/quick-capture.tsx:44-51`

**问题**：`for (const h of habits) { await repository.setHabitLog(...) }` 逐条串行 await，云端模式每次一条网络往返。

**修法**：改为 `await Promise.all(habits.map(h => ...))`。注意保持原有的筛选逻辑（哪些习惯需要打卡）不变，只改并发方式。外层的 listHabits/listHabitLogs 两次前置查询保持不动（依赖数据，不值得为它改接口）。

---

## 阶段二：安全加固（低成本、值得做）

### 5. C2 — SW push openWindow 加 origin 校验

**文件**：`src/sw.ts:66-77`

**修法**（约 3 行）：
```ts
const raw = (event.notification.data as { url?: string } | undefined)?.url ?? '/reminders'
const url = new URL(raw, self.location.origin)
if (url.origin !== self.location.origin) url.href = self.location.origin + '/reminders'
```
即：相对路径正常解析；外部 origin 一律回落到 `/reminders`。包 try/catch 兜底（构造失败也回落）。

### 6. C1 — CRON_SECRET 改常数时间比较

**文件**：`api/reminders.ts:280`

**修法**：保持 fail-closed 语义不变（env 缺失 = 全拒绝），只把 `!==` 换成常数时间比较：
```ts
import { timingSafeEqual } from 'crypto'
const expected = `Bearer ${process.env.CRON_SECRET ?? ''}`
const actual = req.headers.authorization ?? ''
const ok = expected.length === actual.length && timingSafeEqual(Buffer.from(expected), Buffer.from(actual))
if (!ok) return res.status(401).json({ error: 'unauthorized' })
```
长度不等时先短路（timingSafeEqual 要求等长）。**注意：不要引入 env 缺失时抛错的逻辑**，现有 fail-closed 设计是对的。

### 7. H2/H3 — API 500 错误不外泄 err.message

**文件**：`api/auth.ts:58`、`api/reminders.ts:300-303`

**修法**：两处的 `err.message` 返回改为固定文案 `internal error`，把原始 `err` 用 `console.error('[api/auth]', err)` 记到函数日志（Vercel dashboard 可查）。保持状态码 500 不变。不要动其他分支的业务错误返回（那些是有意的用户提示）。

### 8. H1 — resolve-phone 加简单限流（可选但建议）

**文件**：`api/auth.ts:41-53`

**问题**：未认证接口可枚举注册手机号并拿邮箱。个人自用真实风险中低，但邮箱泄露可被钓鱼利用。

**修法**：模块级内存 Map 做简陋 IP 限流即可（Serverless 下不精确但够用）：同一 IP 每分钟最多 5 次调用，超了返回 429。不要为此引入外部依赖。若嫌复杂，最小替代方案：手机号不存在时也返回 `{ ok: true, email: null }`（消除 200/404 区分）——**二选一，推荐限流方案**。

---

## 阶段三：数据一致性 / 小修（顺手修完）

### 9. C4 — 迁移策略幂等化

**文件**：`supabase/migrations/003_reminders.sql:42-53`（006 同样处理）

**修法**：给每条 `create policy` 前加 `drop policy if exists <name> on <table>;`。000 已经执行过、Supabase 有迁移记账，所以这个改动是纯防御性的——**不要重跑生产迁移，只改文件**。006 的动态块策略同样补 drop。注意：不要给 003 的策略改名（已在线上生效），只加 drop-if-exists。

### 10. H6 — backup TABLE_KEYS 与实际表清单同步

**文件**：`src/lib/backup.ts:16`

**修法**：TABLE_KEYS 增加 `'studyGoals'`、`'growthActions'`（键名以 `src/lib/db/supabase-repository.ts:83-87` TABLES 定义为准，先读再抄，别猜）。这样 `validateBackup` 会校验这两个 key 的数组类型。同时确认 `importAll` 对旧备份（缺这两个 key）的 `?? []` 兼容仍存在——存在就别动。

### 11. H14 — greeting 统一

**文件**：`src/app/daily-summary.tsx:27-32` 与 `src/app/layout.tsx:151-157`

**修法**：把 greeting 抽到一个共享位置（如 `src/app/daily-summary.tsx` 已 export，layout.tsx 改为 import 它），逻辑以 layout 版为准（含 0-6 点"夜深了"分支）。两处调用点删掉各自的本地实现。只做抽取，不改文案内容。

### 12. H15 — 考试卡片加载占位

**文件**：`src/modules/overview/overview-home.tsx:14`

**修法**：`const { data: exams, isLoading } = useExamsSoon()`，在 `nextExam` 判断处对 isLoading 期间渲染一个与考试卡片同尺寸的 Skeleton（项目里已有 Skeleton 组件，参考同文件第 39 行今日待办的写法）。如果加载期间本来就没什么可占位的空隙（卡片不在首屏），也可以选择不修——先看渲染位置再定，别硬塞。

### 13. M5 — 导入解析支持行内 keywords 数组

**文件**：`src/lib/parse-import.ts:46`

**修法**：在现有 `line.startsWith('  - ')` 分支之外，增加对 `keywords: [a, b]` 行内数组格式的识别（匹配 `keywords:` 前缀后按逗号 split、去引号方括号）。保持对多行列表的现有行为完全不变。加 2-3 个单测（项目若有测试目录；没有就写个临时脚本验证后删除）。

### 14. M28 — .gitignore 规则顺序

**文件**：`.gitignore:19,33`

**修法**：把第 33 行的 `.env*` 改得更精确（如 `.env.local`、`.env.*.local`），或把 19 行的 `!.env.test` 移到 `.env*` 之后。改完用 `git check-ignore .env.test` 确认不被忽略。**不要 git rm 任何已跟踪文件。**

### 15. L6 — Command Palette 关闭清空搜索词

**文件**：`src/app/command-palette.tsx:83-84` 附近

**修法**：关闭 palette 时（open 状态转 false 的 effect 或 onClose 回调里）`setQ('')`。一行改动。

### 16. H23 — papers 新建文件夹改用 Dialog（可选）

**文件**：`src/modules/news/papers.tsx:57-61`

**修法**：把 `window.prompt` 换成项目已有的 Dialog/输入弹窗模式（参考 add-paper.tsx 或其他模块的新建交互）。此项工作量为阶段三里最大，若 Dialog 模式在本文件没有现成先例，可跳过，保留 prompt 不是错误。

---

## 明确不修清单（执行 agent 勿动）

以下经核查为**不属实或无实际损害**，修改它们只会引入回归风险：

- C3（pomodoro 不会重复写库）、C5（hot.tsx 有 catch）、H5（无 SSRF）、H9（算法必然终止）、H12、H13、H18、H25、H26
- H4（外层被 8s 单源超时天然界定）、H7（仅双开标签同时导入的理论竞态）、H10（DB 有 PK 约束兜底）、H11/H17/H19/H20/H21（性能问题在个人数据量下无感知，useMemo 化属纯风格）
- H22（口径分歧无功能损害）、H24（有 catch 只是静默）、H16（报错可读性够用）、M1/M2（串行是有意降级设计或影响极小）
- M3、M7、M8、M9、M11、M12、M13、M14、M16、M17、M18、M19、M20、M21、M22、M24、M25、M26、M29、M30、M31
- L1-L5、L7-L10

**原则重申**：这个清单之外的问题（哪怕你在执行中发现新问题），一律只记录不改代码，最后在汇报里列出来。

---

## 执行顺序与验收

1. 阶段一（1-4）→ 跑 build + 手动冒烟：移动文件夹、热点页断网加载、当日复盘、快速打卡。
2. 阶段二（5-8）→ build；有条件的话本地起 dev 验证 /api 路由 401 行为不变。
3. 阶段三（9-16，16 可跳过）→ build。
4. 全部完成后：git 分支提交（如 `fix/code-review-batch`），按阶段分 commit，commit message 引用问题编号（如 `fix(H8): moveFolder 循环引用检查`）。
5. 汇报格式：每个问题编号一行 —— 修了什么文件、怎么验的、有没有发现新问题。
