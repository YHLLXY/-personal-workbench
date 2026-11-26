# 回滚手册（大迭代前基线：v1.34.1 / pre-v1.35）

> 生成：2026-11-26 · 适用：v1.35 及之后的大迭代
> 基线锚点：tag `pre-v1.35` = `f12b6b255e`（代码与 v1.34.1 一致，仅多两份文档）
> 历史备份：`E:\homework\开发\workbench-history-backup-2026-11-26.bundle`（1.5MB，含 main + 42 个 tag，`git bundle verify` 通过）
> 配套事实底稿：`docs/FEATURE_MAP.md`

---

## 1. 先记住三件事

1. **代码回滚 ≠ 数据回滚**。git 只管代码；Supabase schema/数据、Vercel 环境变量、浏览器本地数据都不在 git 里。
2. **最快的回滚不是 git，是 Vercel**。每次部署都是不可变快照，把上一个好版本 Promote 回 Production 即可，不动仓库。
3. **git 回滚优先 `git revert`，不要 `reset --hard` + force push**。后者会重写 main、让 tag 与远端分叉；除非确认只有你一个人且已备份。

---

## 2. 回滚决策树

```
出问题了
├─ 只是页面/接口报错，数据库没动
│   ├─ 想 1 分钟内恢复 → Vercel: Deployments → 上一个 Good → Promote to Production
│   └─ 想修仓库 → git revert <坏提交> → push（Vercel 自动重部署）
├─ 数据库迁移已执行
│   ├─ 迁移是「只加列/加表」（本项目惯例）→ 旧代码通常仍能跑；先 Promote 旧部署
│   ├─ 迁移改了/删了旧列、改了 CHECK、回填了数据 → 不要只回代码
│   │   ├─ 停止写入（或只读维护）
│   │   ├─ 评估：新数据能否丢？→ 能：恢复备份；不能：写前向修复 SQL
│   │   └─ 代码与 SQL 一起回，顺序：先停写 → 回代码 → 回数据 → 验证 → 开写
│   └─ 迁移没执行 → 直接回代码，最安全
├─ PWA 还是旧/新包混着 → 关掉重开；仍不行 → 清除站点数据 / 重装 PWA
└─ 只是某个功能坏，其他正常 → 优先前向修复；大迭代期间不要为了小问题整体回滚
```

---

## 3. 四层资产与回滚手段

| 层 | 资产 | 回滚手段 | 备注 |
|---|---|---|---|
| 代码 | git 历史 / tag | `git revert`；紧急时 Vercel Promote；最后才 reset+force | 42 个 tag 全部已推远端 |
| 部署 | Vercel Deployments | Dashboard → 选中旧部署 → Promote to Production | 部署不可变，最可靠 |
| 数据库 | Supabase Postgres | Dashboard 备份 / PITR；或 `pg_dump` 文件 | 迁移前必须有一次可恢复备份 |
| 本地数据 | 浏览器 IndexedDB/localStorage | 「我的 → 数据管理 → 导出备份」JSON | 大迭代前手动导一次 |
| 环境变量 | Vercel / Supabase | **不在 git**；改动前把变量名与值另存 | 回代码不会回 env |
| 静态资源 | SW 预缓存 | 重新部署后让 SW 自动换包；必要时清站点数据 | autoUpdate + skipWaiting |

### 3.1 Vercel 回滚（首选，约 1 分钟）

1. Vercel → 项目 → Deployments。
2. 找到最后一个已知正常的 Production 部署（按时间/commit）。
3. 右侧 `⋯` → **Promote to Production**。
4. 打开线上 URL 验证：首页、`/tasks`、`/settings`、`/api/projects`。

> 注意：Promote 只换前端/函数产物，**不会回滚数据库**。若新代码已写入新格式数据，旧代码要能兼容（见 §5）。

### 3.2 Git 回滚（需要改仓库时）

```bash
# 推荐：保留历史，生成一个反向提交
git revert --no-edit <bad_sha>            # 多个提交按从新到旧
git push origin main

# 只在万不得已、且确认无人协作时（会重写 main）
git reset --hard pre-v1.35
git push --force-with-lease origin main
```

- 回滚后**不要移动已发布的 tag**；新问题用新 PATCH 版本修（VERSIONING §6）。
- 如果坏提交很多，可 `git revert --no-commit <old>..<new>` 一次生成一个回滚提交，再统一提交。
- 强制推送前先 `git bundle create` 备份当前 main。

### 3.3 数据库回滚

- **优先前向修复**：加列/加表/补数据都是可前向的；删列/改类型才是不可逆的。
- 恢复备份前先确认「备份之后写入的新数据是否可以丢」；大迭代测试期最好用测试账号/测试数据。
- 本项目迁移全部在 `supabase/migrations/`，用户手动执行；**agent 不碰线上库**。
- 恢复后必须重跑：`/api/check-reminders`、`/api/digest-selftest`、首页、任务、提醒、复盘。

### 3.4 PWA / Service Worker

- 部署回滚后，已安装 PWA 下次打开会自动换包（`autoUpdate` + `skipWaiting` + `clientsClaim`）。
- 若仍是坏包：关闭所有标签页/杀进程重开；仍不行 → 浏览器站点设置里清除数据（会清本地模式数据，先导出备份）。
- 不要通过改 `sw.js` 缓存头来“修”，先确认部署真的回滚了（看页面底部版本号 / 更新日志头部）。

