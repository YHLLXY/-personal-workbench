# 升级方向调研与三阶段路线图（v1.24 → v1.26）

> 2026-09-06。背景：用户提出「功能已经够用，但还是不太满意」，要求全面摸底现状、找出可升级方向，再定计划。
> 摸底方法：changelog 全量回读（v1.0→v1.23.2）+ `CODE_REVIEW_ISSUES.md` 复核 + 两轮只读代码走查（①任务/学习/复盘模块与数据模型；②速记/健康/成长/壳层/资料库）+ 两轮成熟产品 Web 调研（Todoist / Things 3 / TickTick / Apple Reminders / Super Productivity / Vikunja / Loop Habit Tracker / Sunsama / Raycast / Linear / GitHub / Apple Health）。
> **结论：四个方向全部立项，按三阶段分期实施**。本文沉淀调研依据与分期理由；各阶段动工前另出 PLAN（第一阶段见 `PLAN_V124_TASK_SYSTEM.md`）。

---

## 一、现状诊断——「够用但不满意」的四个来源

工程质量本身已经很高（460 单测、双仓储契约、体积门禁、CI、源码零 TODO 残留），不满意的感受有具体来源：

### 1. 数据闭环断裂（最大空白）

数据都在产生，但互相脱钩，日常要靠手动搬运：

- 番茄钟专注记录 `FocusSession` 只有自由文本 `note`，**没有 taskId/goalId 外键**（`types.ts:20`）——「为某个目标专注了 40 分钟」系统不知道，任务和目标都看不到时间投入。
- 学习目标「拆解到今日待办」生成的任务与目标零关联（`goal-manager.tsx:32-42`），任务完成后目标进度不动；防重复靠内存 `brokenRef`，刷新即失效。
- 复盘「明日计划一键转待办」是单向的，生成的任务完成与否不回溯，昨日计划完成率无统计（`review.tsx:74-86`）；每日自动汇总只读展示、不入复盘。
- 成长行动的步骤勾选**只存 localStorage**（`action-detail.tsx:15-18`），换设备即丢；量化目标 `targets` 是纯文本字符串，填不了数值。
- 速记/热点不能转任务（全库 `createTask` 仅 3 处调用，无笔记→任务路径）；资料库论文导入后 `content: null`，全文搜索实际只覆盖手动粘贴的文案。

### 2. 任务系统缺「结构」——效率工具基本功缺失

- 无重复任务（recurrence）：周期性的事每天手动重建。
- 无子任务/清单；`sort` 字段存在但创建时写死 `Date.now()`（`supabase-repository.ts:116`），无拖拽排序。
- `doing` 状态在模型里存在但 UI 明确禁用（`task-dialog.tsx:28` 注释「仅暴露 todo/someday 两态」），是死字段。
- 永远只有「今天」一个视角：无日历/周视图；逾期只能顺延到今天（`today-tasks.tsx:97`）；将来收件箱是埋在页面最底部的折叠块（`today-tasks.tsx:175` 自注「全站唯一入口」）。

### 3. 全局搜索名不副实（感知最差）

顶栏搜索框占位文案是「搜索任务、笔记、热点…」（`layout.tsx:107`），但命令面板只匹配命令名与模块名，**完全不查任务/笔记/论文内容**（`command-palette.tsx:41-79`）。承诺与实现的落差，每次使用都被提醒一次。

### 4. 只记不看——可视化空白

- 体重/睡眠/运动只有最近 20 条文字列表（`health.tsx:96-104`）；全站唯一图表是任务/专注的周趋势（`weekly-trend-chart.tsx`），与健康指标无关；无趋势图、无目标线。
- 番茄钟历史只有今天最近 8 条（`pomodoro.tsx:219`），无周/月统计。
- 首页卡片顺序/跨度硬编码在 `registry.ts:52-131`，用户侧无任何设置 UI。

---

## 二、成熟产品调研结论（七主题）

### 2.1 重复任务：同一行滚动，跳过不补

**成熟产品的共同做法**：
- 「完成 → 推到下一次」是统一交互，但底层两派：Todoist 同一行复用（完成时日期推进）；Things 3 是「模板+拷贝」。
- **双锚点是业界标配**：Todoist `every`（按计划日推）vs `every!`（按完成日推）；TickTick 官方提供 "Repeat upon completion date" 开关。
- **逾期一律跳过不补**：没有主流产品默认补做欠下的份数；补救靠手动改期。
- 「编辑这一份 vs 编辑系列」：Things 靠模板/拷贝天然分离；Todoist 因同一行，改规则自然作用于未来；「只改这份」等价于先把这份 detach 成普通任务。
- 开源极简样本 Vikunja：仅 `repeat_after` + `repeat_mode` 两字段，同一行复用——证明简单模型可用。

