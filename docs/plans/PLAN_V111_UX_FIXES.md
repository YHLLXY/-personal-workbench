# v1.11 修复计划：响应速度 ×4 + 记录重复 + 打卡成就感 + 统计口径 + 可读性

> 六个问题全部完成根因定位（文件:行号见各节），其中两个需要在审阅时拍板的产品决策见文末「待拍板」。
> 执行原则同前：只做本文列出的事；每阶段跑 `npm test` + `npm run build` + lint 警告数对比（基线 11）；完成后版本号 bump 到 **v1.11**（changelog.ts 顶部插入，无 README 需同步），分模块 commit 后 push。
> 打卡反馈设计参考：[Nielsen Norman 微交互模型](https://www.nngroup.com/articles/microinteractions/)、[Duolingo streak 保留案例](https://growth.design/case-studies/duolingo-user-retention)、[Duolingo 连击设计五步法](https://yukaichou.com/gamification-study/master-the-art-of-streak-design-for-short-term-engagement-and-long-term-success/)、[canvas-confetti](https://www.npmjs.com/package/canvas-confetti)（约 5KB gzip，对比 tsParticles 40KB+，见[选型对比](https://www.pkgpulse.com/guides/canvas-confetti-vs-tsparticles-vs-party-js-celebration-2026)）、[Mobbin 庆祝动效案例库](https://mobbin.com/explore/mobile/screens/confetti)。

---

## 问题 1：提醒中心「忽略/恢复」反应很慢

**根因**（已定位）：点击后 `onSuccess` 失效 `reminders` 缓存 → 触发 refetch → 云端模式的 `fetchReminders` 调 `/api/check-reminders`（`src/modules/reminders/api.ts:20`），该接口每次都跑完整 `runCheck`（`api/reminders.ts:291`：全量扫描 wb_tasks/wb_exams/wb_reminders 三张表 + 重新生成提醒 + **逐个尝试发送 web push**）才返回列表。也就是说：点一下"忽略"，前端要等服务端做一遍完整的定时任务才肯重画 UI。叠加 `useReminders` 没配 `staleTime`（窗口聚焦/每次挂载都会打这个重接口），慢是必然的。

**修法**（`src/modules/reminders/api.ts`）：
1. `dismiss`/`restore` 改乐观更新：`onMutate` 里 `qc.cancelQueries({ queryKey: reminderKeys.all })` + `qc.setQueryData` 直接改缓存中对应项的 `dismissedAt`（本地写是同步的，云端写是一条 update，都足够可信）；`onError` 回滚缓存 + toast；**`onSuccess` 不再 invalidate**（写库已成功，本地缓存即真相，下次自然刷新会与服务端对齐）。
2. `useReminders` 加 `staleTime: 30_000`：30 秒内的聚焦/挂载不再反复打重接口（runCheck 仍有 cron 每日兜底，不影响推送时效）。
3. `useReminderSync`（未读角标）订阅同一 queryKey，自动跟随，无需改。

**验收**：点击忽略/恢复 UI 立即变化（<50ms）；断网点按钮回滚且提示；角标数字同步变化；切换页面回来角标仍正确。

## 问题 2：运动健康「身体记录」条目重复

**根因**（两个叠加）：
1. **可连击**：`src/modules/health/health.tsx:87` 记录按钮只校验了值非空，**没有 `create.isPending` 禁用**；云端一次 insert 要等网络往返，期间按钮可再点、也没有失败提示（无 `onError`）——网络稍慢或失败重试就写出两条。
2. **重复数据只进不出**：`wb_health_logs` 对同用户同日同类型同值没有约束（迁移 001 无 unique），写进去的重复行永远显示。列表按日期倒序全部展示，看起来就是"总是重复"。

**修法**：
1. 按钮 `disabled` 增加 `create.isPending`；mutation 补 `onError: () => toast.error('记录失败')`。
2. **语义修正（待拍板 ①）**：体重/睡眠这类"一天一个数"的记录改为**当日 upsert 覆盖**（再记一次 = 更新今天的值，不新增条目）；运动保留多条（一天多次运动是合理的）。云端 `createHealthLog` 对 weight/sleep 先查当日同类型 → 有则 update、无则 insert（一次额外查询可接受）；本地仓储同样处理。
3. **存量清理**（一次性，Supabase Dashboard SQL 编辑器执行，保留每组最新一条）：
   ```sql
   -- 注意：wb_health_logs 实际只有 id/user_id/log_date/type/value 五列，没有时间戳列。
   -- id 由 genId() 生成（Date.now() base36 前缀），id 字典序越大 = 创建越晚，故用 id 比较定"最新"。
   delete from wb_health_logs a
   using wb_health_logs b
   where a.user_id = b.user_id and a.type = b.type and a.log_date = b.log_date
     and a.id < b.id
     and a.type in ('weight', 'sleep');
   ```
   （执行前先 select 分组确认行数与值；42703 "column does not exist" 说明引用了不存在的列，先查 migrations 里的真实表结构。）

**验收**：快速连点记录按钮只产生一条；记录体重两次，当天列表只有最新一条；运动可多条；存量重复清零。

## 问题 3：今日行动打卡「没感觉」→ 成就感反馈体系

**根因**：纯状态翻转 + 一个小 toast，没有即时、多通道的正反馈（参考 Duolingo：反馈峰值在完成瞬间，且强度随连击递增）。

**设计**（三层反馈，全部集中在 `src/modules/growth/growth.tsx` TodayPanel 与首页 `src/modules/growth/cards.tsx`）：
1. **即时层（0ms，纯 CSS）**：点击 + 号 → 按钮缩放弹跳（`active:scale-90` + 完成态 check 打勾描边动画）；整卡完成态渐变高亮 + 标题划线动画；火焰连击数字 +1 时做一次放大回弹。
2. **庆祝层（完成瞬间）**：引入 `canvas-confetti`（约 5KB gzip，**动态 import 懒加载**，不影响首屏；不引入 react 包装层）。打勾瞬间从按钮位置喷射少量纸屑（粒子 60~80、主题色：鼠尾草绿 #5B8A72 + 燕麦黄 #D9C9A3）。
3. **升级层（里程碑递进，Duolingo 式）**：
   - 单项完成：小喷发 + 轻震动（`navigator.vibrate(15)`，移动端 PWA 有效，需 https）；
   - **今日行动全部完成**：大喷发（双侧+顶部）+ toast「今日行动全部完成 🎉 连击 N 天」+ 震动 `[30,50,30]`；
   - 连击达 7/30/100 天：喷发加强 + toast 升级文案（「连击 7 天 🔥」）。
4. **无障碍**：`prefers-reduced-motion: reduce` 时跳过纸屑与震动，保留状态变化与 toast。
5. 抽 `src/modules/growth/celebrate.ts`：`celebrate(el, intensity)` 纯函数封装（含 reduced-motion 判断），两处调用，附单测（reduced-motion 与参数分支，mock 掉 confetti 动态导入）。

**验收**：打卡有纸屑+震动+卡片动效；全部完成时明显更热烈；连击文案正确；reduced-motion 用户无动画但有 toast；首屏包体积无变化（confetti 懒加载）。

## 问题 4：总览「今日待办 8/8」把历史任务算进来

**根因**（已定位）：`src/modules/overview/overview-summary.tsx:20-22` 的 `inScope` 把 `dueDate < today`（**不分多老**）都算进"今日"口径——完成的旧逾期任务计入 done，未完成的旧逾期经 `todayTasks()`（`overview/api.ts:46` 同样把所有逾期计入）计入 total。历史积压越多，"8/8"越离谱，永远反映不了"今天"。

**修法**（口径收敛为"仅今天"，逾期另行提示）：
1. KPI「今日待办」：done/total 只算 `dueDate === today || focusDate === today`；`sub` 行改为「逾期 N 项」提示（N>0 时显示并标 destructive 色，N=0 显示完成率）。
2. `/tasks` 页头部「共 N 项」（`today-tasks.tsx:29`）同步改为仅今日计数；页面本身的逾期分区（近 7 天 + 折叠更早）**保持不动**——那是设计好的处理区，只是不再混进"今日"数字。
3. 移动端首页今日待办卡片（`overview-home.tsx:17`）：列表过滤为仅今日任务，逾期任务不混入（顶部已有 OverviewSummary 的逾期提示承接）。
4. 给纯函数补测试：`tests/` 中对 todayTasks 现有测试不受影响（函数不改），新增 OverviewSummary 口径的断言（inScope 抽为纯函数 `isTodayScope` 放 `overview/api.ts` 导出后测）。

**验收**：新建 3 个今日任务完成 1 个 → KPI 显示 1/3 · 完成率 33%；一条上月逾期未处理 → KPI 不受影响，sub 显示「逾期 1 项」。

## 问题 5：总览顶部提醒横幅字体不清楚

**根因**（一行代码）：`src/modules/reminders/reminder-banner.tsx:49` 文字用了 `text-primary-foreground/90`——浅色主题下这是**白色 90% 透明**，落在 `bg-primary/8`（近背景色的浅底）上几乎隐形；深色主题下 primary-foreground 是深绿，同样看不清。图例：图标 `text-primary`（可见）与角标（绿底白字，可见）都没问题，唯独正文选错了色。

**修法**：正文改 `text-foreground font-medium`；其余不动。补一条渲染断言进现有 `reminder-banner.test.tsx`（正文颜色 class 存在性断言，防回归）。

**验收**：亮/暗两主题下横幅正文都清晰可读。

## 问题 6：主题亮→暗「跳转延迟太大」

**根因**：`theme.tsx` 本身的 classList 切换是即时的（一帧内），慢的感觉来自**三态循环**：切换按钮（`layout.tsx:104`）按 浅色→深色→跟随系统→浅色 循环。当你处于「跟随系统」且系统是浅色时，点第一下 → 变成"浅色"（**画面毫无变化**），点第二下才变深色——体感就是"点了没反应/延迟大"。此外按钮图标在 system 态显示显示器图标，也让人误以为没点上。

**修法**：
1. `toggle` 改为按**当前生效主题**二态切换：`resolvedTheme === 'dark' ? setTheme('light') : setTheme('dark')`——任何状态下点一下必然变色。
2. 「跟随系统」不删除，但改从设置页进入：`settings.tsx` 加一行主题选择（浅色/深色/跟随系统，复用现有 Select 组件）；按钮的 system 态图标逻辑相应简化（按钮只负责明暗互换）。
3. 顺手补 PWA 细节：切换时同步 `<meta name="theme-color">`（当前缺失），避免手机状态栏颜色与页面脱节。

**验收**：任意状态下点按钮一次即完成明暗互换；设置页可选"跟随系统"且生效；移动端状态栏颜色跟随主题。

---

## 执行顺序

1. 问题 5 + 6（一行级修复 + theme 二态）→ build/lint
2. 问题 1（乐观更新）+ 问题 4（统计口径）→ 全量测试
3. 问题 2（按钮防连击 + upsert 语义）→ 全量测试；存量清理 SQL **单独发给你确认后**在 Supabase 执行（不进代码迁移）
4. 问题 3（celebrate 体系 + canvas-confetti 引入）→ 全量测试 + build 确认首屏体积无增长
5. changelog v1.11 + 分模块 commit + push（commit 拆分：`fix(reminders)` / `fix(health)` / `feat(growth)` / `fix(overview)` / `fix(theme)` / `docs: v1.11 changelog`）

## ⚠️ 待拍板（审阅时请回复）

- **① 身体记录语义**：体重/睡眠改为"当日覆盖"（推荐，符合直觉），还是保留"可多条、仅做防连击 + 去重清理"？运动两种方案下都保留多条。
- **② 主题「跟随系统」入口**：从切换按钮移到设置页（推荐，按钮一击必变色），还是保持三态循环不动、只改其他细节？