---

## 4. 大迭代开工前检查清单

- [x] `pre-v1.35` tag 已创建并推送（指向 `f12b6b255e`）。
- [x] 全量历史 bundle 已生成并 `git bundle verify` 通过。
- [x] 仓库对象库已整理：308 个 pack / 236MB → 1 个 pack / 1.55MB；`git fsck --full` 干净。
- [ ] 在 Supabase 做一次数据库备份（Dashboard 备份或 `pg_dump`），确认能恢复到新库。
- [ ] 在「我的 → 数据管理」导出一次本地数据 JSON（若用本地模式）。
- [ ] 记录当前 Vercel Production 部署（URL / commit / 时间）。
- [ ] 记录当前 Vercel 环境变量清单（名称 + 值另存，不进 git）。
- [ ] 决定分支策略：建议 `feat/v1.35` 开发，Vercel Preview 验收，绿了再合 main。
- [ ] 明确本次迁移是否「只加不删」；任何删列/改类型单独放到回滚窗口之后。
- [ ] 约定回滚窗口（建议 48 小时）：窗口内不执行清理型迁移。

---

## 5. 迁移兼容规则（让旧代码能接新库）

1. **先加后用**：新列必须可空或有默认值；新表不影响旧查询。
2. **先双写后切换**：重命名列 = 加新列 → 双写 → 回填 → 切读 → 下个版本再删旧列。
3. **不要在同一版本里删/改旧列**；删列至少隔一个发布。
4. **CHECK 约束与代码写入值同步**：迁移里新增的状态值，必须在同一迁移里放宽 CHECK（参考 v1.28.5 教训）。
5. **回填幂等**：用 `where ... is null` / `on conflict do nothing`；可重复执行。
6. **迁移文件只前进**：不要改已执行过的迁移；新变更写新编号（019+）。
7. **旧代码兼容性测试**：执行迁移后，先用旧部署跑一遍首页/待办/提醒，再上新代码。

---

## 6. 回滚后的验证清单

- [ ] 首页能开，版本号显示预期版本（设置 → 关于 / 更新日志头部）。
- [ ] `/tasks` 新建/完成/撤销正常；任务列表无空帧。
- [ ] `/api/check-reminders` 返回 200，提醒列表与角标一致。
- [ ] `/settings` 通知配置仍在（通道配置是整行覆盖，回滚不该清）。
- [ ] 项目页列表/详情正常（详情需登录）。
- [ ] 日报能打开（若迁移回滚，确认 `wb_daily_reports` 仍在）。
- [ ] 本地模式数据仍在（若清过站点数据则从备份导入）。
- [ ] Vercel 日志无 500；Supabase 日志无 42501/23514/42P01。

---

## 7. 本次体检记录（2026-11-26）

| 项 | 结果 |
|---|---|
| 提交总数 | 354（2026-08-04 起） |
| 合并提交 | 0（线性历史） |
| 分支 | 仅 `main`，与 origin 同步 |
| tag | 41 个版本 tag（v1.12.0–v1.34.1）+ `pre-v1.35`；全部已推远端、全部指向 main 祖先 |
| 版本一致性 | 每个 tag 的 `package.json` version 与 tag 名一致（41/41） |
| Changelog | 53 个版本（v1.0.0–v1.34.1），tag 从 v1.12.0 起与 changelog 一一对应 |
| 提交规范 | 99.7% Conventional Commits；仅 1 条 `docs+release:` 非标准前缀 |
| 大提交 | 仅脚手架（14k 行）与 v1.5 大版本（68 文件）两次；其余按模块拆分 |
| 仓库卫生 | 无 dist/node_modules 入库；最大跟踪文件 package-lock 488KB；工作区 2.28MB |
| 对象库 | **修复前** 308 packs / 236MB / 520k objects；**修复后** 1 pack / 1.55MB / 3,066 objects |
| 完整性 | `git fsck --full` 干净；`git count-objects` 无 garbage |
| 备份 | bundle 1.5MB，含 45 refs；`git bundle verify` ok |

> 对象库膨胀的原因：多次自动 `geometric repack` 失败（`renaming pack ... File exists`）后，每次仍留下一个完整快照 pack，累积 308 个。已用 `git gc --prune=now` 合并为一个 pack；提交历史未受影响。

---

## 8. 日常维护（建议每月一次）

```bash
git count-objects -vH        # 关注 packs / size-pack；packs 持续增长就该 gc
git fsck --full --no-progress
git gc --prune=now          # 合并 pack、清理不可达对象
```

- 发版用**附注 tag**（`git tag -a vX.Y.Z -m "..."`），带发布说明；轻量 tag 也能回滚，但没有元数据。
- 大迭代前打 `pre-vX.Y` 基线 tag；每个 RC 也打 tag（`vX.Y.0-rc.1`）。
- 不要把 `dist/`、`node_modules/`、截图、日志提交进仓库；当前 `.gitignore` 已覆盖。
- 可选：加 `.gitattributes`（`* text=auto eol=lf`）消除 LF/CRLF 警告；会产生一次大 diff，建议单独提交，不在功能迭代里做。
