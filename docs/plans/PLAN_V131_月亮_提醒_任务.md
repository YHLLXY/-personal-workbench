# 实施计划 v1.31：月亮数据线 + 提醒派生重构 + 任务状态语义补完

> 日期：2026-10-16 · 依据：用户本轮三项要求（月出月落、提醒中心逻辑、今日待办再优化）
> 前置调研：`RESEARCH_月出月落.md`（月亮数据源）
> 判定版本：**MINOR**（新增月出月落/月相能力 + 提醒中心行为重设计 = feat 档；VERSIONING §2 多改动取最高档）

## 0. 用户原话与拆解

| 原话 | 拆解 |
|---|---|
| 「太阳的起落线做好了，为什么月亮的不做」 | 新增 `月出月落 + 月相` 一节，与 `SunArc` 对称 |
| 「为什么我以前写的提醒里面还有对应的留存？甚至于还可以恢复…是不是最初设计的缺陷」 | 确认是缺陷：提醒是**派生数据**却被做成了**实体**。「忽略 / 恢复 / 已忽略筛选 / 全部忽略」整体移除 |
| 「提醒到期了就发通知，过期了底色就变成红色」 | 保持到期投递；新增**逾期红底**（口径 = 引用对象的日期已过，与全站 `overdueTasks` 同一把尺） |
| 「新建任务时按紧急程度变换底色」 | 卡片底色 = 优先级令牌色 |
| 「焦点任务加金黄色星星 + 边框金黄色，里面底色仍按紧急程度」 | 边框被焦点覆盖、底色不被覆盖 |
| 「进行中 / 将来的逻辑是什么？有没有缺陷」 | 有。见 §3：`doing` 不影响任何过滤、「将来」不清日期/静默删重复/focusDate 复活 |

---

## 1. 月出月落（新增）

### 1.1 数据层（零依赖）

新增 `src/lib/moon.ts`：

```ts
export const CHONGQING = { lat: 29.563, lon: 106.5516 }   // 与 api/weather.ts UPSTREAM、vite.config.ts dev 代理同步
export interface MoonIllumination { fraction: number; phase: number; angle: number }
export function moonIllumination(date: Date): MoonIllumination   // phase: 0=新月 0.25=上弦 0.5=满月 0.75=下弦
export function moonPhaseName(phase: number): string            // 中文月相名
export interface MoonTimes { rise: Date | null; set: Date | null; alwaysUp: boolean; alwaysDown: boolean }
export function moonTimes(date: Date, lat: number, lon: number): MoonTimes
export function moonProgress(rise: Date | null, set: Date | null, now?: number): { t: number; inSky: boolean } | null
```

算法来源：Meeus《Astronomical Algorithms》截断版（月球黄经/黄纬/距离取主项 → 赤道坐标 → 时角 → 高度角，再对高度曲线做二次插值求过零点）。文件头注明出处与截断范围。

### 1.2 测试（`tests/moon.test.ts`）

| 用例 | 判据 |
|---|---|
| oracle 差分（`suncalc` devDependency） | 24 个日期 × 3 个纬度：照度 < 0.01、相位 < 0.005、月出/月落 < 3 分钟 |
| 独立锚点 | 2024-04-08 日全食（定义上是新月）相位 ≈ 0；2025-03-14 月全食（定义上是满月）相位 ≈ 0.5 |
| 性质 | 相位 29.53 天周期连续；照度 ∈ [0,1]；同日月出月落各至多一次 |
| 边界 | 高纬度极区返回 `alwaysUp/alwaysDown` 而不是垃圾时间；非法输入不抛 |

### 1.3 UI（`weather-dialog.tsx`，紧随 `SunArc`）

```
月出月落
[月出图标 月出]                        [月落图标 月落]
─────────●──────────────────────────     ← 冷色轨道：已过暗 / 未到亮（与太阳的琥珀暖色成对）
21:10                                08:44
盈凸月 · 照亮 78%
```

- 月亮用真实月相绘制（SVG：圆 + 按 `fraction`/`angle` 的明暗分界），不是固定圆盘
- `alwaysUp` / `alwaysDown` → 显示「整夜在地平线上 / 今夜不升起」，轨道置灰（不画假位置）
- 月相与位置在弹窗打开时算一次（`useMemo`，依赖当天日期）

---

## 2. 提醒中心：从「实体」回到「派生」

