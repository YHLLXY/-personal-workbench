# 个人工作台（personal-workbench）

个人自用效率工作台 PWA：总览待办 / 学习管理与番茄钟 / 自我提升行动 / 运动健康习惯 / 复盘 / 资料库（热点·速记·论文）/ 提醒推送 / 项目看板。单用户设计，稳定 > 完美，实用 > 花架子。

**当前版本**：见 `src/app/changelog.ts`（应用内「今日概览」弹窗同步展示）。版本号规则见 [`VERSIONING.md`](./VERSIONING.md)。

## 技术栈

React 19 · Vite · TypeScript · Tailwind v4 · React Query · Supabase（PostgreSQL + RLS + Auth）· Vercel（Serverless Functions + Cron + CDN）· vite-plugin-pwa（Workbox）· vitest · oxlint

## 功能模块

| 模块 | 路径 | 说明 |
|---|---|---|
| 今日待办 | `/tasks` | 今日/逾期分区、⭐焦点、标签搜索、将来收件箱、标签 |
| 学习管理 | `/study` | 学习目标（步进/速率/里程碑庆祝）、考试倒计时提醒、番茄钟（主题绑定/提示音/庆祝） |
| 自我提升 | `/growth` | 十项行动打卡（连击/庆祝）、行动详情、周复盘提醒 |
| 运动健康 | `/health` | 习惯打卡（与行动打卡归属分离）、体重/睡眠/运动记录 |
| 复盘 | `/review` | 每日复盘、明日计划一键转待办、心情/评分趋势、连续天数 |
| 资料库 | `/hot` `/notes` `/papers` | 热点聚合（已读标记/存速记）、速记（搜索/标签/归档）、论文库（文件夹/评分/引用 BibTeX） |
| 提醒中心 | `/reminders` | 任务/考试到期提醒，应用内 + Web Push 双通道 |
| 我的项目 | `/projects` | 知识库门户口镜像（GitHub 私有仓库拉取 + 详情页） |

## 本地开发

```bash
npm install
npm run dev        # 开发（本地 IndexedDB 模式，无 env 也可跑）
npm test           # vitest 全量
npm run lint       # oxlint
npm run build      # tsc + vite build
```

未配置 Supabase 环境变量时自动进入**本地模式**（IndexedDB/localStorage 仓储），数据存浏览器内。

## 部署（Vercel + Supabase）

1. Supabase 建项目，按序执行 `supabase/migrations/` 全部迁移（000→008，均有幂等保护）。
2. Vercel 导入仓库，配置环境变量（见下表），框架预设 Vite，构建命令 `npm run build`。
3. Vercel Cron 每日调用 `/api/reminders?entry=cron`（见 `vercel.json`），携带 `Authorization: Bearer <CRON_SECRET>`。

### 环境变量

| 变量 | 用在 | 说明 |
|---|---|---|
| `VITE_SUPABASE_URL` | 前端 + API | Supabase 项目地址 |
| `VITE_SUPABASE_ANON_KEY` | 前端 + API | 匿名 key（配合 RLS） |
| `SUPABASE_SERVICE_ROLE_KEY` | API | 仅 reminders cron 使用，绕过 RLS |
| `GITHUB_TOKEN` | API | 读取私有知识库仓库 `30-项目/` 门户口 |
| `CRON_SECRET` | API | cron 入口 Bearer 鉴权 |
| `VITE_VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | 前端 / API | Web Push 推送密钥对 |

## 工程约定（执行 agent 必读）

- **版本制度**：[`VERSIONING.md`](./VERSIONING.md)——feat→minor、fix→patch、破坏性→major（需用户确认）；发版 checklist 七步。
- **API 函数单文件**：`api/*.ts` 不支持跨文件相对导入（Vercel 运行时限制），新增逻辑写在同文件内。
- **打卡归属单一入口**：行动绑定的习惯只在「自我提升」打卡（`src/modules/health/derive.ts`）。
- **客户端体积红线**：能用服务端解决就不加前端依赖（渲染走 GitHub Markdown API、庆祝用懒加载 canvas-confetti）。
- **知识库是唯一事实源**：项目页只读镜像，编辑跳 github.dev。
- **验证基线**：提交前 `npm test` 全绿 + build 通过 + lint 警告 ≤12 条。
- 历史经验与踩坑记录：[`经验总结-审查核实与功能迭代执行.md`](./经验总结-审查核实与功能迭代执行.md)、[`docs/plans/`](./docs/plans/)。
