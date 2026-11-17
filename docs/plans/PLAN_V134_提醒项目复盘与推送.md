# 计划：v1.34 六项修复与体验优化（2026-11-17）

> 调研依据：`RESEARCH_2026-11-17_通知推送.md`、`RESEARCH_2026-11-17_交互与信息呈现.md`
> 判级：fix + feat 混合 → **minor（v1.34.0）**。分 3 个 commit 落地，任一环节可单独回滚。
> 前置：体积门禁已降级为体检（2026-11-16），本批**不受 KB 约束**。
> 本文档经过第二轮独立审阅（对照代码逐条核实），修订记录见文末 §9。

## 0. 一句话

把「用户做了动作 → 界面立刻给出结果」补上：提醒完成即消失、刷新有回音、生成有待办可看；顺带把
项目详情从「一堵文字墙」改成可读的文档，并让安卓用户真正能收到推送。

---

## A. 提醒中心（图一 / 图二）

### 现状根因
- 列表是**服务端派生**的（`/api/check-reminders`），完成只 invalidate `taskKeys`，**没有动 `reminderKeys`**；
  提醒行要等下一轮服务端扫描才消失 → 观感就是「点了完成，卡片赖着不走」。
- 三个胶囊是 `<span>`，**只是计数，不可点**（图二）。

### 设计原则：提醒行只是任务的投影，且只允许一个投影

第一版计划打算「乐观地从 `['reminders']` 缓存里删掉那一行」。复核发现两处硬伤：

1. **30 秒后会复活**：`useReminders` 的 staleTime 是 30s，重新 refetch 时服务端还没扫描、行还在库里；
2. **推送照发**：更严重的是服务端 `liveRefKeys` 判任务存活**只看 status**（`api/reminders.ts:88-95`），
   而生成节点要求 **dueDate + dueTime 都有**（`:49-54`）。用户把提醒时间清空后（`task-dialog.tsx:124`），
   行永远不删、**到点仍然推送**。不改这条，UI 只是把「卡片赖着不走」换成「卡片没了、手机照响」。

所以要做的是**把派生关系真正落到渲染层，并让唯一的投影同时服务列表/角标/横幅/排序**。

### 改动
| 文件 | 改动 |
|---|---|
| `src/modules/reminders/format.ts` | 新增 `taskReminderAt(dueDate, dueTime): string \| null`（按 +08:00 推出该任务的提醒时刻，与 server `shanghaiMs` 同口径；无 dueDate/dueTime → null）与 `effectiveRows(reminders, refs, now)`：① task 行用推导时刻覆盖 `scheduledAt`（任务改期立刻生效）；② task 已完成（**用 `isDoneForToday`，重复任务 status 仍是 todo**）、任务不存在、无 dueTime → 该行不出现；③ **exam/goal 行原样透传**（保留 `missing` 降级文案，`tests/reminders-format.test.ts:79` 已钉住）；④ `tasks === undefined`（还在加载）时**不过滤**，避免首帧闪空 |
| `src/modules/reminders/api.ts` | 新增 `useReminderView()`：`useReminders() + useTasks() + useExams() + useStudyGoals()` → 返回 `effectiveRows` 与 `countDue` 的结果；**侧边栏角标（`useReminderSync`）改用它**，否则角标与列表各算各的（v1.31 修过的「两个数对不上」原样复发） |
| `src/lib/task-rules.ts`（新） | 把 `isDoneForToday` 从 `modules/overview/api.ts` 挪进来（纯函数，三处引用跟着改），并新增 `completionPatch(t, today)`：把 `today-tasks.tsx:40-66` 里「重复任务滚动 / 普通任务 done」的分支抽成纯函数，返回 `{ patch, nextDue? }`。**两处完成入口从此共用同一条规则** |
| `src/modules/reminders/reminders-center.tsx` | ① 胶囊改筛选按钮（全部/已逾期/待处理/即将到来），`aria-pressed`，再点一次取消；② 完成走 `completionPatch` + toast（重复任务滚动、普通任务 done）——**不能写死 `status:'done'`**，否则从提醒中心完成一个每日任务会**终结整条序列**；③ 排序/计数/行内时刻全部改用 `effectiveRows` 的产物；④ 按钮 pending 时禁用 |
| `api/reminders.ts` | **服务端同步修**：`liveRefKeys` 对 task 增加 `&& t.dueDate && t.dueTime`（与 `computeReminders` 同条件），让「清空提醒时间」真的删行；exam/goal 不动（考试节点发完就不在 computed 里，不能一律删——`tests/reminders.test.ts:148-155` 是保护） |
| `tests/reminders.test.ts` / `tests/reminders-format.test.ts` | 补：清空 dueTime → 行被删；effectiveRows 的四种输入（done / repeat 当天已完成 / 无 dueTime / 任务未加载） |

