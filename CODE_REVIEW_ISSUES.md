# 个人工作台 — 代码审查问题清单

> **生成时间**：2026-08-28
> **扫描范围**：`src/` 全部源码 + `api/` 全部 Serverless Functions + `supabase/migrations/` + 配置文件
> **扫描工具**：4 个 Agent 并行逐文件扫描（共 100+ 文件）

---

## 🔴 CRITICAL（5 个）

### C1. CRON_SECRET 时序攻击
- **文件**：`api/reminders.ts`
- **行号**：280
- **问题**：`!==` 比非常量时间，攻击者可逐字节爆破。且 `?? ''` 导致环境变量缺失时静默放行任何 token
- **修复建议**：改用 `crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual))`

### C2. 推送通知开放重定向
- **文件**：`src/sw.ts`
- **行号**：68-74
- **问题**：`url` 字段直接传给 `self.clients.openWindow(url)`，零验证。恶意服务器可发 `{ url: "https://evil.com" }` 打开钓鱼页
- **修复建议**：验证 `url` 以 `/` 开头或匹配 `self.location.origin`

### C3. 番茄钟重复创建 focus session
- **文件**：`src/modules/study/pomodoro.tsx`
- **行号**：76-85
- **问题**：`useEffect` 依赖 `liveElapsed`（每秒更新），`remaining` 归零后 effect 反复触发，无去重守卫，产生重复数据
- **修复建议**：加 `hasRecordedRef` 或 `useRef` 防止重入

### C4. 非幂等数据库迁移
- **文件**：`supabase/migrations/003_reminders.sql`
- **行号**：42-53
- **问题**：`CREATE POLICY` 无 `IF NOT EXISTS`，重跑报 `policy "p_select" already exists`，后续表策略全部不创建
- **修复建议**：包裹在 `DO $$ ... END $$` 循环或用 `IF NOT EXISTS`（参照 `006_study_goals.sql`）

### C5. 未捕获 Promise 导致 unhandled rejection
- **文件**：`src/modules/news/hot.tsx`
- **行号**：11
- **问题**：`loadHot(false).then(r => setItems(...))` 无 `.catch()`，网络异常时产生 unhandled rejection
- **修复建议**：加 `.catch(() => {})` 或 `.catch(console.error)`

---

## 🟠 HIGH（26 个）

### H1. 用户枚举漏洞
- **文件**：`api/auth.ts`
- **行号**：49-53
- **问题**：`/api/resolve-phone` 未认证，200 vs 404 可判断手机号是否注册，且泄露邮箱

### H2. 内部错误信息泄露（auth）
- **文件**：`api/auth.ts`
- **行号**：58
- **问题**：`err.message` 直接返回客户端，暴露数据库连接等实现细节

### H3. 内部错误信息泄露（reminders）
- **文件**：`api/reminders.ts`
- **行号**：300-303
- **问题**：同 H2，`err.message` 直接返回客户端

### H4. 热点 API 无整体请求超时
- **文件**：`api/hot.ts`
- **行号**：全局
- **问题**：25 源各 8s 超时，外层无 `AbortSignal.timeout()`，冷启动+多源慢可触 Vercel 超时

### H5. 热点 API 无认证 SSRF 代理
- **文件**：`api/hot.ts`
- **行号**：151-161
- **问题**：`sources` 参数可选任意硬编码 URL，无认证无限流，可耗尽函数资源

### H6. 备份验证缺失 studyGoals/growthActions
- **文件**：`src/lib/backup.ts`
- **行号**：16
- **问题**：`TABLE_KEYS` 不含 `studyGoals`/`growthActions`，`validateBackup` 放行不完整备份

### H7. importAll 并发竞态
- **文件**：`src/lib/db/supabase-repository.ts`
- **行号**：252-275
- **问题**：并发调用时 delete+upsert 交叉执行，数据覆盖

### H8. moveFolder 允许循环引用（Supabase）
- **文件**：`src/lib/db/supabase-repository.ts`
- **行号**：207-209
- **问题**：Supabase 版本无任何检查（local 版也仅检查自移），移动 A→B 和 B→A 形成循环

### H9. deleteFolder 无限循环风险
- **文件**：`src/lib/db/local-repository.ts`
- **行号**：114-117
- **问题**：循环引用时 `children` 集合持续增长，while 永不退出

### H10. ensurePhoneAlias 竞态
- **文件**：`src/app/auth.tsx`
- **行号**：47-56
- **问题**：select+insert 无唯一约束守卫，并发调用可重复插入

