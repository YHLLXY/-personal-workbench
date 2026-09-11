# v1.24 任务系统升级（重复任务 · 清单 · 手动排序 · doing 激活 · 改期菜单）

> 2026-09-06 整理，**已实施**（同日 A–G 七项全部落地，实测注记见文末）。调研依据：`RESEARCH_UPGRADE_ROADMAP.md`（成熟产品模式与来源）。
> 判级预估：feat 多项 → **v1.24.0**。迁移：**011（幂等）——需用户在场执行**。
> 状态（2026-09-11）：**已发版 v1.24.0**（tag `v1.24.0`，commit 3069c8b74）；迁移 011 用户已在 Supabase 执行且无错误；云端回归与双端手查待用户完成。
> 零新依赖（dnd-kit/rrule.js/fuse.js 均被体积红线否决，见调研文档第四节）。

## 0. 范围（七项）

| # | 事项 | 级别 |
|---|---|---|
| A | 任务模型扩展 + 迁移 011（repeat/checklist 列 + sort 优先级烘焙）+ 双仓储同步 + 契约测试 | 数据 |
| B | 重复任务引擎 `lib/repeat.ts` + 完成滚动/撤销/跳过 + 弹窗 UI | feat |
| C | 任务清单 checklist（行内展开、进度、增删勾选） | feat |
| D | doing 状态激活（弹窗三态 + 行内徽章 + 排序位置） | feat |
| E | 手动排序语义 + 把手拖拽（手写 Pointer，复用 FLIP） | feat（风险最高） |
| F | 改期菜单（dropdown：今天/明天/后天/下周一/自选 + 跳过一次） | feat |
| G | 收件箱入口（快速捕获「存入将来」+ 将来区条目升级） | feat |

**明确不做**（记录理由）：
- 「每月第 N 个星期 X」月内语义——Vikunja 也没做，边缘场景（调研 2.1）；
- 子任务树 / parent_id（Todoist 流派）——checklist 流派已覆盖需求，子任务树带来递归渲染与视图聚合复杂度翻倍；
- 跨区拖拽改期、周网格视图——留给 v1.25「接下来 7 天」视图；
- 清单项提升为任务——记录为后续项（~10 行，但本批控制改动面）；
- 键盘/读屏排序兜底（上移/下移按钮）——单用户，把手是唯一排序路径，接受；
- 拖拽时列表边缘自动滚动——今日区任务量小（个位数到二十），用不到；
- 重复任务完成历史/连续统计——避免为统计新建表；
- 全域长按拖拽（Todoist 移动端式）——与 iOS 文本选择/系统菜单冲突，选把手方案更可靠；
- 快速捕获增加优先级/标签字段——保持快速捕获的最小形态。

---

## A. 模型与迁移

### A1. types.ts（`src/lib/db/types.ts`）

```ts
/** 重复规则（v1.24）：简单枚举而非 RRULE——freq+interval+weekdays 覆盖 Todoist every/every! 全部主路径 */
export interface TaskRepeat {
  freq: 'daily' | 'weekly' | 'monthly'
  interval: number              // 每 N 天/周/月，≥1
  weekdays?: number[]           // freq='weekly' 时 0-6（周日=0）多选；interval>1 时仅单选（UI 约束）
  anchor: 'due' | 'complete'    // 按计划日推 / 按完成日推（Todoist every / every!）
}
export interface ChecklistItem { id: string; text: string; done: boolean }
```

- `Task` 增加 `repeat?: TaskRepeat | null`、`checklist?: ChecklistItem[]`（可选字段——旧数据天然缺省为普通任务，不是兼容层）；`TaskInput` 同步增加。
- 新增共享纯函数 `bakeTaskSort(priority, now = Date.now()): number`，公式 **`1e13 * (档位+1) + now`**（high=3 / medium=2 / low=1），与迁移 011 回填、local 惰性归一化三处一致（三处互写注释锚定）。

### A2. 迁移 `supabase/migrations/011_task_repeat_checklist.sql`（幂等，全文）