### 验收
- 单测覆盖上述四类 + 时区（+08:00）。
- E2E：在提醒中心点「完成」→ **1 秒内**该行不可见（乐观更新是同步的，但不要断言节点被移除，CI 会闪）。
- 手动：完成一个**每日重复任务**后，明日仍会出现（序列没被终结）。
- 手动：任务清空提醒时间后，列表消失 → 到点不再推送。

---

## B. 项目列表「刷新」无反馈（图三）

### 根因
`refetch()` 只有图标转圈；服务端 `Cache-Control: s-maxage=600`（`api/projects.ts:18,268`）+ 客户端 `staleTime 10min`（`projects/api.ts:51`），
多数时候数据不变 → 用户看不到任何变化。且 `loadProjects` 在 API 失败时**静默回退静态快照并当成功返回**（`:32-45`），
所以「刷新失败」这条文案几乎不可达。

### 改动
`src/modules/projects/projects.tsx`
- 点击后按**接口自带的 `data.updatedAt`**（服务端生成时刻）判断文案，三条都可达：
  - `updatedAt` 变了 → `已更新 · N 个项目（生成于 HH:mm）`
  - 没变 → `服务端未更新 · 生成于 HH:mm（最长缓存 10 分钟）`
  - `source === 'fallback'` → `网络不可用，当前为离线快照`
- **不要用 `dataUpdatedAt` 当「数据更新于」**——那是客户端收到的时刻，CDN 给 10 分钟前的副本时它照样显示当前时间。
- 状态行加 `aria-live="polite"`。

### 验收
- E2E：点刷新 → 出现 toast，文案含「刷新/生成于」；断网时出现「离线快照」。
- 不新增依赖。

---

## C. 交互与动效（全局）

### 现状更正
`components/ui/button.tsx:7` **已有** `active:not-aria-[haspopup]:translate-y-px`（按压位移），所以不是「缺少按压反馈」，
而是**动效没有统一节奏**：页面进入、卡片 stagger、勾选弹跳各自为政；浮层没有进出场；骨架直接硬切。

### 改动（全部 CSS/组件级，不引库）
| 位置 | 改动 |
|---|---|
| `src/index.css` | 新增 duration/easing token（`--ease-out-soft` 等）；`.sheet-enter`（快速捕获自下而上 220ms）；`.fade-rise`（骨架→内容 150ms 淡入）；全部包在 `prefers-reduced-motion` 保护里 |
| `src/app/quick-capture.tsx` | 浮层套 `.sheet-enter` |
| `src/modules/projects/projects.tsx`、首页卡片 | 骨架容器加淡出 |

**不做**：提醒行的退场动画——A 段是「投影即时消失」，加 160ms 退场会和「同一帧消失」矛盾（第一版计划里自相矛盾，已删）。

### 验收
- `emulateMedia({ reducedMotion: 'reduce' })` 下无动画（Playwright 断言）。
- 无 CLS 回退；不新增 JS 依赖。

---

## D. 项目详情可读性（图四）

### 根因（已定位）
`api/projects.ts` 的 `fetchDetail` 把**含 YAML frontmatter 的整篇 markdown** 交给 GitHub Markdown API（`:222-233`），
`---` 与缩进的 YAML 被渲染成正文顶部的一串列表项。

