# 验证记录 · 个人工作台 v1.0.0

> 日期：2026-08-04 ｜ 状态：自动化部分 ✅，交互部分 ⚠️ 待人工验收

## 自动化验证（本环境已完成）

- [x] `npm run build` 通过（tsc + vite，PWA sw.js/manifest 生成）
- [x] `npm test` 32 个测试全部 PASS（12 个文件：本地仓库/云端映射/任务过滤/番茄逻辑/热力图/复盘聚合/arXiv 解析/热点降级/命令面板/Guard/日期工具）
- [x] 懒加载验证：dist/assets 含 9 个页面 chunk——home / today-tasks / study-manager / pomodoro / hot / papers / notes / health / review（覆盖 5 大模块）
- [x] 路由冒烟：/ /tasks /study /pomodoro /hot /papers /notes /health /review /settings /login 全部 200
- [x] PWA：sw.js + manifest.webmanifest 生成，precache 34 条无重复
- [x] 未使用依赖 recharts 已移除（bundle 中 0 引用，package.json / package-lock.json 同步清理）

### 性能检查记录（2026-08-04）

| 指标 | 结果 |
|------|------|
| 主 chunk（index-*.js） | 225.72 kB（gzip 71.06 kB） |
| db chunk（Supabase 客户端） | 239.84 kB（gzip 62.98 kB），静态引入（App → lib/db → supabase-repository） |
| 合计首屏 JS | 约 465 kB raw / gzip 约 134 kB（< 160 kB 可接受线，不强制拆分） |
| 模块懒加载 | 5 大模块 9 个页面均独立 chunk，懒加载生效 |
| 待办/考试/热点/热力图/复盘卡片 | 卡片类小组件随主 chunk（registry eager import，正常） |

结论：主 chunk < 400 kB；Supabase 客户端按需引入需改造 repository 选择逻辑，收益约 63 kB gzip，个人应用当前不拆分（记录备查）。

## 待人工验收（浏览器操作，手机 + 电脑）

- [ ] 首页三端布局：>1024 侧边栏 / 600-1024 图标栏 / <600 底部 Tab + FAB
- [ ] 新建任务 → 今日待办与首页卡片出现 → 勾选完成 → 刷新后仍在（本地持久化）
- [ ] 标记今日焦点 ⭐ → 首页焦点卡显示
- [ ] ⌘K 命令面板 → 新建任务 / 前往各页面；移动端 FAB 弹出快速捕获
- [ ] 快速捕获：任务 / 速记 / 全部打卡 三 Tab
- [ ] 添加考试 → 首页倒计时天数正确
- [ ] 番茄钟：开始 → 暂停/重置 → 完成一轮验证专注记录（首页「今日专注」+1）
- [ ] 论文页 arXiv 搜索（网络可用时）→ 收藏 → 状态流转
- [ ] 速记：输入 → 停笔 1.2s 自动保存 → 列表出现 → 点击编辑 → 标签
- [ ] 习惯：创建习惯 → 今日打卡 → 首页热力图变色、连续天数 +1
- [ ] 身体记录：体重录入 → 列表出现
- [ ] 复盘页：当日汇总数字正确 → 写心情/总结/明日计划 → 保存 → 刷新后回填
- [ ] 深色模式切换（顶栏月亮/太阳按钮）
- [ ] 设置页显示「本地模式」；退出登录按钮不显示（本地模式）
- [ ] PWA 安装：Chrome 地址栏安装图标 → 添加到主屏幕 → 离线打开显示缓存壳
- [ ] 热点页刷新：多源聚合展示（GitHub/HN/V2EX）

## 云端模式验收（配置 Supabase 后）

- [ ] 执行 supabase/migrations/001_init.sql（SQL Editor）
- [ ] 配置 VITE_SUPABASE_URL/ANON_KEY 重新部署
- [ ] 登录 → 数据云端同步 → 手机/电脑双端一致