### 2.1 定位到的四个缺陷（改前先写红测试）

| # | 缺陷 | 证据 |
|---|---|---|
| ① | **改提醒时间永远不生效** | `diffReminders` 按 `(refType,refId,kind)` 去重，key 不含 `scheduledAt`；把任务提醒从 09:00 改到 18:00 → 服务端认为「已存在」→ 库里仍是 09:00 |
| ② | **已完成的提醒行永久滞留** | `sendDue` 遇已完成任务只 `skipped++`，行不删；提醒中心只增不减 |
| ③ | **tab「未读 N」与角标数字口径不同** | tab 数「未忽略」，角标数「未忽略且已到期」（`countUnread`） |
| ④ | **首页横幅可能显示还没到期的提醒** | 只过滤 `!dismissedAt`（**无时间判断**）再按 `scheduledAt` **倒序**取第一条 = 最不紧急的一条 |

### 2.2 新契约

```
提醒 = 引用对象（任务/考试/目标）在某个时刻的派生节点。
存在条件：引用对象「活着」。引用对象一旦终结（任务完成/删除、考试已过、目标归档/删除），提醒即刻消失。
字段：id / refType / refId / kind / scheduledAt / sentAt / createdAt   ← dismissedAt 删除
```

**增 / 改 / 删 三向对齐**（替换原 `diffReminders`）：

| 方向 | 规则 |
|---|---|
| 增 | `(refType,refId,kind)` 不存在 → 插入。**若 `scheduledAt` 已过，直接写 `sent_at = now`（不补发）**——否则首次同步/撤销完成会把几十条历史提醒一次性炸出来 |
| 改 | 存在但 `scheduledAt` 不同 → 更新。**新时刻在未来 → 清空 `sent_at`**（重新计时）；新时刻在过去 → 保留 `sent_at`（不抹掉投递记录、也不补发） |
| 删 | 引用对象的 key 不在 `liveRefKeys()` 里 → 删除（含引用对象已被删除的孤儿行） |

`liveRefKeys(tasks, exams, goals, now)` 单独导出（纯函数、可单测）：任务 `status !== 'done'`、考试 `examDate >= today(上海)`、目标 `status !== 'done' && deadline != null`。

### 2.3 逾期口径（用户要的红底）

**与全站 `overdueTasks` 同一把尺：日期级，不是时刻级。**

| refType | 逾期判据 |
|---|---|
| 任务 | `dueDate < today` 且 `status !== 'done'` |
| 考试 | `examDate < today` |
| 目标 | `deadline < today` |

于是三档视觉：**已逾期（红底）/ 已到期待处理（主色底）/ 即将到来（默认底）**。任务在到期当日不红、次日红——与「今日待办的逾期区」完全一致，不会出现同一个任务在两个页面一个红一个不红。

### 2.4 UI（`reminders-center.tsx` 重写）

- 去掉 全部/未读/已忽略 三个 tab 与「全部忽略」按钮，改为**三组**：已逾期（红）/ 待处理（到期未逾期）/ 即将到来
- 每行：状态底色 + 标题文案 + 引用对象日期 + `已通知/待通知` + 操作
- 操作从「忽略」换成**处理**：任务 → `完成` / `顺延到今天`；全部 → `前往处理`（跳源模块）
- 角标 = 已到期条数（随任务完成自然归零）

### 2.5 连带修改

- `src/lib/db/types.ts`：`Reminder.dismissedAt` 删；`WorkbenchRepository.dismissReminder/restoreReminder` 删
- `local-repository.ts` / `supabase-repository.ts`：对应删；`reminderFromRow` 同步
- `src/modules/reminders/api.ts`：三个 mutation 删（`useReminderMutations` 整体移除，改由任务 mutation 承担）
- `src/modules/reminders/format.ts`：`countUnread` → `countDue`；新增 `reminderState()`（三档）
- `reminder-banner.tsx`：改取**最该处理的一条**（逾期优先，其次最早的已到期），并给多条形如「N 条提醒待处理」
- `api/reminders.ts`：`reminderRowToClient` 去 dismissed_at；`sendDue` 查询去 `.is('dismissed_at', null)`；`runCheck` 接三向对齐
- **迁移 `017_drop_reminder_dismissed.sql`**：`alter table public.wb_reminders drop column if exists dismissed_at;`（幂等）。**由用户在场执行**；代码不依赖它，可先部署后执行

---

