# RESEARCH：今日待办卡片信息升级（2026-09-13）

> 调研动因：用户反馈「任务卡片太小，设置的任务文字内容显示不出来」。本文只记录带来源的事实与可验证结论，
> 供 `PLAN_V125_TASK_CARD.md` 引用。所有外部结论均来自当次真实检索（官方帮助 / 官方特性页 / 官方 changelog / 社区讨论）。

## 一、现状盘点（本仓库代码事实）

### 1.1 卡片信息位现状（src/modules/overview/task-item.tsx）

| 信息位 | 现状 | 问题 |
|---|---|---|
| 标题 | `text-sm truncate`（task-item.tsx:67）——**单行 + 省略号截断** | 用户核心抱怨：文字显示不出来 |
| 优先级 | 圆点（size-2，title 悬浮提示） | 无文字，但占位小，保留 |
| 元信息行 | `dueTime` / `repeat` / `tags` / 完成时间（text-[10px]，仅在有值时渲染） | **不含 dueDate**——逾期任务看不出原本到期日 |
| 状态徽章 | 今日焦点 / 进行中 / 清单 x/y（内联在标题行右侧） | 与标题抢同一行宽度 |
| 清单 | 行内展开（chevron 列） | 正常 |
| 备注字段 | **Task 模型没有备注/描述字段**（types.ts:10-25） | 想写多内容只能堆进标题 |

### 1.2 布局挤压来源

主行是单行 flex：`把手 + 复选框 + (标题行+元信息行) + 顺延? + 星标 + 清单chevron + 改期⋯ + 删除`。
移动端 390px 宽下，复选框+5 个操作控件约占 130px，标题区仅剩 ~210px，再叠加 `truncate`，
超过 ~15 个汉字即被截断——这就是「卡片太小、文字显示不出来」的机械成因。

## 二、成熟产品怎么做（带来源）

### 2.1 Todoist —— 描述显示在任务名下方；日期按状态着色

- 官方帮助《添加任务描述》：**任务描述显示在任务名称的下方**；支持多行，上限 16384 字符；新建/编辑均可添加。
  https://www.todoist.com/zh-CN/help/todoist/features/add-a-task-description-in-todoist-rOryWIHn
- 官方帮助《Schedule a date and time》（"Break it down with colors" 一节）：日期按状态着色——
  **红 = 逾期**、绿 = 今天（未过到期时间）、棕/琥珀 = 明天、紫 = 更晚。
  https://www.todoist.com/help/todoist/features/schedule-a-date-and-time-for-your-todoist-tasks-q7VobO
- 反面教材（Todoist 自己也栽过）：任务名换行在 web 端长期支持不佳——2025 changelog 修「API 建的含换行任务名显示异常」、
  2026 changelog 修「含换行任务名溢出行而不是整齐截断」。结论：**任务名换行是真实需求，但要显式处理 wrap**。
  https://www.todoist.com/it/help/todoist/product-updates/changelog-entries-from-2025-SsEIOCtjK
  https://www.todoist.com/help/todoist/product-updates/2026-changelog-HD3jJAtLd

### 2.2 TickTick（滴答清单）——「显示详情」= 两行标题 + 一行内容；截断是用户痛点

- 官方博客（标签功能介绍）：列表开启 **"Show Details"** 后，标签等详情显示在每个任务名下方。
  https://blog.ticktick.com/2018/05/18/newtagging/
- 官方 changelog 转述：开启 Show Details 后「**两行标题 + 一行内容**（two rows of title and one row of content）」。
  https://ticktick.com/public/changelog/en.html
- 社区抱怨（重要教训）：web/桌面端长标题默认截断且**无法关闭**——「这是我不用 TickTick 的原因之一」。
  https://www.reddit.com/r/ticktick/comments/w45jls/can_i_view_the_full_title_of_my_task_without/

### 2.3 Things 3 —— 备注以灰色小字出现在标题正下方

- 官方特性页：备注/标签/清单等细节「收在角落」，添加备注后，**一小段备注以更小的灰字显示在 to-do 标题下方**。
  https://culturedcode.com/things/features/
- 官方支持文档《Writing Notes in Things》：备注支持 Markdown/列表/行内搜索。
  https://culturedcode.com/things/support/articles/4438545/

### 2.4 Apple Reminders —— 备注固定显示在标题下方，更小灰字

- Apple 支持：通过 ⓘ 信息面板添加的备注，以更小的灰字显示在提醒标题下方。
  https://support.apple.com/en-us/102484
- 行为细节：备注**始终**显示（无开关）；列表里截断，ⓘ 弹窗里也截断（用户抱怨看不全）；
  过长的备注让列表变得很高，有用户反过来要求隐藏（Apple Discussions）。
  https://discussions.apple.com/thread/254283487
  https://www.reddit.com/r/mac/comments/1megi2g/how_do_you_see_the_entire_notes_field_in_apple/
  → 教训：备注要**有**但**别全文铺开**，截断上限要有（我们取 2 行）。

### 2.5 技术事实：Tailwind v4 `line-clamp-*` 是核心工具类

- 官方文档确认 line-clamp（按行截断）在 Tailwind v4 内置，无需插件。
  https://tailwindcss.com/docs/line-clamp

## 三、四家模式归纳

| 维度 | Todoist | TickTick | Things 3 | Reminders | 对本项目的启示 |
|---|---|---|---|---|---|
| 任务名 | 换行支持差（踩坑史） | 2 行（详情模式） | 完整显示 | 完整显示 | **标题完整换行，不截断** |
| 备注/描述 | 标题下方，多行 | 一行内容（详情模式） | 灰字片段在标题下 | 灰字在标题下，固定显示 | **新增备注字段，标题下方灰字、上限 2 行** |
| 元信息 | 日期/标签在标题下或行右侧 | 详情模式下第二行 | 行右侧紧凑 | 标题下第二行 | 元信息独立成行（含徽章），不与标题抢宽 |
| 日期色 | **红=逾期**、绿=今天、棕=明天 | — | 红色旗标 | 红=逾期 | 逾期卡片补「源日期」红色徽章 |
| 截断开关 | — | 无（被抱怨） | — | 无（被抱怨） | 不做密度开关（单用户无此需求，避免冗杂） |

## 四、结论（喂给 PLAN 的设计输入）

1. **标题完整换行**（去掉 `truncate`）——四家中两家完整显示，两家截断但都因此挨骂；个人工具无密度压力。
2. **新增 Task 备注字段**，卡片在标题下方以 `text-xs text-muted-foreground line-clamp-2` 灰字显示（Things/Reminders 模式 + 上限防 Reminders 式列表爆炸）；全文点标题进编辑弹窗可见。
3. **元信息独立成行**：焦点/进行中/清单进度徽章从标题行挪到元信息行（TickTick「详情第二行」模式），标题行只留优先级圆点。
4. **逾期日期红色徽章**（Todoist 红色惯例）：逾期区卡片补显示源到期日（`M月D日 周X`），今日区不显示「今天」徽章（全区都是今天，重复即噪音）；未来日（焦点任务可能提前到期）灰字显示。
5. 不做：备注 Markdown 渲染（四家的列表内备注都是纯文本）、密度开关、详情页、优先级文字标签——超出「显示更多信息」的最小必要范围。
