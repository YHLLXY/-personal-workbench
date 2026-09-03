# v1.24 技术债 + UX 修复批（六项全做）

> 2026-09-03 整理。来源：2026-09-03 架构横扫（30+ 条发现）+ 浏览器实机走查 16 页（26 张证据图，`gui-test-screenshots/`，不入库）。
> 用户拍板：**全做，计划自查通过后执行**。
> 判级预估：壳层 sticky 为 feat → **v1.24.0（minor）**；发版前以 release.mjs dry-run 实际判级为准。

## 0. 范围（对齐走查报告的执行顺序表 + 顺手 P2/P3）

| # | 事项 | 级别 |
|---|---|---|
| A | deleteFolder 云端对齐 + 契约测试补盲区 + updateStudyGoal completedAt 对齐 | P1 数据 |
| B | 桌面壳层滚动修复（侧栏/顶栏固定，消除双滚动层） | P1 UX |
| C | 移动端待办头部碰撞 + 空态统一（health/study）+ 资料库下拉漏译 | P2 UX |
| D | ProjectInfo 形状守卫测试 + hot 源名对齐 | P2 漂移 |
| E | release.mjs 补 lint 门禁 + AGENTS.md 迁移清单修正 + .gitignore | P2 门禁 |
| F | changelog.ts（14.3KB）移出入口 chunk | P2 体积 |

**明确不做**（记录理由）：底部 6 Tab 减为 5（需产品决策砍哪个，不顺手定）；toast「已划线保留」断行（CJK 逐字换行为自然行为，改文案收益低）；supabase updateTask 内联派生改 applyTaskPatch（需先读当前行才能复用，成本>收益，语义已等价）；注册表外路径收敛（/settings、/projects/:name 迁入 registry 是结构重构，本批不动，已记录为后续项）。

## A. deleteFolder 云端对齐 + 契约补盲

**根因（已核实）**：`supabase-repository.ts:212-217` 只删目标行（子树靠 `wb_folders.parent_id` 的 `on delete cascade` 外键，002_add_folders.sql:15）+ 只把 `folder_id = id` 的直属资料归未分类；**子文件夹下的 papers 指向被级联删除的子文件夹 → 悬空**。本地（`local-repository.ts:129-143`）显式收集子树、删除、子树内 papers 全部归 null。语义以本地为准。

改法（云端）：
```
select id,parent_id → 收集子树 ids（与本地同算法）
update wb_papers set folder_id=null where folder_id in (ids)   ← 先于删除，RLS 自动限本人
delete wb_folders where id in (ids)                            ← 显式删子树，cascade 保留为双保险
```

契约测试（`repository-contract.test.ts`）：runScript 增两段——
1. **folders**：createFolder(父) → createFolder(子,parentId=父) → createPaper(folderId=父) + createPaper(folderId=子) → deleteFolder(父) → 快照：文件夹剩 0、两个 papers 的 folderId 均 null。
2. **盲区补齐**：exams（create 2 → update 1 → delete 1，快照字段）、growthActions（含 steps/targets JSON 往返、habitId 行动解绑）、focusSessions（create+list 计数/分钟）、reminders（按 types.ts 实际方法名，dismiss/restore 往返）、pushSubscriptions（save→list→remove）、channelConfigs（save→get 往返）。
fake supabase 需增：`.in(col, array)` 过滤（新云端 deleteFolder 用到）；其余按真实库语义补（cascade 已有 habits 先例）。

对齐项：`updateStudyGoal` 显式 completedAt patch——本地采纳（local-repository.ts:79-80）、云端丢弃（supabase-repository.ts:166），云端改为采纳 + 契约断言。

## B. 桌面壳层滚动修复

**实测**：`docScrollTop=306 / docScrollHeight=1106`（viewport 800）且 `mainScrollTop=644` 同时存在——文档级滚动与 main 内滚并存，`h-dvh overflow-hidden`（layout.tsx:50）未形成密封框架，长页滚动时侧边栏/顶栏滚出视野。
**疑点**：根容器应为 800px 却参与了 1106px 的文档高度——机制待定（dvh 在该环境的表现 or 溢出来源不明）。

实施（先诊断后修）：
1. 诊断：evaluate 实测根 div offsetHeight、`CSS dvh` 解析值、逐层找出 306px 溢出来源。
2. 修复（按诊断结果二选一，倾向前者）：
   - 根容器改 `fixed inset-0`（确定性视口尺寸，不依赖 dvh）+ `body { overflow-y: hidden }` 兜底；
   - 或精确修掉溢出来源。
3. 约束：main 保持唯一滚动容器（FLIP 的 window.scrollX/Y 恒 0 不受影响——首末帧同基准）；移动端同 Shell，main 内滚不变，改后必须双端手查 + e2e。

## C. 移动端待办头部 + 空态统一 + 漏译

