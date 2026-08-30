# 今日待办状态切换体验（闪烁 / 坠落动画 / 撤销）调研与方案

> 2026-08-28 调研整理，v1.21.0 实施。
> 用户反馈原话：①设好任务后补加星标，任务会闪烁；②点击完成任务后它瞬间消失一下，然后才被纳入已完成区块；③希望任务从原区块**坠落/下降**到已完成区；④已完成可撤销，但**找不到怎么撤销**。
> **拍板结果**：乐观更新镜像 `completedAt` 派生规则（根因修复）；动画原定 **Motion（原 Framer Motion）共享布局动画**，实测 core+domMax +123KB 破总量预算（1179/1120）后**降级为零依赖手写 FLIP**（`src/lib/flip.ts`，+2KB，效果等价，见 §3.B 修订）；撤销走 **Todoist 同款 snackbar 模式**（toast 带「撤销」按钮 5 秒）+ 已完成方块 hover 变撤销图标；保留既有划线保留语义不变。
> **落地修订（同日）**：Motion 方案实施到一半被包体预算拦截——`LazyMotion` 异步 domMax 特性虽不破单 chunk 上限（324/340），但总 JS 量 1056→1179（+123KB，超预算 +59KB）。按预案降级：`npm uninstall motion`，改 80 行 FLIP（Web Animations API），总量 1058/1120。动画效果验证等价（截帧自检 `.tmp-flip/`：坠落/滑顶/飞回中间帧均为连续滑移而非瞬移）。

---

## 1. 问题与根因定位（代码实证）

| 现象 | 根因 | 位置 |
|---|---|---|
| 完成后任务"瞬间消失一下再出现在已完成区" | 乐观更新只 patch `{status:'done'}`，不写 `completedAt`；而已完成区过滤 `todayDone` 要求 `completedAt !== null` 且为今天。于是任务**立刻离开待办区、却进不了已完成区**，要等 `onSettled` 的 refetch 回来才出现，中间空几帧 | `src/modules/overview/api.ts` onMutate vs `todayDone`（api.ts:55） |
| 加星标时任务"闪烁" | `todayTasks` 按 `focus` 优先排序（api.ts:52），补加星标后任务**瞬间跳到列表顶部**，无任何过渡动画，视觉上等同闪没再出现 | `src/modules/overview/api.ts` + today-tasks 渲染 |
| 撤销找不到 | 撤销入口=已完成区里再点一次方块，但完成态方块渲染为静态绿色对勾，无 hover 反馈、无图标暗示，aria-label 也叫「完成」；提示文案"点方块可撤销"藏在折叠标题里，可发现性太差 | `src/modules/overview/task-item.tsx:13-17` |

乐观更新框架本身已有（onMutate cancelQueries + setQueryData + onError 回滚，符合 TanStack Query v5 规范），**错在乐观对象和仓储层最终对象不一致**——仓储层会在 status 变 done 时派生 `completedAt`（`local-repository.ts:36-41`、`supabase-repository.ts:121` 同规则），前端缓存层不知道这条规则。教训：**乐观 patch 必须产出与仓储层完全一致的对象**，派生字段规则只实现一处、共享复用。

## 2. 调研：成熟方案

### 2.1 跨区块移动动画（"坠落"）