## 3. 今日待办

### 3.1 状态语义（回答「进行中/将来到底是什么」）

| 状态 | 现状 | 改后 |
|---|---|---|
| 待办 | 有日期 | 不变：有日期，按日期进今日 / 逾期 |
| 进行中 | **只影响今日区排序档位**，不影响任何过滤；日期不是今天时在今日页**完全不可见** | **正在推进、要天天看到** → 纳入今日区（`isTodayScope` 增加 `status === 'doing'`），保留排序优先；卡片胶囊可点回「待办」 |
| 将来 | 从今日/逾期剔除，只在页尾折叠区；**不清日期**（存下 `someday + dueDate` 矛盾数据）、**静默清空重复规则**（数据丢失）、全站唯一入口 | **无日期的收件箱**：切到「将来」强制 `dueDate = null`、**保留 `repeat`**；页尾折叠区可一键排到某天 |

### 3.2 另外修掉的两个缺陷

- **`focusDate` 复活**：`task-dialog.tsx:105` 无条件 `focusDate: todayStr()` ⇒ 编辑任何旧焦点任务都会把它拉到今天。改为**仅当焦点由关变开时**写今天；已开则保留原 `focusDate`。
- **口径同步**：`overview-summary.tsx` 的「今日待办 完成率」与 `overview-home.tsx` 的列表都走 `isTodayScope`，自动跟随（无需另改，但要在测试里断言）。

### 3.3 卡片视觉（`task-item.tsx`）

| 维度 | 规格 |
|---|---|
| 高优先级底色 | `bg-destructive/8` + `border-destructive/30` |
| 中优先级底色 | `bg-accent/12` + `border-accent/40`（燕麦黄，暖） |
| 低优先级底色 | 默认 `bg-card` + `border-border`（低优先级不抢注意力） |
| 焦点 | **边框 `border-amber-400/70`（只覆盖边框）** + 标题前金黄色实心星 + 右侧切换按钮金色 + 元信息行金色「今日焦点」胶囊 |
| 优先级点 | 保留（与底色互为冗余，色盲友好） |
| 逾期区 | 维持外层红包裹；优先级底色在其内部仍生效 |

新增 `src/modules/overview/task-card.ts` 的纯函数 `taskCardTone(task)` 返回 `{ card: string; border: string }` 类名表（**纯函数不进组件文件**，避 fast-refresh 警告），`task-item.tsx` 消费；`tests/task-card.test.ts` 断言三档 + 焦点覆盖关系。

---

## 4. 验证（改前先红、改后全绿）

| 层 | 命令 | 判据 |
|---|---|---|
| 单测 | `npm test` | 全绿；新增 `tests/moon.test.ts`、`tests/reminders-plan.test.ts`，改写 reminders 四件套 |
| 构建 | `npm run build` | tsc + vite 通过 |
| 体积 | `npm run check:bundle` | 三个数字均不超预算（零依赖方案应几乎无变化） |
| Lint | `npm run lint` | 警告 ≤ 基线 12 |
| E2E | `npx playwright test` | `e2e/smoke.spec.ts` 12 条通过 |
| 人工 | 截图 | 天气弹窗（日/夜）、提醒中心三组、今日待办各档底色 + 焦点 |

## 5. 风险与回滚

| 风险 | 对策 |
|---|---|
| 手写天文算错 | oracle 差分 + 日食/月食独立锚点；不达标不合并 |
| 删「忽略」后用户想静音某条 | 出口是**处理那件事**（完成/顺延/删除任务）——这正是用户本轮明确要的模型；若日后需要，可加「静音到明天」而不是恢复旧状态机 |
| 迁移 017 影响线上 | 代码不再读写该列，**先部署再执行迁移**；文件幂等，回滚 SQL 为 `add column if not exists dismissed_at timestamptz` |
| `doing` 纳入今日区导致堆积 | 卡片上一键切回「待办」；排序仍在焦点之后 |

## 6. 交付纪律（AGENTS「交付纪律」节）

1. 项目内 `docs/lessons-learned.md` 追加一节
2. 知识库：项目经验 → `30-项目/个人工作台/`；通用经验 → `40-经验教训/<主题>/`（预期 1~2 篇：门禁口径不一致、零依赖手写+测试裁判）
3. `91-MOC/操作日志.md` 追加一行（**必做**）
4. changelog + package.json 同步 v1.31.0，打 tag 并 push