- `today-tasks.tsx:64`：提示「标记 ⭐ 为今日焦点（最多 3 项）」包 `hidden sm:inline`——移动端只留计数，消除与「新建」按钮的挤压/断行。
- `health.tsx:46`：裸文本 → EmptyState + 「去习惯管理」按钮（health 页内 tab 状态提升或传回调，实施时按现有 tab 结构最小接线）。
- `study-manager.tsx:62-64`：裸文本 → EmptyState + 「添加考试」按钮（复用 header 的 setDialogOpen）。
- `growth.tsx:74`：顺手换 EmptyState（页面顶部已有导入 CTA 卡，此处低优先，改不动就记录放弃）。
- `news/papers.tsx`：顶部两个下拉显示英文 "all"——定位 select 渲染处改为中文标签（全部/论文/文案/进行中…按实际枚举）。

## D. 形状守卫 + hot 源名对齐

- 新 `tests/projects-shape.test.ts`：`import type` 双方 `ProjectInfo` / `ProjectDetail` / `ProjectsResponse`，类型级断言 `Equal<keyof A, keyof B>`（keyof 不含可选性——前端的 `dir?:` 是 CDN 在途缓存防御，经 AGENTS 衔接裁决**保留**；守卫目标是**字段集合**增删改名时双份必同步）。api 单文件约束决定类型无法共享，此测试是围栏。
- `lib/hot.ts:79` `'V2EX'` → `'V2EX 热门'`（对齐 api/hot.ts:90，直连降级与代理模式来源名一致）；实施时验证 api/hot.ts 无顶层副作用后，加 DIRECT_META ⊆ api SOURCES 名称一致性断言，不可安全 import 则注释互指。

## E. 门禁 + 文档

- `release.mjs:85`：门禁循环改为 lint → test → build（lint 最快放最前）；新增 `npm run lint` 后解析 `Found N warnings`，`N > LINT_BASELINE(12)` 抛错（落入既有 catch 回滚 changelog/package.json）。基线写成常量 + 注释「上调需在发版 commit 说明」。
- `AGENTS.md:34`：架构速查迁移行改为事实——001-010 共 11 个文件、002 编号重复（002_add_folders / 002_subscriptions，历史既成不改名）；**003+ 按文件名顺序执行、全部幂等（003_reminders 自述策略块除外）**。api/ 清单补 `weather.ts`、`air-quality.ts`。
- `.gitignore` 补 `gui-test-screenshots/`。

## F. changelog 移出入口 chunk

**链路（已核实）**：`layout.tsx:19` 静态 import `{ greeting }` ← `daily-summary.tsx` ← `CHANGELOG`（14.3KB），使全量历史日志进入入口 chunk。home.tsx（懒）与 me/settings（懒）为另两个消费方。
改法：`greeting` 移至 `src/lib/greeting.ts`（纯函数进 lib，符合既有约定）；layout 改从 lib 导入；daily-summary.tsx:75 内部使用改从 lib 导入；**删除 daily-summary 的 greeting 导出**（不留兼容转发，准则 #1）。changelog 随之只被懒 chunk 引用 → rolldown 归入共享异步 chunk。
验证：build 后确认 index chunk 不含「更新日志」数据（检查 chunk 内容或对比体积，入口预期 -14KB）。

## 实施顺序与提交切分

1. A（fix(repo) + test）→ 2. F（perf(app)）→ 3. B（feat(shell)，风险最高放中段，前有 A/F 热身验证链路）→ 4. C（fix(ux)）→ 5. D（test/refactor）→ 6. E（chore/docs）→ 全量验证 → dry-run 判级 → release。

## 验证清单

- [ ] `npm test` 全绿（含契约新增段）
- [ ] `npm run build` + `check:bundle`：预期总量 ~1063/1120（F 项 -14KB）、max chunk ≤340
- [ ] `npm run lint` ≤ 12（本批不新增警告）
- [ ] `npx playwright test` 9 用例等效全绿
- [ ] 手查：桌面长页滚动侧栏/顶栏固定、document scrollTop 恒 0；移动端滚动正常、底部导航/FAB 正常；设置页/待办页/健康页/学习页空态与文案
- [ ] 诊断记录：B 项 306px 溢出根因写回本文档

## 风险与回滚

- **B 项风险最高**（全站壳层）：双端手查 + e2e 兜底；`fixed inset-0` 若引发移动端异常，回退方案 = 仅 `body{overflow-y:hidden}` + 保留 h-dvh。
- 契约 fake 的 cascade/`.in` 语义必须镜像真实迁移（001 habits cascade、002 folders cascade），写注释锚定迁移文件。
- 每项独立 commit，单项 `git revert` 可回滚。

## 自查记录（写计划后过一遍，执行前完成）

- [x] 每项都有 file:line 实证，无想当然
- [x] api/*.ts 单文件约束：D 项用类型守卫测试而非抽共享模块 ✓
- [x] 双实现同步改：A 项云端对齐本地 + 契约测试防再漂移 ✓
- [x] 准则 #1 不留兼容：greeting 删除旧导出、无转发层 ✓；#2 最简实现：壳层修复倾向 fixed inset-0 一行级方案 ✓
- [x] 不越界：6 Tab、updateTask 重构等明确列入"不做" ✓
- [ ] （执行中补充）B 项诊断结论