**本项目决策**：简单枚举 `TaskRepeat { freq: 'daily'|'weekly'|'monthly', interval, weekdays?, anchor: 'due'|'complete' }`，**同一行滚动**（Vikunja 模型），完成时推进 dueDate 并留 `completedAt`（当日已完成区可见、可撤销），逾期跳过不补。rrule.js（8-10KB gzip）否决。

来源：[Todoist recurring dates](https://www.todoist.com/help/todoist/features/introduction-to-recurring-dates-YUYVJJAV) / [Todoist 完成重复任务](https://www.todoist.com/help/todoist/features/complete-a-task-with-a-recurring-date-dmI6SVqdP) / [Things repeating](https://culturedcode.com/things/support/articles/2803564/) / [TickTick 按完成日重复](https://blog.ticktick.com/2013/10/29/repeat-your-tasks-upon-completion-date/) / [Vikunja API](https://try.vikunja.io/api/v1/docs) / [Martin Fowler: Recurring Events](https://martinfowler.com/apsupp/recurring.pdf)

### 2.2 清单 vs 子任务：checklist 流派胜出

- Todoist：子任务 = 完整任务行（parent_id，有自己的日期/优先级/标签）。
- Things 3：checklist = 任务内轻量勾选项，无日期无标签，不进 Today——定位是「购物清单/流程步骤」。
- TickTick 两者都有，且 check items 自动算完成进度百分比；「清单项提升为任务」在 ClickUp/HeroCoders 是明确的单向转换功能。

**本项目决策**：选 Things/TickTick 的 **checklist 流派**——`Task.checklist: { id, text, done }[]` 一个数组，零新表、零递归渲染、零「子任务出现在哪些视图」的一致性问题；行内显示 x/y 进度；全勾完不自动完成父任务（TickTick 同款）。子任务树（Todoist 流派）复杂度翻倍且单用户场景收益低，明确不做。

来源：[Todoist API v1](https://developer.todoist.com/api/v1/) / [Things features](https://culturedcode.com/things/features/) / [TickTick task details](https://help.ticktick.com/articles/7055782408586526720) / [ClickUp 转换请求](https://feedback.clickup.com/feature-requests/p/option-to-turn-a-checklist-item-into-a-task-or-subtask-and-vice-versa)

### 2.3 拖拽排序：手写 Pointer 拖拽，拒绝 dnd-kit

- HTML5 原生 DnD 在移动端完全不可用（iOS Safari 从未支持触摸 dragstart）。
- `@dnd-kit/core` + `sortable` 合计 **约 18KB gzip**——占当前 42KB 余量近一半，否决。
- 成熟移动端交互是「长按起拖」（Todoist）；桌面是拖拽把手。iOS 编辑模式用把手也是成熟惯例。
- 手写路线是成熟方案：Pointer Events + setPointerCapture + rAF 跟手 + 中点命中换位。**三个必踩的坑**（dnd-kit 官方解法）：把手区 CSS 必须预置 `touch-action: none`（不能在 pointerdown 后动态改，W3C pointerevents#178）；拖拽中容器禁 overscroll；长按要阻止 contextmenu（iOS 弹放大镜）。

**本项目决策**：手写拖拽（~200 行，<2KB gzip），**把手激活**（桌面 hover 显、移动端常显小把手）而非全域长按——规避与文本选择/系统菜单的冲突，实现更可靠；换位动画复用现有 FLIP（`lib/flip.ts` + `data-flip-id`）。排序落库用半序中点法（只写被移动项）。

来源：[web.dev DnD](https://web.dev/articles/drag-and-drop) / [dnd-kit sensors](https://dndkit.com/react/guides/sensors) / [dnd-kit #435 touch-action](https://github.com/clauderic/dnd-kit/issues/435) / [pointerevents#178](https://github.com/w3c/pointerevents/issues/178) / [Bundlephobia core](https://bundlephobia.com/package/@dnd-kit/core)

### 2.4 任务视图：抄 Things「接下来 7 天」分段列表，不做周网格

- Things 四视图是「承诺光谱」：Today（承诺）/ Upcoming（接下来 7 天逐日分段，发现过载日、跨天拖动改期）/ Anytime（backlog）/ Someday（无日期想法）。
- Upcoming 本质是「带日期分段的 agenda 列表」，不是 7 列网格；周网格是 TickTick/日历类产品的形态。
- 7 行分段在手机竖屏天然适配，每段复用现有任务列表组件；拖拽跨段 = 改 dueDate，不需要网格坐标计算。实现量约为周网格的 1/3。

**本项目决策**（v1.25）：做「接下来 7 天」分段列表视图；周网格只在桌面做成只读密度概览（可选，优先级低）。

来源：[Things 四视图](https://culturedcode.com/things/support/articles/4001304/) / [TickTick Calendar View](https://help.ticktick.com/articles/7055782085826445312) / [Asana 7-Day View](https://forum.asana.com/t/plan-your-week-with-the-new-7-day-calendar-view-in-my-tasks/135301)

### 2.5 专注绑定：从任务发起专注，统计从存储派生

- TickTick：任务列表/详情「Start Focus」，专注记录挂到任务，统计页可按任务回顾；timer/pomo/手动记录合计。
- Super Productivity：任务可设时间估算，从任务开计时器，实际投入自动累计——「估算剩余 vs 今日已投入」汇总条是其核心体验。
- Sunsama：晨间计划逐个估时（planned）→ 工作中计时（actual）→ 日终回顾完成情况、未完成 carryover → 周复盘。**planned vs actual 本质是纯计算，不需要额外落库**。
- 数值型习惯：Loop Habit Tracker 的 measurable 模式（target + unit + 每日记数值 + EMA 强度）。

**本项目决策**（v1.25）：`FocusSession` 加 `taskId`/`goalId` 可空外键；番茄钟「这次专注做什么」升级为选任务/目标；任务与目标详情显示累计专注；复盘页「昨日计划完成率」纯派生不落库；学习目标拆解任务持久化关联（Task.goalId）+ 完成自动推进进度。

来源：[TickTick Start Focus](https://help.ticktick.com/articles/7055782010496745472) / [Super Productivity time tracking](https://dev.to/johannesjo/super-productivity-how-to-grow-fond-of-time-tracking-and-task-management-22ee) / [Sunsama daily planning](https://help.sunsama.com/docs/usage-guides/daily-planning/) / [Loop Habit Tracker](https://loophabits.org/)

### 2.6 命令面板搜索：手写评分器，不引库

- 成熟模式：空态展示最近项（Notion）；前缀切 scope（GitHub `#`/`>`/`/`）；排序 = 模糊评分 × frecency（Raycast）；分组 + 键盘导航 + 命中高亮（`cmdk` 的 API 形状是事实标准）。
- 体积事实：fuse.js 全功能 8.6KB / basic 6.8KB gzip；**uFuzzy ~2KB、fuzzysort 零依赖**；但几百条规模的数据纯内存 + includes 是亚毫秒级，**手写 50-80 行评分器（前缀 > 子串 > 子序列 × frecency）<1KB** 即可。
- 纯中文场景子串匹配天然工作，无需分词/拼音。

**本项目决策**（v1.26）：手写评分器（`src/lib/search.ts`），索引 = 任务/速记/论文/考试/目标的小写拼接字段；分组展示（导航/任务/速记/资料…）；空态显示最近打开；高亮用评分器返回的 indices。

来源：[GitHub Command Palette](https://docs.github.com/en/get-started/accessibility/github-command-palette) / [Raycast manual](https://manual.raycast.com/search-bar) / [cmdk](https://github.com/dip/cmdk) / [Fuse.js](https://github.com/krisk/Fuse) / [uFuzzy](https://github.com/leeoniya/uFuzzy) / [fuzzysort](https://www.npmjs.com/package/fuzzysort)

### 2.7 健康图表：手绘 SVG，虚线目标线 + overlay tooltip

- Apple Health：体重=折线趋势（D/W/M 刻度切换），睡眠=柱状（日对比）；核心叙事是「趋势」不是单点。
- 目标表达：实线留给真实数据，**虚线专用于目标线**（storytellingwithdata 经典原则）；目标区间用数据层之下的低饱和 band；参考线旁直接标数值，一张图 1-2 条封顶。
- WWDC22 图表三原则：focused / approachable / accessible（对比度 + 读屏标签）。
- 体量事实：Recharts 144KB gzip、visx/scale 17KB gzip，手绘折线+柱状组件 2-3KB——低一个数量级。几百个点直接 `<path>` 渲染，无需降采样。
- 交互模式：一个透明 overlay 监听 pointermove → 最近点吸附 → crosshair + tooltip。

**本项目决策**（v1.26）：延续手绘 SVG 先例（`weekly-trend-chart.tsx`），体重折线 + 虚线目标线（目标值可设置）、睡眠柱状 + 目标虚线；共用 scale/tooltip 工具；SVG 加 `role="img"` + aria-label 文字摘要。

来源：[WWDC22 Design an effective chart](https://developer.apple.com/videos/play/wwdc2022/110340/) / [storytellingwithdata 虚线](https://www.storytellingwithdata.com/blog/2018/5/8/when-to-use-a-dotted-line) / [Tableau reference lines](https://help.tableau.com/current/pro/desktop/en-us/reference_lines.htm) / [Headway SVG line chart](https://www.headway.io/blog/building-a-svg-line-chart-in-react)

---

## 三、三阶段路线图

| 阶段 | 版本 | 主题 | 内容 | 迁移 |
|---|---|---|---|---|
| 一 | **v1.24.0** | **任务系统升级** | 重复任务（枚举+同行滚动+跳过）、清单 checklist、doing 激活、手动排序+把手拖拽、改期菜单、收件箱入口 | 011（wb_tasks 加 repeat/checklist jsonb + sort 烘焙） |
| 二 | v1.25.0 | **视图与数据闭环** | 接下来 7 天分段视图（复用拖拽）；FocusSession 加 taskId/goalId + 从任务发起专注 + 累计时长；学习目标拆解持久化（Task.goalId）+ 完成自动推进；复盘「昨日计划完成率」纯派生；行动步骤勾选上云端；速记/热点转任务 | 012（focus_sessions/task 加外键、growth 步骤结构化） |
| 三 | v1.26.0 | **搜索与洞察** | 命令面板内容搜索（手写评分器+分组+高亮+frecency，兑现顶栏文案）；健康趋势图（体重折线+目标虚线、睡眠柱状）；番茄周/月统计；首页卡片顺序/显隐用户自定义 | 无（自定义配置走 zustand persist / localStorage） |

**分期理由**：
1. **按依赖切**：v1.24 先把 Task 模型定型（repeat/checklist/sort 语义），v1.25 的外键（taskId/goalId）落在稳定模型上；7 天视图的拖拽复用 v1.24 的手写拖拽基建。
2. **按风险切**：v1.24 集中全部任务 schema 变更（一次迁移 011）；v1.25 再开迁移 012，两批 schema 变更不同时上线，出问题定位面小。
3. **按价值频率切**：待办是每日使用频率最高的页面，v1.24 直接改善日常；闭环（v1.25）和洞察（v1.26）在结构稳定后逐层加值。

**判级**：三阶段均为 feat → 各发一个 minor（v1.24.0 / v1.25.0 / v1.26.0），阶段内多 commit 归并取最高档。

---

## 四、体积预算盘点

- 现状（v1.23.1 实测）：JS 总量 **1078/1120KB（剩 42KB）**，最大 chunk **329/340KB（剩 11KB）**。基线 +10% 的余量经不起连续堆积（经验总结第十三节教训）。
- **零新依赖路线**（红线否决记录）：dnd-kit ~18KB gzip ✗、rrule.js ~8-10KB ✗、fuse.js ~6.8KB ✗、Recharts/visx ✗。全部手写替代：repeat 引擎 ~1.5KB、拖拽 ~2KB、搜索评分器 ~1KB、图表组件 ~2-3KB。
- 每阶段动工前先 `node scripts/check-bundle.mjs` 实测余量再动手；预计 v1.24 后 ~1086/1120、v1.26 后 ~1095/1120，均在门禁内但需逐阶段复核。

---

## 五、来源清单

- 重复任务：Todoist（recurring dates / 完成重复任务）、Things 3（repeating）、TickTick（按完成日重复）、Vikunja API、Tasks.org recurrence 文档、Martin Fowler《Recurring Events for Calendars》、Stack Overflow recurrence 存储经典答
- 清单/子任务：Todoist API v1、Things features、TickTick task details / multilevel tasks、ClickUp / HeroCoders 转换文档
- 拖拽：web.dev Drag and Drop、dnd-kit sensors 指南与 issue #435、W3C pointerevents#178、Bundlephobia（@dnd-kit/core 14.2KB gzip + sortable 3.7KB gzip）
- 视图：Things 四视图（commitment spectrum）、TickTick Calendar/Week View、Asana 7-Day View
- 专注绑定：TickTick Start Focus / Focus Statistics、Super Productivity（dev.to 两篇 + 官网）、Sunsama daily planning 手册、Loop Habit Tracker、Habitica Wiki、Session、Forest、Day One Journaling Suggestions
- 搜索：GitHub Command Palette、Notion 快捷键、Linear Search、Raycast manual、cmdk、Fuse.js README、uFuzzy、fuzzysort
- 图表：WWDC22《Design an effective chart》、storytellingwithdata、Tableau reference lines/bands、Peltier、Headway SVG line chart、LTTB 论文、bundlephobia（Recharts 144.1KB / @visx/scale 17.1KB gzip）

（完整 URL 见两轮调研原始产出；上表为核心结论溯源。）