```sql
-- v1.24 任务系统升级：重复任务 + 清单 + 手动排序
-- 幂等性：加列 IF NOT EXISTS；sort 类型重跑为等值转换；回填带 sort < 1e13 guard，可重复执行。

alter table public.wb_tasks add column if not exists repeat jsonb;
alter table public.wb_tasks add column if not exists checklist jsonb;

-- sort 从 bigint 转 double precision（拖拽半序需要小数中点；存量毫秒值 1.75e12 < 2^53 无损）。
-- 同步移除 UI 层 priorityRank 比较器，排序语义改为 sort 降序——
-- 把存量优先级烘焙进 sort，保证烘焙后顺序与旧 UI 顺序（高→中→低、同优先级新在前）完全一致。
-- 公式与 types.bakeTaskSort、local-repository 惰性归一化一致：
--   sort = 1e13 * (优先级档位 + 1) + 原毫秒时间戳（high=3 / medium=2 / low=1）
alter table public.wb_tasks alter column sort type double precision;
update public.wb_tasks
  set sort = 1e13 * (case priority when 'high' then 3 when 'medium' then 2 else 1 end) + sort
  where sort < 10000000000000;
```

Guard 验证：旧值 ~1.75e12 < 1e13 ✓ 命中；烘焙后最小 1.175e13 ≥ 1e13 ✓ 不会二次烘焙；新 createTask 值 ≥ 1.175e13 ✓ 同样不命中；上限 3.175e13 ≪ 2^53 ≈ 9.0e15 ✓。RLS 走表级既有策略，零新增。

### A3. 双仓储同步

- `supabase-repository.ts`：`taskFromRow`（:9-10）补 `repeat: (r.repeat as TaskRepeat | null) ?? null`、`checklist: (r.checklist as ChecklistItem[] | null) ?? undefined`；`taskToRow`（:76）补 `repeat: t.repeat ?? null, checklist: t.checklist ?? null`；`createTask`（:115-117）sort 改 `bakeTaskSort(input.priority ?? 'medium')`、补两新列写入；`updateTask` 的 update 对象补 `repeat: p.repeat, checklist: p.checklist`（undefined 键被 supabase-js 丢弃 = 部分更新，既有语义）。
- `local-repository.ts`：`createTask`（:29-30）同上；`listTasks`（:22-28）① 若当前无显式排序，补 `.sort((a, b) => b.sort - a.sort)` 与云端 `.order('sort', {ascending:false})`（:114）对齐（契约测试加顺序断言钉死）；② 读路径惰性归一化：`rows.some(t => t.sort < 1e13)` 时按 bakeTaskSort 公式重写这些行的 sort 并 `write`（004「客户端读路径惰性迁移」先例，公式与迁移一致）。

### A4. 契约测试（`tests/repository-contract.test.ts` runScript 增三段）

1. **新字段往返**：createTask（带 repeat: weekly/weekdays[1,3]/interval1/anchor due + checklist 两项）→ listTasks 断言字段原样往返（数组、枚举逐值比对）。
2. **排序语义**：create high → medium → low 三任务，断言返回顺序 = 高→中→低（烘焙生效）；updateTask 把 low 的 sort 改为 high/medium 中点 → 顺序变 low 最前。
3. **半序稳健性**：在某对相邻任务间连续中点插入 50 次，断言全程严格降序（double 精度余量验证）。

---

## B. 重复任务引擎（`src/lib/repeat.ts` 纯函数，可单测）

```ts
export function nextOccurrence(dueDate: string, repeat: TaskRepeat, completedAtISO: string | null, today: string): string
export function prevOccurrence(dueDate: string, repeat: TaskRepeat): string
export function repeatLabel(repeat: TaskRepeat): string
export function addDays(dateStr: string, n: number): string   // F 项改期菜单复用
```

**规则细则**（全部照调研 2.1 结论）：
- 基准：`anchor='due'` → base = dueDate；`anchor='complete'` → base = max(completedAt 本地日期, dueDate)（提前完成不早于计划日）。
- 推进：daily = +interval 天；weekly = weekdays 中 `> base` 的最近一个（weekdays 空则同 weekday），**interval>1 时限单选**、按整周步进；monthly = 同 day-of-month、**月末钳制**（1/31 → 2/28）。
- **跳过不补**：anchor=due 算出的下一次若 `< today`，继续推进到首个 ≥ today 的槽位（Apple Reminders 式）。
- `prevOccurrence` = 同规则回退一格（撤销用；anchor=complete 晚完成场景为近似值，见 B3 注记）。
- label：`每天` / `每 3 天` / `每个工作日`（weekdays=[1,2,3,4,5]）/ `每周·一/三` / `每 2 周·周三` / `每月 15 日`。

### B2. 完成滚动接线（`today-tasks.tsx:33-43` toggleDone）