### 改动
| 文件 | 改动 |
|---|---|
| `api/projects.ts` | 新增 `stripFrontmatter(md)`：**复用 `parseGateway` 已有的正则形态** `^---\r?\n([\s\S]*?)\r?\n---`（`:96`），剥掉后再 `replace(/^\r?\n/, '')`；**html 与 markdown 降级两条分支都要剥**（`:233` 的 `markdown: html == null ? md : null` 用的是同一份 md）。处理 BOM（`:222` 的 `toString('utf-8')` 可能带 BOM）。 |
| `src/index.css` | `.md-body` 改造（**已存在**，`:112-130`，不是新建）：行高 1.8、`h1` 降级（页面已有大标题）、`h2` 左侧色条（现在只有 `border-bottom`）、图片/引用/代码统一次寸。**表格只能靠 CSS**：`table{display:block;overflow-x:auto}`——`dangerouslySetInnerHTML` 下没有 React 节点可以包 div。 |
| `project-detail.tsx` | 「回到顶部」要滚 **`main`**（`layout.tsx:124`），不是 window；仅在正文超长时出现 |

### 验收
- 单测：`stripFrontmatter` 覆盖「有/无 frontmatter」「CRLF」「文件以 `---` 结尾无换行」「带 BOM」四种。
  ⚠️ 现有测试没有 handler 级覆盖（`tests/projects-detail.test.tsx` mock 的是 URL），新函数必须自带单测。
- 截图：生日礼物-PCB 详情页顶部不再出现 `date:/tags:`；表格不撑破页面。

---

## E. 复盘页（图五）

### 现状根因
1. 「已生成明日待办」只弹 toast；条目 dueDate=明天，**今日待办里根本看不到** → 用户认为没生效。
2. `generatedRef` 只是会话内 Set（`review.tsx:24`），刷新后可重复生成。
3. 折叠区默认态写死：编辑旧复盘时字段是收起的，看不到写过什么。

### 改动
| 文件 | 改动 |
|---|---|
| `review-utils.ts` | `parsePlan` 增加：去重、去掉列表符号（`- `/`1. `）、过滤纯标点。**拆分规则保持原样（含 `，`）**——`tests/review-plan.test.ts:15` 已把 `复习数学，背单词，跑步` 拆三条钉死；「先写代码，再跑步」这类误拆由**可编辑预览**兜住。新增 `existingTitles(tasks, due)` |
| `review.tsx` | ① 生成改两段式：先展开**可编辑预览**（每条一个 checkbox + 文本，默认全选），确认后创建；② 成功后**就地列出生成了哪几条**（带「明天」徽章）+「去待办查看」链接——用户必须当场看见东西真的进去了；③ 去重只对**已存在**任务生效（批内保留，一天两次「背单词」是合法用法），结果卡片显示「跳过 M 条（已存在）」；④ 折叠区默认态 = 该字段有内容则展开；用户手动切换后按日期存 localStorage；⑤ PC 端两栏（左输入 / 右汇总+历史），移动端单栏 |
| 按钮禁用 | `generatedRef` 不能直接删——它同时承担 `review.tsx:192` 的 `disabled`。改为「本次已生成 OR 预览为空」双条件 |

### 验收
- 单测：`parsePlan` 去重/去符号（不破坏现有 10 条用例）；`existingTitles` 命中/不命中。
- E2E：写计划 → 预览 → 生成 → 结果卡片出现 → 点链接到 /tasks 能看到；再次生成提示「已存在」。

---

## F. 通知推送（图六）

### 结论（详见调研）
安卓大陆「不挂后台」只能靠**厂商通道**。Server酱³ 走的正是厂商通道，官方提供独立 API；
SCT→SC3 的转发存在但**会加广告、声明最多三年**，因此直接接 SC3。

