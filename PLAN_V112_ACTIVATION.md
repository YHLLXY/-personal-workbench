# v1.12 计划：番茄钟修复 +「存在但不强大」功能全面激活

> 流程：番茄钟 bug 已修复（见 §1）→ 全盘盘点 6 个模块（Explore 代理完成）→ 调研成熟方案 → 本计划 → 并行执行 → 统一验证 → commit/push。
> 核心结论：**模型跑在 UI 前面**——`Note.archived`、`Task.status='someday'`、`FocusSession.note`、`Paper.rating/tags` 字段与接口全部存在但没有任何界面使用。本轮全部为**纯前端激活，零迁移、零新依赖**（画趋势用手绘 SVG，提示音用 Web Audio，庆祝复用 v1.11 的 celebrate）。
> 调研参考：[Strides（SMART 目标范本）](https://www.stridesapp.com/)、[GoalsOnTrack（目标→里程碑→行动分层）](https://www.goalsontrack.com/)、[Reclaim（用户预期：streak/图表/里程碑/提醒）](https://reclaim.ai/blog/goal-tracker-apps)、[Figma SMART 指南](https://www.figma.com/resource-library/how-to-write-smart-goals/)、[NNGroup 微交互](https://www.nngroup.com/articles/microinteractions/)。
> 避坑清单（来自经验总结）：不改 api/projects.ts 单文件约束；分模块 commit；全绿才提交；lint 基线 11 对比；语义修改先看消费方；**并行代理文件集互不相交，代理不跑 build/test，由主线统一验证**。

---

## §1 番茄钟圆环 bug（已修复，主线自做）

**根因**：`pomodoro.tsx adjustFocusMinutes` 把加的时长**加进了 elapsed**（"总长与已用同增同减，剩余不变"）。未开始时点 +：25→30 分钟，elapsed 凭空 +5min，剩余仍显示 25:00，圆环缺一角（25/30）。运行中加时同理白扣时长。

**修法**（已改）：加时 = 延长本节——`elapsed` 不动、`totalSeconds` 增加，剩余即时 +delta。
**同类排查**：全仓 grep `conic-gradient`/`strokeDasharray` 仅番茄钟一处使用；`ui/progress` 进度条自带 clamp，goals 页已 `Math.min(100,…)`——无同类问题。

## §2 学习管理升级（主线自做）

1. **番茄钟完成反馈**：完成 toast + celebrate('grand') + Web Audio 短提示音（三连音 880/1100/1320Hz，0.6s，音量 0.15，无新依赖）；新增可选输入「这次专注做什么？」→ 写入 `FocusSession.note`（接口现成，字段此前从未使用）。
2. **celebrate 通用化**：从 `modules/growth/celebrate.ts` 迁到 `lib/celebrate.ts`（growth 两处 import 更新；测试路径同步），供目标里程碑复用。
3. **学习目标增强**：
   - 步进：`-1 / +1` 旁增加 `+5 / +10`（target≥10 显示）；点击「x / target」数字区弹 inline 输入精确设置进度；
   - 截止速率：有截止日时显示「剩 X 天 · 每天约 Y」（Y=ceil(剩余量/天数)；已逾期红字「已逾期 N 天」）；
   - 进度条上加 25/50/75 刻度线；跨越里程碑时 `celebrate('single')` + toast「已过 50%」；达成 100% 时 `celebrate('grand')` + toast，与归档按钮衔接。
   - 验收：±步进与精确输入后进度条/百分比正确；速率计算正确（含逾期分支）；里程碑庆祝触发且 reduced-motion 降级。

## §3 四个模块的并行升级（子代理执行，文件集互不相交）

| 代理 | 模块 | 内容 | 文件集（禁区见下） |
|---|---|---|---|
| B | 速记 + 热点 | ①notes：搜索框（按内容）+ 标签筛选 chips + 归档/恢复按钮 + 「归档箱」折叠区（`archived` 字段激活，`updateNote` 接口现成）；②hot：已读标记（localStorage 存已读 id 集合，已读条目标题变灰）+ 每条「存入速记」按钮（createNote 带 title+url） | `src/modules/news/notes.tsx`、`src/modules/news/hot.tsx`、新 `tests/news-view.test.ts` |
| C | 复盘 | ①「明日计划」区一键转明日待办（按行/分号拆分，createTask dueDate=明天，成功 toast 条数）；②头部连续复盘天数（复用 streak 思路）；③最近 14 条心情/评分手绘 SVG 迷你趋势 | `src/modules/review/review.tsx`、新 `tests/review-plan.test.ts` |
| D | 待办 | ①someday 收件箱：`/tasks` 页底部折叠区列出 `status==='someday'` 任务，支持「移到今天」（status→todo + dueDate=today）/编辑/删除；②任务弹窗加状态选择（todo/someday）；③标签筛选 chips + 标题关键词搜索（筛选作用于今日与逾期两个区块） | `src/modules/overview/today-tasks.tsx`、`task-dialog.tsx`、`api.ts`（纯函数）、`tests/task-filter.test.ts`（追加） |
| E | 论文库 | ①评分筛选（≥N 星 chips，`rating` 字段激活）+ 排序下拉（默认更新时间/评分/标题）；②「复制引用」按钮：纯函数生成简引用与 BibTeX（authors/title/year/url/doi，clipboard API），列表行 + 详情抽屉均可复制 | `src/modules/news/papers.tsx`、`paper-detail.tsx`、新 `src/modules/news/cite.ts`、新 `tests/papers-cite.test.ts` |

**代理共同守则**（写进各自任务书）：遵守现有紧凑代码风格与中文注释；不引新 npm 依赖；不写数据库迁移；不碰 `registry.ts`/`lib/db/types.ts`/`news/api.ts`（B 与 E 的共享禁区）；不跑 `npm test`/`build`（主线统一验证），只允许对自己的文件跑 `npx oxlint`；筛选/解析等逻辑写成可测纯函数并配 vitest 用例（仿 `task-filter.test.ts` 风格）；完成后报告改动文件与函数清单。

## §4 执行顺序与验证

1. 主线：celebrate 迁移 + 番茄钟反馈 + 学习目标升级（与代理并行）。
2. 四代理并行（文件集互斥，无合并冲突）。
3. 主线统一收口：`npm test` 全量 → `npm run build` → lint 基线对比（11）→ 问题主线修复。
4. changelog **v1.12** → 分模块 commit（`fix(study)` / `feat(study)` / `feat(news)` / `feat(review)` / `feat(overview)` / `docs`）→ push。
5. 部署后人工验收点：番茄钟加时圆环即时补满；目标 +5 步进与里程碑庆祝；速记搜索/归档；热点已读变灰；复盘一键转待办；论文复制引用。

## §5 本轮明确不做（避免扩散）

- 目标截止提醒接入 reminders（需扩 refType 迁移，页面内速率提示已覆盖 80% 价值）
- note 多标签/置顶、paper finishedAt、goal completedAt、周复盘独立实体（均需迁移，缓做）
- AI 摘要/arXiv 全文抓取等外部依赖型功能（不稳定，花架子）
- 番茄钟与目标直接联动统计（note 字段先激活，统计以后再说）
