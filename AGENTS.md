# AGENTS.md — 工程宪法（每次会话开工前必读）

> 面向在本仓库工作的任何编码 agent。本文浓缩了项目全部硬性约定与踩坑教训（2026-08 沉淀）。
> **冲突裁决顺序**：本文 > README.md > VERSIONING.md > 经验总结 > 你的直觉。

## 项目定位

个人自用效率工作台 PWA（单用户！）：React 19 + Vite + TS + Tailwind v4 + React Query + Supabase + Vercel。
判断一切取舍的准绳：**稳定 > 完美，实用 > 花架子，客户端体积红线神圣不可侵犯**。

## 文档索引

| 文档 | 内容 |
|---|---|
| `README.md` | 部署、环境变量、模块清单 |
| `VERSIONING.md` | 版本判级表 + 发版 checklist（可用 `node scripts/release.mjs --dry-run` 辅助） |
| `经验总结-审查核实与功能迭代执行.md` | 审查报告核实教训、执行 agent 翻车案例、协作流程 |
| `docs/plans/` | 历次实施计划归档（改某模块前先看有没有对应计划） |

## 架构速查

```
src/
  app/            壳层：layout(导航) auth theme(主题) quick-capture command-palette store(zustand)
  registry.ts     模块注册表：所有页面在此注册（path + lazyRetry 组件）
  modules/        业务模块（overview/study/growth/health/review/news/projects/reminders/me）
    */api.ts      React Query hooks（queryKey 常量导出，mutation onSuccess 里 invalidate）
  lib/db/         仓储层：types.ts(模型+接口) local-repository.ts(IndexedDB/localStorage)
                  supabase-repository.ts(云端) —— 双实现必须行为一致
  lib/            纯函数工具（heatmap/celebrate/pomodoro/hot/backup/stats…）
  components/ui/  shadcn 组件（base-ui 底座，非 radix）
  sw.ts           Service Worker（Workbox injectManifest）
api/              Vercel Serverless Functions（auth/hot/projects/reminders）—— 单文件约束！
supabase/migrations/  000-008 全部幂等
tests/            vitest（组件测试 jsdom + 纯函数测试；无云端 env 时走本地仓储真库）
```

数据流：组件 → useQuery/useMutation（modules/*/api.ts）→ repository（src/lib/db，按 isCloudMode 选择实现）→ IndexedDB / Supabase。**UI 不直接触碰仓储实现细节。**

## 领域术语表

- **打卡归属单一入口**：`GrowthAction.habitId` 绑定的习惯只在「自我提升」打卡；健康模块三入口（今日打卡/快速打卡/习惯管理）用 `src/modules/health/derive.ts` 过滤。归属判定是**结构关系**（任意状态的绑定都算），与行动 active/paused 无关。
- **今日口径**：`isTodayScope`（overview/api.ts）= 仅今日到期或今日焦点；历史逾期单独提示，绝不混入今日统计。
- **门户口**：知识库 `30-项目/<dir>/<dir> - 门户口.md`，项目页的只读数据源；`dir` 字段=知识库目录名（≠ frontmatter 的 project 名），详情按 dir 寻址。
- **本地模式 / 云端模式**：无 supabase env → `isCloudMode=false` → LocalRepository（测试全部跑这条链）；有 env → SupabaseRepository。**两边行为必须同步改**。
- **体量红线**：移动端首屏曾为此砍 312KB（recharts→SVG）。新依赖必须懒加载或拒绝。

## 硬性约定（违反=事故）

1. **api/*.ts 单文件**：Vercel 函数不支持跨文件相对导入（2026-08-05 线上 FUNCTION_INVOCATION_FAILED 结论）。npm 包导入不受限，新增逻辑写在同文件内。
2. **知识库是唯一事实源**：项目页只读镜像（10min 缓存），编辑一律跳 github.dev，禁止双写。
3. **暴露私有内容的 API 必须鉴权**（anon client getUser JWT）；因鉴权而异的响应 `Cache-Control` 必须带 `private`。
4. **发版按 VERSIONING.md**：feat→minor / fix→patch / 破坏性→major；多 commit 归并取最高档；24h 内追加修复并入当前版本；`docs:/chore:/refactor:` 不发版。
5. **提交前验证**：`npm test` 全绿 + `npm run build` 通过 + `npm run lint` 警告 ≤ 基线 12 条（对比改动前后数量）。
6. **前端表单防连击**：所有 create/update mutation 的提交按钮在 isPending 时禁用（历史上目标/身体记录都因此重复过）。

## 避坑清单（每条都真实踩过）

- **改任何字段语义前先 `grep` 全部消费方**，UI 文案是语义的最终依据（v1.9 曾把「累计完成」改成「当日」导致 UI 错误且提交红测试）。
- **写 SQL 前先核对 migrations 里的真实表结构**（wb_health_logs 无 created_at，42703 教训）；**任何数据库迁移必须用户在场执行**，agent 只写文件不碰线上库。
- 提醒的 dismiss/restore 用乐观更新且**不 invalidate**——否则触发 /api/check-reminders 全量重跑（扫三表+发推送），UI 卡数秒。
- react-router `useParams` 已解码，目录名含中文只需发起端 `encodeURIComponent`，勿二次解码。
- `api/projects.ts` 与 `src/modules/projects/api.ts` 各有一份 ProjectInfo 类型 + `public/projects-status.json` 快照，**改字段三处同步**；前端字段用 optional 兼容 CDN 旧缓存。
- 纯函数不要导出在组件文件里（fast-refresh 警告），放 `*-view.ts` / `*-utils.ts` / `lib/`。
- 测试里 mock 网络时注意 QueryClientProvider 包裹；hot 页等接了 mutation 的组件必须有 Provider。
- git 后台报 `multi-pack-index: Permission denied` / `geometric repack failed` 不影响 commit/push，用 `git log` + `git status` 确认即可，勿慌。

## 工作流程 SOP

- **常规修改**：计划 → 改 → 模块测试 → 全量验证 → 分模块 commit（`feat(scope)`/`fix(scope)`/`docs`）→ push。
- **夜间托管**：只做纯前端/纯新增文件/可测试验证的工作；**不做**任何需要迁移、需要真实数据验证、需要产品决策的事。
- **并行代理**：文件集必须互斥（含测试文件），代理不跑全局 build/test（由主线统一验证），任务书写明禁区清单与代码风格要求。
- **接手红测试**：先 `git log -p` 定位引入者，再看消费方定语义——恢复正确实现，不迁就错误实现改测试。
- **发现新问题**：只记录汇报，不顺手修（防止改动面扩散）。