- [Motion 官方：Layout Animations（FLIP + Shared Element）](https://motion.dev/docs/react-layout-animations)：`layout` 属性自动动画元素的尺寸/位置变化（FLIP 技术）；`layoutId` 做**共享元素过渡**——旧位置卸载、新位置挂载同 id 元素，自动从旧盒子飞到新盒子。同一渲染提交内换位即可，无需 AnimatePresence（那是退场动画用的）。实践参考：[Maxime Heckel 深度文](https://blog.maximeheckel.com/posts/framer-motion-layout-animations/)、[jakub.kr 实战](https://jakub.kr/work/shared-layout-animations)。
- 候选对比：
  | 方案 | 体积 | 跨容器移动 | 结论 |
  |---|---|---|---|
  | **Motion `layoutId` 共享布局** | LazyMotion 下初始 4.6KB，domMax 特性异步分包 | ✅ 原生支持，兄弟元素同时平滑让位 | **选用** |
  | react-flip-toolkit | ~7KB | ✅ | 2021 年后停维护，React 19 兼容存疑，弃 |
  | @formkit/auto-animate | ~2KB | ❌ 只能列表内增删重排 | 只能做"两边各自滑入滑出"的近似，达不到"连续坠落" |
  | 手写 FLIP（Web Animations API） | 0 | 自行实现 | 双容器+兄弟让位+undo+StrictMode 边界多，自造轮子风险高 |
- 包体控制：[官方 Reduce bundle size](https://motion.dev/docs/react-reduce-bundle-size) + [LazyMotion](https://motion.dev/docs/react-lazy-motion)：`m` 组件 + `LazyMotion features={异步 import domMax}`，初始 4.6KB，layout 特性单独 async chunk（~25-30KB gz）。`strict` 模式防止误用全量 `motion` 组件。**本项目总预算 1120KB/单 chunk 340KB，当前 1056/324，该方案可过预算**；若超标降级为 auto-animate 近似方案。

### 2.2 撤销模式

- [Todoist 官方帮助](https://www.todoist.com/help/todoist/features/introduction-to-tasks-080OAXric) + [Reddit 讨论](https://www.reddit.com/r/todoist/comments/131sxlb/no_undo_for_accidentally_completed_tasks/)：完成任务后**底部弹出撤销通知**，几秒内可一键撤销；另有已完成视图兜底。
- [Material Design Snackbars 规范](https://m2.material.io/components/snackbars)：可撤销操作**必须**提供 Undo action，持续数秒。
- [UX StackExchange](https://ux.stackexchange.com/questions/34002/what-is-the-best-method-to-undo-an-action)：另一路是划线保留 + **把对勾变成"恢复"按钮**（Things 3 思路）。
- 共识：**瞬时 toast 撤销（5–8s）+ 持久兜底（已完成视图）** 双通道。本项目 v1.17 已建好兜底（已完成区划线保留），本轮补 toast + 把完成态对勾在 hover 时变成 ↺ 恢复图标（aria-label 改「撤销完成」）。

### 2.3 乐观更新规范

- [TanStack Query v5 Optimistic Updates](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates)：onMutate 里 `await cancelQueries` → 快照 → 写缓存 → onError 回滚 → onSettled 失效重取。已有实现符合；补[缓存被在途请求覆盖的已知坑](https://github.com/TanStack/query/discussions/10712)认知即可。
- 本轮增量：派生字段规则抽成共享纯函数 `applyTaskPatch`（types 层），乐观更新与 LocalRepository 共用，消灭三处两份的规则漂移。

## 3. 方案设计

### A. 根因修复：乐观对象与仓储层一致（消闪烁的"消失帧"）

```ts
// src/lib/db/types.ts 新增（唯一规则源）
export function applyTaskPatch(current: Task, patch: Partial<Task>): Task {
  const completedAt = patch.status === 'done' ? new Date().toISOString()
    : patch.status !== undefined ? null
    : patch.completedAt !== undefined ? patch.completedAt
    : current.completedAt ?? null
  return { ...current, ...patch, completedAt }
}
```

- `local-repository.ts updateTask` 改用之（行为不变）；乐观更新 `onMutate` 改用之（**修复**：点完成后缓存对象立即带 `completedAt`，`todayDone` 当帧收容，无缝出现在已完成区；撤销时立即清空回待办区）。
- Supabase 仓储是 SQL 行映射，规则保持内联（语义一致，注释互指）。

### B. 坠落动画（修订：零依赖 FLIP，见页首落地修订）

- ~~`npm i motion` + LazyMotion~~ → **`src/lib/flip.ts`**（约 50 行，Web Animations API）：每次 React 提交后（`useLayoutEffect`，绘制前）对比各 `[data-flip-id]` 元素与上一帧的**页面坐标**（含 scroll，滚动不误判），位移超 0.5px 就施加反向 `transform` 再动画回零（320ms `cubic-bezier(0.22,1,0.36,1)`）。
- `TaskItem` 根节点挂 `data-flip-id={task.id}`（一任务同一时刻只在一个区块，id 即全局唯一锚点）。今日→已完成：向下坠落；撤销：向上飞回；加星：平滑滑顶。飞行期 `position:relative + zIndex:10` 防止被相邻卡片不透明背景压住。
- 细节：details 折叠（0×0 矩形）不更新锚点，重展开按最后可见位置动画；`prefers-reduced-motion` 直接跳过；无 WAAPI 环境安全退化为瞬移；StrictMode 双调用天然幂等（锚点记录的是最终布局）。
- 单测 `tests/flip.test.ts`（锚点/反向帧/折叠防误判/复位/无 WAAPI 兜底）；截帧脚本 `scripts/flip-preview.mjs`（preview server 起着时跑，产物 `.tmp-flip/`）。

### C. 撤销升级

1. 完成时 toast：`toast.success('已完成', { description: '「标题」', action: { label: '撤销', onClick: 回退 patch } , duration: 5000 })`——Todoist 同款主撤销路径。批量"清理历史待办"合并为一条 toast，撤销整体回退。
2. 完成态方块 hover：✓ → ↺（RotateCcw）图标互换，title/aria-label 变「撤销完成」，光标可点暗示。
3. 折叠标题文案保留"点方块可撤销"；三个区块（今日/逾期/已完成）的 toggle 统一走同一个 `toggleDone` 处理器。

## 4. 实施步骤

1. `types.ts` + `applyTaskPatch` + 单测；`local-repository.ts` 切换共用
2. `overview/api.ts` onMutate 接入 `applyTaskPatch`
3. `npm i motion` + `motion-features.ts` + today 页 LazyMotion 包裹
4. `task-item.tsx`：m.div / layout / layoutId / hover 撤销图标
5. `today-tasks.tsx`：toggleDone 统一 + toast 撤销 + 批量清理 toast
6. E2E：待办闭环补 toast 撤销路径 + 「撤销完成」标签断言
7. build + bundle 预算检查 + Playwright 截帧自检（坠落中间帧）+ 全量回归

## 5. 风险与回滚

- **包体超预算**：domMax 特性独立 chunk 理论不破单 chunk 上限；总预算若破 → 降级 auto-animate（近似体验）或去掉 layoutId 只留同列表 layout。
- **`<details>` 容器测量**：共享元素飞入 details 内部依赖挂载帧 getBoundingClientRect，0→1 时整区挂载，若动画异常改用 AnimatePresence 双段过渡兜底。
- **E2E 稳定性**：动画期元素不稳定由 Playwright 自动等待吸收；必要时对动画断言加 expect+timeout，不在全局关动画（启动动画用例依赖真播放）。
- 回滚成本：A 是纯逻辑修复可独立保留；B/C 逐 commit 可单独 revert。