### H11. registerErrors() 性能问题
- **文件**：`src/app/auth-page.tsx`
- **行号**：213-239
- **问题**：每次渲染调用 8+ 次，每次跑正则+字符串归一化，未 memoize

### H12. SPAN_CLASS 缺值导致布局异常
- **文件**：`src/app/home.tsx`
- **行号**：61
- **问题**：未覆盖的 span 值静默 fallback 到 `col-span-6`，布局不符预期

### H13. daysBefore 时区风险
- **文件**：`src/modules/overview/api.ts`
- **行号**：63-66
- **问题**：`new Date('YYYY-MM-DDT00:00:00')` 解析为本地时间，与 `daysBetween` 的 UTC 处理不一致，可能差一天

### H14. greeting() 重复且不一致
- **文件**：`src/app/daily-summary.tsx`
- **行号**：15-19 vs 27-32
- **问题**：layout.tsx 和 daily-summary.tsx 两处 greeting 逻辑不同（0-5 点处理不一致），用户看到矛盾文案

### H15. useExamsSoon 无 loading 状态
- **文件**：`src/modules/overview/overview-home.tsx`
- **行号**：12
- **问题**：加载中 `exams` 为 undefined，考试卡片闪烁消失

### H16. Supabase 客户端无环境变量空值守卫
- **文件**：`src/lib/db/supabase-client.ts`
- **行号**：6-8
- **问题**：`createClient(undefined, undefined)` 抛晦涩错误，应提前校验

### H17. liveElapsed 每次渲染重算
- **文件**：`src/modules/study/pomodoro.tsx`
- **行号**：69
- **问题**：`Date.now()` 无 useMemo，每秒触发全组件树重算

### H18. 自动保存定时器未清理
- **文件**：`src/modules/news/note-editor.tsx`
- **行号**：18-28
- **问题**：组件卸载后 timer 仍触发，调用已卸载的 mutation

### H19. growth cards 每次渲染分配 Set+循环
- **文件**：`src/modules/growth/cards.tsx`
- **行号**：21-31
- **问题**：无 useMemo，频繁重渲染产生 GC 压力

### H20. reminders-center Map 每次渲染重建
- **文件**：`src/modules/reminders/reminders-center.tsx`
- **行号**：17-18
- **问题**：`taskById`/`examById` 未 useMemo

### H21. reminder-banner Map 每次渲染重建
- **文件**：`src/modules/reminders/reminder-banner.tsx`
- **行号**：32-33
- **问题**：同 H20，Map 每次渲染重建

### H22. growth cards done-check 逻辑不一致
- **文件**：`src/modules/growth/cards.tsx`
- **行号**：32-38
- **问题**：用 `some()` 判断完成但签到按钮逻辑与 health.tsx 不同

### H23. window.prompt 绕过 React 组件体系
- **文件**：`src/modules/news/papers.tsx`
- **行号**：58
- **问题**：不用 Dialog 组件，移动端行为不一致，样式不可控

### H24. notifications-section 未捕获 Promise
- **文件**：`src/modules/me/notifications-section.tsx`
- **行号**：22-24
- **问题**：`listPushSubscriptions().then(...)` 无 `.catch()`，IndexedDB 失败时 unhandled rejection

### H25. 移动端隐藏模块仍渲染
- **文件**：`src/components/mobile-entries.tsx`
- **行号**：10
- **问题**：过滤条件未检查 `mobileOrder: -1`，手机端显示 10+ 图标网格而非设计的 4 列

### H26. Vercel 重写路径暴露内部架构
- **文件**：`vercel.json`
- **行号**：3-6
- **问题**：`cron-notify`/`test-notify` 公开可见，应改用 Vercel crons 配置

---

## 🟡 MEDIUM（31 个）

### M1. HN 逐条串行 fetch
- **文件**：`api/hot.ts`
- **行号**：62-71
- **问题**：每条 HN story 串行 fetch，应并行（`Promise.allSettled`）

### M2. fetchDirect 串行获取 3 源
- **文件**：`src/lib/hot.ts`
- **行号**：95-100
- **问题**：GitHub/HN/V2EX 串行获取，可用 `Promise.any` 或并行

### M3. 单表查询失败导致整个 app 崩溃
- **文件**：`src/lib/db/supabase-repository.ts`
- **行号**：107
- **问题**：`listTasks()` 抛异常，网络抖动时整个应用不可用

### M4. Object URL 不可靠释放
- **文件**：`src/lib/backup.ts`
- **行号**：46-55
- **问题**：`URL.revokeObjectURL` 在 `click()` 后立即调用，下载可能未开始

