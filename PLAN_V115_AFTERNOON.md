# v1.15 下午执行计划：体验补全批次（零迁移）

> 约束：用户外出，**本批次全部零数据库迁移**——需要跑 SQL 的项（速记多标签、月历视图聚合实体等）一律排除，留待下次在场配合。
> 安全网：vitest 374 + E2E 6 + 契约测试 + CI 全量门禁均已生效；按 VERSIONING 归并规则，本批次（feat 为主）发 **v1.15.0**，用 `scripts/release.mjs --yes` 一键发版（首次实战）。commit message 按 feat/fix 规范写，changelog 条目由脚本聚合生成。

## 待执行（按序）

### A. 提醒中心强化
- 顶部筛选 chips：全部 / 未读 / 已忽略
- 「全部忽略」按钮（未读全部 dismiss，乐观更新复用现有 mutation，二次确认 window.confirm）
- 验收：筛选正确切换；全部忽略后未读 0、角标清零；恢复不受影响

### B. 番茄钟统计与体验
- 页面加「今日专注」统计条：今日番茄个数 + 分钟数（listFocusSessions 前端过滤，localDateOfISO 口径）
- 今日专注记录列表（时间 + 分钟 + 主题 note，最多 8 条）
- 运行中把倒计时写进 document.title（如 `24:31 · 专注中`），切到别的标签页也能看到
- 验收：完成后统计条 +1；标题倒计时每秒变化；休息阶段标题恢复

### C. 目标 → 今日待办联动
- 进行中目标卡片加「拆解到今日」按钮：createTask（title=「【目标】{title} · 推进 {步长}」，dueDate=今天），步长=target≥10?5:1
- 每目标每次会话只允许一次（useRef Set 防重复），成功 toast
- 验收：按钮创建任务且今日待办可见；重复点击被防抖

### D. 备份提醒
- 下载备份成功时记录 localStorage 'wb:last-backup'
- 设置页数据管理区显示「上次备份：X 天前」；超 7 天黄字提醒「建议每周备份一次」
- 验收：无记录显示「从未备份」；刚备份显示「刚刚」

### E. papers 文件夹操作替换 window.prompt（H23 遗留）
- 新建/重命名文件夹改用 Dialog + Input（项目已有 dialog 组件与模式）
- 验收：建/改名成功；E2E 不回归

### F. 热点搜索 + 论文列表读完徽标
- hot 页顶部加关键词过滤（标题 contains，纯前端，复用速记搜索样式）
- papers 列表行：done 状态显示「读完 M-D」小字（finishedAt）
- 验收：过滤即时生效；读完徽标正确

### G. 离线指示器 + 死配置清理
- layout 全局：navigator.offline 时顶部细条「当前离线，数据将保存在本机」（online/offline 事件监听）
- registry 移除无消费方的 mobileOrder 字段（盘点确认 dead config）
- 验收：DevTools offline 模拟显示横幅；build 通过

## 发版
全部完成 → `npm test` + `npm run build` + lint 基线对比 + E2E → `node scripts/release.mjs --yes --title="..."` 自动判 MINOR、写 changelog、同步版本号、tag、push。

## 明确不做（需用户在场跑 SQL / 或价值不足）
- 速记多标签（tag→tags 迁移）、月历视图独立实体、提醒中心分页
- 命令面板扩展（现有覆盖已够，避免范围膨胀）
- E2E 新用例补充（现有 6 条覆盖本批次核心页面）