- repeat 任务完成：`update.mutate({ id, patch: { completedAt: new Date().toISOString(), dueDate: next } })`——**status 保持 'todo' 不动**（下一份就是这行）。`applyTaskPatch`（types.ts:228）对不带 status 的 patch 走显式 completedAt 通道 ✓；supabase `updateTask`（:121）同通道 ✓。乐观更新自动一致，无需新派生规则。
- toast 撤销（5 秒内）：`patch: { completedAt: null, dueDate: t.dueDate }`——闭包捕获的原 dueDate，全场景精确。
- 已完成区点勾选框撤销（toast 消失后）：`patch: { completedAt: null, dueDate: prevOccurrence(t.dueDate, t.repeat) }`。
- 逾期区/今日区菜单「跳过一次」（F 项挂入）：`patch: { dueDate: nextOccurrence(t.dueDate ?? today, t.repeat, null, today) }`，不动 completedAt、不记完成。

### B3. 口径扩展（`overview/api.ts`）

- 新增 `isDoneForToday(t, today)` = `t.status === 'done' || (t.repeat && t.completedAt && localDateOfISO(t.completedAt) === today)`。
- `todayDone`（:56-60）过滤条件改用 `isDoneForToday`（原「status==='done'」）——repeat 任务完成当天也进已完成区（划线保留 + 撤销语义一致）。
- `todayTasks`（:50-54）**无需改动**：repeat 完成后 dueDate 指向未来，`isTodayScope` 与逾期条件天然不命中。消费方核查（已 grep）：`todayTasks` 消费方 = cards.tsx / overview-home.tsx / overview-summary.tsx / today-tasks.tsx / daily-summary.tsx / growth/cards.tsx，全部只受排序影响（见 E1），`todayDone` 消费方仅 today-tasks.tsx。
- `/api/check-reminders` 不受影响：滚动后的 due_date 在未来，不会被扫为到期。

### B4. UI

- `TaskItem`：meta 行（:35-41）补 repeat 徽章（`<Repeat>` 图标 + repeatLabel）；新增可选 prop `done?: boolean`（覆盖默认的 `task.status==='done'`，today-tasks 传 `isDoneForToday`）。
- `TaskDialog`：新增「重复」Select——`不重复 / 每天 / 每个工作日 / 每周 / 每月 / 自定义…`；自定义展开 interval 步进（1-30）+ 单位（天/周/月）+ 周几 chips（weekly 多选，interval>1 时单选）+ 锚点 toggle（按计划日/按完成日）；编辑时按 repeat 值反解预设；`status==='someday'` 时隐藏重复控件（将来任务不重复）；payload 带 `repeat: null` 表示清除。

---

## C. 清单（checklist）

- `TaskItem` 标题行尾显示进度 `x/y`（y>0 时）；行内 chevron 展开区：每条 = 小勾选框 + 文本 + 删除 ×，底部「添加条目」Input（Enter 提交）。
- 全部走既有 `update.mutate({ id, patch: { checklist } })`：增 = `[...items, { id: genId(), text, done: false }]`，勾选 = map，删 = filter。
- **全勾完不自动完成父任务**（TickTick 同款语义，调研 2.2）。
- 编辑入口唯一：行内展开，TaskDialog 不加清单编辑。

## D. doing 状态激活

- `task-dialog.tsx:18,28`：status state 与回落逻辑加 `'doing'`；:74-78 状态 pills 三态（待办 / 进行中 / 将来）。
- `TaskItem`：doing 徽章（蓝点 +「进行中」，样式对齐 focus 徽章、accent 色）。
- 排序位置：焦点 → doing → 其余（E1 比较器统一实现）。

## E. 手动排序与拖拽

### E1. 语义变更（需消费方核查的口径变更）

- `todayTasks` 比较器（api.ts:52-53）改为 **`focus desc → doing 优先 → sort desc`**，删除 `priorityRank` 比较器（api.ts:87，无其他消费方，直接删）。
- 默认顺序与现状完全一致的前提 = A 项存量烘焙（证明：旧序 = focus → priorityRank asc → listTasks 序（sort desc）；新序 = focus → sort desc = 档位 desc + 时间 desc，两者相等）。此后拖拽即手动序，优先级圆点降为纯视觉信息。
- 逾期区/已完成区/将来区渲染序不变（listTasks sort desc）。

### E2. `src/lib/drag-sort.ts`（手写，≤250 行，<2KB gzip）