### M5. YAML 关键词提取不完整
- **文件**：`src/lib/parse-import.ts`
- **行号**：46
- **问题**：多行 YAML 数组/内联数组 `[a, b]` 丢失关键词

### M6. tasksTotal 统计全量 done 而非当日
- **文件**：`src/lib/review-summary.ts`
- **行号**：25
- **问题**：`tasksTotal` 统计所有已完成任务，当日摘要的完成率无意义

### M7. arXiv XML 正则解析不可靠
- **文件**：`src/lib/arxiv.ts`
- **行号**：4-16
- **问题**：CDATA/嵌套标签/转义 HTML 会导致正则失败

### M8. saveSubscriptions user_id 回退空字符串
- **文件**：`src/lib/db/supabase-repository.ts`
- **行号**：286-288
- **问题**：`getUser()` 失败时 `user_id` 写入空字符串

### M9. navigator.platform 已废弃
- **文件**：`src/lib/hotkeys.ts`
- **行号**：20
- **问题**：iOS Safari 16.4+ 返回空字符串，应改用 `navigator.userAgentData`

### M10. genId() 同毫秒碰撞风险
- **文件**：`src/lib/db/types.ts`
- **行号**：211-212
- **问题**：`Date.now()` 毫秒精度，同毫秒调用产生相同前缀

### M11. VAPID 重复初始化
- **文件**：`api/reminders.ts`
- **行号**：153-162, 307-311
- **问题**：模块顶层和 `ensureVapid()` 各初始化一次

### M12. local-repository 原地修改对象引用
- **文件**：`src/lib/db/local-repository.ts`
- **行号**：121
- **问题**：`p.folderId = null` 原地修改，持有旧引用的调用方数据被意外变更

### H13. signOut/updateProfile 初始为空函数
- **文件**：`src/app/auth.tsx`
- **行号**：60
- **问题**：Provider 挂载前调用 signOut 静默无效

### M14. localStorage 写入触发跨标签 storage 事件
- **文件**：`src/app/theme.tsx`
- **行号**：36-38
- **问题**：PWA 多标签场景下可能导致意外状态同步

### M15. 习惯签到串行 DB 操作
- **文件**：`src/app/quick-capture.tsx`
- **行号**：44-51
- **问题**：`addLog.mutate()` 内串行 listHabits→listHabitLogs→setHabitLog，N+2 次查询

### M16. inScope 过滤逻辑导致进度条低估
- **文件**：`src/app/overview-summary.tsx`
- **行号**：20-21
- **问题**：今日完成但 dueDate 在明天的任务不被计入 done/total

### M17. weekly-trend-chart selected 初始化为 -1
- **文件**：`src/modules/overview/weekly-trend-chart.tsx`
- **行号**：18
- **问题**：`days` 为空时 `selected = -1`，非 null 语义

### M18. recovery token 未用后失效机制缺失
- **文件**：`src/app/reset-password.tsx`
- **行号**：31
- **问题**：`setSession` 后 token 未消费，用户离开再回来 session 仍存在

### M19. Supabase 错误信息暴露给用户
- **文件**：`src/app/auth-page.tsx`
- **行号**：46-52
- **问题**：未处理的错误直接 `return error.message`，泄露实现细节

### M20. startsWith 无尾斜杠路由误匹配
- **文件**：`src/app/layout.tsx`
- **行号**：57
- **问题**：`/tasks` 匹配 `/tasks-extra`，路由判断不精确

### M21. CrossRef API 响应无 schema 校验
- **文件**：`src/modules/news/add-paper.tsx`
- **行号**：63
- **问题**：外部 API 响应直接 `as` 类型断言，无运行时校验

### M22. JSON.parse 无 schema 校验
- **文件**：`src/modules/news/paper-detail.tsx`
- **行号**：14-17
- **问题**：`summary` JSON 直接断言类型，损坏数据会导致渲染崩溃

### M23. 习惯计数无法从 1 回到 0
- **文件**：`src/modules/health/health.tsx`
- **行号**：48
- **问题**：toggle 逻辑 `done >= target ? done-1 : done+1`，done=1 时点击变成 2 而非 0

### M24. switch 无 default 返回 undefined
- **文件**：`src/modules/reminders/format.ts`
- **行号**：10-17, 20-26
- **问题**：新增 `Reminder['kind']` 时 TypeScript 不报错，运行时返回 undefined