### 改动
| 文件 | 改动 |
|---|---|
| `api/reminders.ts` | 新增 `serverchanEndpoint(key)`：前缀 **忽略大小写** 匹配 `/^sctp(\d+)t/i` → `https://<uid>.push.ft07.com/send/<key>.send`（**URL 里的 key 保持原样，区分大小写**），否则沿用 SCT；`sendDue` 与 `sendTest` 共用。**绝对不能新增 channel id**——`sent_channels` 的记账键是 `serverchan`（`:140,346,399`），新增一个 id 会让同一行按两个通道各发一次。 |
| `src/modules/me/notifications-section.tsx` | 真正要改的是**文案与入口**：`:180` 标题、`:187` 的 `sct.ftqq.com` 链接指向 SC3、`:73` 的 `CHANNEL_CN`。安卓 FCM 不可用的提示**已存在**（`:156,174`），别重复加；placeholder 已经是 `sctp…`（`:184`） |
| 无迁移 | `wb_channel_configs.serverchan_key` 复用，key 形态决定端点 |

### 验收
- 单测：`serverchanEndpoint` 覆盖 `sctp123txxx` / `SCTP123Txxx`（大写也识别）/ `SCTxxx` / 空值 / 含特殊字符。
- **响应契约**：现在只认 `j.code === 0`（`:381`），SC3 若返回不同形状会静默判失败 → 「测试发送」必须回显服务端原文（`:382` 已有错误文本），真机验证时以它为准。
- 真机：SC3 SendKey 点「测试发送」→ 手机（App 可被杀）收到；杀后台 5 分钟再发仍收到。

---

## 实施顺序与提交

1. `fix(reminders)`：A（含服务端 liveRefKeys + 前端唯一投影 + 筛选 + 完成逻辑复用）。
2. `fix(projects,review)`：B + E 的缺陷部分 + D 的 stripFrontmatter（含单测）。
3. `feat(ui,notify)`：C 动效 + D 排版 + F SC3 通道。

每步都跑：`npm test` + `npm run build` + `npm run lint` + 相关 E2E；最后统一 `npx playwright test`。

## 不在本次范围

- 路由级 View Transition（调研评估过：风险大收益小）。
- 自建 ntfy（需要一台常开机器，等用户决定）。
- 提醒中心的「未送达原因」展开（要服务端回传 per-channel 状态，属于另一轮）。
- 项目详情的目录/TOC（先看排版效果）。

## 需要你拍板的四件事

1. **推送**：接受「手机装 Server酱³ App 并登录一次」（免费额度约 200 条/天）吗？还是宁愿自建 ntfy（需要一台常开机器）？
2. **明日待办**：生成到「明天」按现状保留（结果卡片给「去待办查看」入口），可以吗？
3. **动效强度**：克制（150–220ms、只做必要进出场）还是更明显？
4. **提醒完成**：要不要加「撤销」（toast 上一颗按钮，5 秒内可回退）？

---

## 9. 修订记录（第二轮独立审阅后）

第一版计划有 8 处会在实现时变成真问题，已全部改掉：

| # | 原计划 | 问题 | 现在 |
|---|---|---|---|
| 1 | 只改前端过滤 | 服务端不删「对象活、节点没了」的行 → 列表没有、手机照推 | 同步改 `liveRefKeys` |
| 2 | 只改提醒列表 | 角标/横幅/排序/行内时刻仍用旧值 → 数字对不上 | 抽 `useReminderView` 单一投影 |
| 3 | 完成写死 `status:'done'` | 重复任务会被终结整条序列 | 抽 `completionPatch` 纯函数，两个入口共用 |
| 4 | 提醒行加 160ms 退场 | 与「同一帧消失」矛盾 | 取消退场动画 |
| 5 | 用 div 包表格 | `dangerouslySetInnerHTML` 下做不到 | 纯 CSS `table{display:block}` |
| 6 | 新正则剥 frontmatter | 要求尾换行，文件以 `---` 结尾时失效；降级分支漏剥 | 复用 `parseGateway` 的正则，两条分支都剥 |
| 7 | 想加 `serverchan3` 通道 | 按通道记账会把同一行发两次 | 保持 key=serverchan，只换端点 |
| 8 | 「已是最新」toast | 服务端 10 分钟缓存 + 静默回退快照 → 文案说谎 | 用 `data.updatedAt`/`source` 三条可达文案 |