- 导出 `midpointSort(prev?: number, next?: number): number`（首/尾边界用 ±步长）+ `useDragSort` hook：pointerdown（把手）→ 4px 阈值 → `setPointerCapture` → 克隆元素 `position:fixed` 跟手（**rAF 改 transform**，不用 top/left）→ 中点命中算目标 index → 预览换位 → pointerup 回调 `onReorder(newIds, movedId)`。
- 落库（today-tasks 接线）：仅 `update.mutate({ id: movedId, patch: { sort: midpointSort(前项.sort, 后项.sort) } })`——半序只写一项，无批量写。
- **触摸三坑照抄 dnd-kit 解法**（调研 2.3）：把手 CSS **预置** `touch-action: none`（绝不能 pointerdown 后动态改，W3C pointerevents#178）；拖拽期间列表容器 `overscroll-behavior: contain`；把手 `onContextMenu` preventDefault（iOS 长按放大镜）。
- 换位动画复用现有 FLIP（`lib/flip.ts` + `data-flip-id`，task-item.tsx:14）——ghost 落点移除后 flipIn 接管。
- 交互：把手 `GripVertical`（size-3.5，桌面 `md:opacity-0 group-hover:opacity-100`，移动端常显低强调）；**仅今日区行可拖**，逾期/已完成/将来不传拖拽 props。

## F. 改期菜单

- `components/ui/dropdown-menu.tsx` 已存在 ✓。`TaskItem` 新增可选 props：`onReschedule?(date: string)`、`onSkip?()`；行尾加 `⋯`（MoreHorizontal）菜单：**今天 / 明天 / 后天 / 下周一 / 自选日期…（菜单底部内嵌 `<Input type="date">` + 确认）/ 跳过一次（仅 repeat 任务显示）**。日期计算用 repeat.ts 的 `addDays` / `nextMonday`。
- 逾期行保留现有 inline「顺延」（today-tasks.tsx:97 快速路径不动）；逾期区头加「全部顺延到今天」（recent 逐条 update，既有清理历史待办先例 :120-132）。
- 今日区行从此有改期入口（原先无）。

## G. 收件箱入口

- `quick-capture.tsx:76-81` 任务 tab 加「存入将来收件箱」checkbox：勾选时 `createTask({ title, status: 'someday', dueDate: null })`（mutationFn 参数化，默认行为不变）。
- 将来区条目（today-tasks.tsx:186-196）补 `⋯` 菜单：移到今天（既有）/ 选日期…（= status todo + 自选 dueDate）/ 既有编辑、删除保留。

---

## 实施顺序与提交切分

1. A（feat(model) + 迁移文件 + 契约）→ 2. B（feat(tasks)）→ 3. C（feat(tasks)）→ 4. D（feat(tasks)）→ 5. F（feat(tasks)）→ 6. **E（feat(tasks)，风险最高放后段，前有五项热身验证链路）** → 7. G（feat(capture)）→ 全量验证 → **用户在场执行迁移 011** → 云端回归 → release（release.mjs 判级）。
- 顺序说明：代码先于迁移合并是本仓惯例（push 后立即执行迁移）；**迁移执行前不要在新版前端上创建重复任务/清单**（新列未建，云端写入会 PGRST204），见风险节。

## 测试

- `tests/repeat.test.ts`：nextOccurrence 规则矩阵（锚点两种 / daily interval / weekly 多选与 interval>1 单选整周步进 / monthly 月末钳制 / 跳过不补 / base=max(complete,due)）+ prevOccurrence 对称性 + repeatLabel 文案 + addDays。
- `tests/task-order.test.ts`（或并入现有）：todayTasks 新比较器（focus → doing → sort desc）、todayDone 含 repeat 完成态、isDoneForToday、midpointSort 边界。
- 契约测试：A4 三段。
- E2E：+1 用例——新建任务选「每天」→ 完成 → 断言进入已完成区 + 行内「每天」徽章 → toast 撤销回今日；现有 9 用例回归（将来区/逾期区 DOM 有调整，注意选择器）。

## 验证清单

