# PLAN：v1.25 今日待办卡片信息升级（2026-09-13）

> 状态：待实施。调研依据：`RESEARCH_TASK_CARD.md`（结论均带来源）。
> 判级：feat → **v1.25.0**（minor）。零新依赖。体量影响：仅改已有 chunk，无新包。

## 0. 目标与不做什么

用户原话：「卡片太小，设置的任务的文字内容显示不出来……升级之后的卡片要显示更多的信息和内容，但不要过于冗杂。」

**做**：标题完整换行、新增备注字段并上卡、元信息独立成行、逾期卡片补源日期红色徽章。
**不做（禁区，防扩散）**：
- 不动 `cards.tsx` 总览页迷你卡（预览场景，truncate 是刻意的）
- 不动 `quick-capture.tsx`（速记入口保持 title-only）
- 不动 `today-tasks.tsx` 的口径函数 / 拖拽 / FLIP / someday 行结构（`lib/drag-sort.ts`、`lib/flip.ts`、`api.ts` 全部不碰）
- 不做备注 Markdown、密度开关、详情页、优先级文字
- 不新增 npm 依赖；`TaskItem` 现有交互（顺延/星标/清单/改期/删除、防连击）一个不删

## 1. 数据模型：`Task.note`（可选字段，v1.24 repeat/checklist 同款模式）

```ts
// types.ts
export interface Task { …; note?: string | null }          // 备注；缺省 = 无备注（老数据天然缺省）
export interface TaskInput { …; note?: string | null }
```

双仓储同步改（行为必须一致）：
- `local-repository.ts` createTask：`note: input.note ?? null`（updateTask 走 `applyTaskPatch` spread，自动兼容）
- `supabase-repository.ts`：
  - `taskFromRow`：`note: (r.note as string | null) ?? null`
  - `taskToRow`：`note: t.note ?? null`（备份/导入链路）
  - createTask insert：`...(input.note ? { note: input.note } : {})`——**条件写入**
  - updateTask update：`note: p.note`（与兄弟字段同款；supabase-js 丢 undefined 键，仅显式 null 会清空）

**部署窗口安全性（v1.24 教训：代码先行 + 迁移滞后曾把云端 createTask 打断 5 天）**：
createTask 条件写入后，「无备注的创建/更新」在迁移 012 执行前也完全安全（不会发 note 键）；
仅「带备注的写入」在迁移前会 PGRST204（单次失败有 toast，迁移后自愈）。发布顺序仍要求 **迁移 012 先于 push 执行**。

### 迁移 012（用户在场执行，agent 只写文件）

```sql
-- supabase/migrations/012_task_note.sql
-- v1.25 任务备注：卡片在标题下方直接显示备注（2026-09-13，需用户在场执行；push 前执行）
-- 幂等：加列 IF NOT EXISTS 可重复执行；存量行为 NULL（UI 视为无备注）。
alter table public.wb_tasks add column if not exists note text;
```

### TaskDialog（task-dialog.tsx）

- 标题输入框下方加备注 textarea：`Label 备注（可选）` + `htmlFor="task-note"` + rows=2，
  placeholder「补充细节、链接、背景…（会显示在卡片上）」
- 提交载荷**条件挂键**（杜绝 patch 里出现 `note: undefined` 把本地已存备注抹掉）：
  ```ts
  if (noteText.trim()) payload.note = noteText.trim()
  else if (editing?.note) payload.note = null   // 编辑时清空才显式清；新建空备注不发键
  ```
  （云端 updateTask 收到 undefined 自动丢键=保留，收到 null=清空，与本地 applyTaskPatch 一致）

## 2. TaskItem 卡片重排（task-item.tsx）

```
[把手][✓] ┌ ● 标题（text-sm，完整换行：去 truncate，whitespace 正常 wrap）   [⭐][v][⋯][🗑]
          │ 备注 line-clamp-2 text-xs text-muted-foreground（有 note 才渲染）
          │ 元信息行：[M月D日 周X(逾期红/未来灰)] [⏰time] [🔁repeat] [今日焦点][进行中][清单x/y] [#tags] [完成于]
          └ 清单展开区（不动）
```

要点：
- 主行 `items-start`（多行标题时控件顶对齐）；把手/操作按钮 `self-center` 改视觉居中、复选框 `mt-0.5` 对齐首行
- 优先级圆点保留在标题行首（`mt-[7px]` 光学对齐首行文字）
- **徽章搬家**：今日焦点/进行中/清单 x/y 从标题行挪到元信息行（研究结论 3；标题行从此只有圆点+文字+右侧操作）
- `gap-3 → gap-2` 收紧行距，给标题让宽
- **dueDateChip 纯函数**（新文件 `src/modules/overview/task-card.ts`，纯函数不进组件文件）：
  ```ts
  export interface DueChip { label: string; overdue: boolean }
  export function dueDateChip(dueDate: string | null, today: string): DueChip | null
  // null：无日期或 dueDate === today（今日区不重复标「今天」）
  // label：`M月D日 周X`；overdue：dueDate < today（红色，Todoist 惯例）；否则灰
  ```
- 备注渲染：`task.note?.trim()` 真值才渲染；`line-clamp-2`（Tailwind v4 核心工具类）+ `whitespace-pre-wrap break-words`
- 已完成区同样显示备注/元信息（划线灰化，不额外分支）

## 3. 测试计划

| 文件 | 动作 |
|---|---|
| `tests/task-card.test.ts`（新） | dueDateChip：null 日期→null；today→null；昨天→overdue=true + `M月D日 周X` 格式；明天→overdue=false |
| `tests/task-dialog.test.tsx` | 加 1 例：填备注提交 → createTask 载荷含 note；空备注新建 → 载荷**不含** note 键 |
| `tests/repository-contract.test.ts` | 任务脚本加 note 往返：create 带 note → update 不带 note 键（备注须双端保留）→ update note:null（双端清空） |
| `tests/supabase-repository.test.ts:193` | 既有精确断言补 `note: null`（taskToRow 加字段后的必然维护） |
| `tests/local-repository.test.ts` | 加 1 例：createTask 带 note 读回；无 note patch 不抹备注 |
| `e2e/smoke.spec.ts` | 加 1 例：新建任务填备注 → 卡片上备注文本可见 |

## 4. 验证门禁（本 IDE 长命令走 Start-Process 后台 + 日志轮询，见 AGENTS.md 5c）

1. `npm test` 全绿（基线 493 + 新增）
2. `npm run build` 通过；JS 总量 ≤ 1120KB、max chunk ≤ 340KB（预期基本持平）
3. `npm run lint` 警告 ≤ 12
4. `npx playwright test`（E2E_PORT=5199，防 5173 被占）10+1 例全绿

## 5. 发布与提交拆分

1. `feat(tasks): 任务卡片信息升级——标题完整换行+备注字段+逾期日期徽章`（types/双仓储/迁移012/task-card.ts/TaskItem/TaskDialog + 测试）——可按 A（仓储链路）B（UI）拆两个 commit
2. 四门禁全绿后 `docs: bump v1.25.0 changelog`（changelog.ts + package.json）+ tag `v1.25.0` + push
3. **push 前提醒用户在场执行迁移 012**（无备注写入其实安全，但按硬性约定迁移必须用户在场）