### M25. 时区依赖的日期计算
- **文件**：`src/modules/study/api.ts`
- **行号**：38
- **问题**：`daysUntil` 追加 `'T00:00:00'` 无时区信息，跨时区可能差一天

### M26. invalidateQueries 无参数失效全部缓存
- **文件**：`src/modules/me/settings.tsx`
- **行号**：165
- **问题**：导入后 `qc.invalidateQueries()` 失效所有 query，造成不必要的全量重fetch

### M27. stale 数据递归刷新无重试上限
- **文件**：`src/modules/news/hot.tsx`
- **行号**：26
- **问题**：`if (r.stale) load(true, true)` 无重试计数，网络持续失败时无限递归

### M28. .env.test 白名单被 .env* 覆盖
- **文件**：`.gitignore`
- **行号**：19, 33
- **问题**：行 19 `!.env.test` 白名单被行 33 `.env*` 重新忽略，git 最后匹配生效

### M29. reminders 无 limit 查询
- **文件**：`api/reminders.ts`
- **行号**：168-170
- **问题**：`select('*')` 无 `.limit()`，大数据量可 OOM

### M30. 导航 fallback 与 Workbox 重复请求
- **文件**：`src/sw.ts`
- **行号**：80-86
- **问题**：手动 fetch handler 与 Workbox `registerRoute` 可能重复处理同一请求

### M31. add-note 死代码 onClick
- **文件**：`src/modules/news/add-note.tsx`
- **行号**：83
- **问题**：`onClick` 为空函数，按钮靠 `<label>` 触发，空回调易误导

---

## ⚪ LOW（10 个）

### L1. arxiv clean() 不处理数字 XML 实体
- **文件**：`src/lib/arxiv.ts`
- **行号**：17-22
- **问题**：不解码 `&#39;`/`&#x27;`/`&quot;`

### L2. 传 undefined 字段可能覆盖为 null
- **文件**：`src/lib/db/supabase-repository.ts`
- **行号**：114
- **问题**：partial update 传 undefined，Supabase JS 可能写入 null

### L3. streakFromLogDates 循环创建 Date
- **文件**：`src/lib/heatmap.ts`
- **行号**：22-27
- **问题**：最多 3650 次 `new Date()`（个人应用影响小）

### L4. localStorage 损坏时静默重置
- **文件**：`src/lib/pomodoro.ts`
- **行号**：15-24
- **问题**：损坏时 catch 静默返回默认值，无用户提示

### L5. dateStr 每次渲染重算
- **文件**：`src/app/layout.tsx`
- **行号**：37-38
- **问题**：`new Date()` 每次渲染调用，应 useMemo

### L6. Command Palette 关闭不重置搜索词
- **文件**：`src/app/command-palette.tsx`
- **行号**：83-84
- **问题**：关闭后 `q` 持久化，下次打开显示旧过滤结果

### L7. 引导弹窗未 trap focus
- **文件**：`src/app/onboarding.tsx`
- **行号**：34
- **问题**：有 `role="dialog"` 但 Tab 可逃逸到遮罩下元素

### L8. empty-state 冗余 icon 类型判断
- **文件**：`src/components/empty-state.tsx`
- **行号**：9
- **问题**：`typeof icon === 'string'` 分支可能永远不执行

### L9. homeCard 定义在 hidden 模块上
- **文件**：`src/registry.ts`
- **行号**：53, 102
- **问题**：`mobileOrder: -1` 模块有 `homeCard`，桌面端显示但移动端隐藏，内容可能引用不可用功能

### L10. health_logs 无唯一约束
- **文件**：`supabase/migrations/001_init.sql`
- **行号**：72-78
- **问题**：`wb_health_logs` 允许同用户同日多条体重/睡眠/运动记录

---

## 📊 统计

| 严重度 | 数量 | 占比 |
|--------|------|------|
| CRITICAL | 5 | 7% |
| HIGH | 26 | 35% |
| MEDIUM | 31 | 42% |
| LOW | 10 | 14% |
| **合计** | **72** | — |

## 🎯 TOP 5 优先修复

| 优先级 | 编号 | 问题 | 修复难度 |
|--------|------|------|----------|
| 1 | C1 | CRON_SECRET 时序攻击 | 低（1 行） |
| 2 | C2 | 推送通知开放重定向 | 低（3 行） |
| 3 | C3 | 番茄钟重复 session | 低（加 ref 守卫） |
| 4 | C4 | 非幂等迁移 | 中（重写 SQL） |
| 5 | H9 | deleteFolder 无限循环 | 低（加 max iteration） |