- [x] `npm test` 全绿（含 repeat / 排序 / 契约新增段）—— 493/493（2026-09-11 发版复验）
- [x] `npm run build` + `check:bundle`：JS 总量 1095/1120、max chunk 302/340 —— 通过（2026-09-11）
- [x] `npm run lint` ≤ 12（对比改动前后）—— 11
- [x] `npx playwright test` 全绿（含新用例）—— 10/10（`E2E_PORT=5199`，36.9s 无 flaky）
- [x] 用户在场执行 011 —— 2026-09-11 执行无错误
- [ ] 云端回归（用户收尾）：建重复任务（完成滚动/撤销/跳过）、清单增删勾选、拖拽（桌面把手 + 移动长按无放大镜）、老数据顺序与升级前一致
- [ ] 手查（桌面 + 移动双端）：E1 默认序不变；doing 徽章与排序位；改期菜单全项；「全部顺延到今天」；快速捕获将来 checkbox；将来区菜单

## 风险与回滚

- **部署顺序**：push → Vercel 自动部署 → **立即执行迁移 011**（用户在场）。窗口期内新版前端创建 repeat/checklist 任务会失败（列未建）——迁移是合并后的第一个动作；旧 SW 缓存版本无新字段写入，不受影响。
- **拖拽触摸手势**：touch-action 预置 / contextmenu / overscroll 三点缺一即翻车（调研 2.3），双端手查为验收硬条件。
- **口径变更双哨兵**：todayDone 扩展 + todayTasks 比较器替换，消费方清单已列（B3），首页今日卡与 growth 卡顺序需手查。
- **烘焙异常兜底**：guard 保证幂等；即使烘焙被跳过，顺序退化为创建序（仍可用），重跑迁移即恢复。
- 每项独立 commit，单项 `git revert` 可回滚；迁移全 additive，代码回滚后旧版不读新列，列可留在库里。

## 自查记录

- [x] 每项有 file:line 实证：toggleDone（today-tasks.tsx:33-43）、applyTaskPatch 显式 completedAt 通道（types.ts:228-234）、supabase updateTask completedAt 通道（supabase-repository.ts:121）、taskFromRow/taskToRow（:9-10,:76）、local createTask sort 写死（:30）、listTasks 云端排序（:114）、priorityRank（api.ts:87）、FLIP 锚点（task-item.tsx:14）、quick-capture 任务提交（:40,:76-81）、004 幂等加列先例
- [x] api/*.ts 单文件约束：不涉及 api/ 目录 ✓
- [x] 双实现同步：A3 两侧同步 + A4 契约钉死；sort 公式三处（迁移/惰性归一化/bakeTaskSort）注释互指 ✓
- [x] 准则 #1 不留兼容：priorityRank 删除不保留；repeat/checklist 用可选字段缺省（数据缺省非兼容层）；local 惰性归一化是既有先例（004）非新机制 ✓
- [x] 准则 #2/#5/#6：零新依赖，dnd-kit/rrule/fuse 否决依据在调研文档 ✓
- [x] 体积：预估 +10KB 内，门禁复验为验收条件 ✓
- [x] 迁移幂等可重复执行 + 用户在场 ✓

## 实测注记（2026-09-06 实施完成）

实施顺序 A→B→C→D→F→E→G 按计划执行，每项独立 commit + 分项测试，风险最高的 E 项一次通过。实施中对计划做三处修正（教训沉淀见经验总结第十五节）：

- **B3 修正**：todayTasks 过滤改用 `isDoneForToday`——计划「无需改动」漏了「逾期 repeat 补完成 → 跳过不补把 dueDate 推到今天 → 同帧双显」的组合边界；todayDone 同步收容 repeat 当天完成态（tests/task-order.test.ts 钉死）。
- **A4 修正**：中点手动排序断言按实际中点语义（low 落到高/中之间，非「最前」）；50 次中点插入用远距锚点 3e13/1e13——相邻毫秒锚点的 gap/2^50 < ULP，中点必塌缩，「严格降序」在数学上不成立。
- **新增约束（E2）**：midpointSort 空列表兜底必须 ≥1e13（裸 Date.now() 会触发本地惰性归一化二次烘焙，破坏拖拽序）——值域守卫约束所有写入路径。
- **E2E 发现**：5173 被本机其他项目 vite 占用 + reuseExistingServer 静默复用 → 全用例打错应用；playwright.config 增加 E2E_PORT 逃生口，冒烟用例手动 newContext 的 baseURL 同步派生。
- **验证实测**：vitest 493/493 全绿；JS 总量 1095/1120（+17KB，dropdown-menu 复用既有 chunk），max chunk 329→302（chunk 重排反降）；lint 11 ≤ 12；E2E 10 用例全绿（5 flaky 为已知冷编译 teardown 超时，重试兜底）。
