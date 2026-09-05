# 个人工作台（Personal Workbench）

[![CI](https://github.com/YHLLXY/-personal-workbench/actions/workflows/ci.yml/badge.svg)](https://github.com/YHLLXY/-personal-workbench/actions/workflows/ci.yml)
![React 19](https://img.shields.io/badge/React-19-61dafb?logo=react&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646cff?logo=vite&logoColor=white)
![Tailwind CSS v4](https://img.shields.io/badge/Tailwind-v4-38bdf8?logo=tailwindcss&logoColor=white)
![PWA](https://img.shields.io/badge/PWA-installable%20%7C%20offline-5a0fc8?logo=pwa&logoColor=white)

> 一个给「一个人」用的效率工作台 PWA：待办、学习、健康、复盘、资料、提醒、项目看板——全部装进一个手机秒开、离线可用、数据完全自有的 Web 应用。

## 这是个什么项目

为单一用户（我自己）定制的个人效率系统，替代「效率工具一大堆、数据散落各处」的状态。几个核心取向：

- **数据完全自有**：本地模式数据存在浏览器 IndexedDB；云端模式存在自己的 Supabase（PostgreSQL + 行级安全），不存在任何第三方效率服务的数据库里。
- **移动端优先的 PWA**：添加到主屏幕即像原生应用一样使用，支持离线、系统通知、Web Push 推送；首屏体积有机器门禁把守。
- **单用户设计**：没有多租户、没有权限体系，一切取舍以「稳定 > 完美，实用 > 花架子」为准绳。

## 功能模块

| 模块 | 路径 | 说明 |
|---|---|---|
| 工作台总览 | `/` | 桌面端卡片网格首页（跨度/顺序可配），问候语、周趋势、各模块核心卡片一屏尽览 |
| 今日待办 | `/tasks` | 今日/逾期分区、⭐今日焦点（最多 3 项）、标签、将来收件箱 |
| 学习管理 | `/study` | 学习目标（步进/速率两种推进方式 + 里程碑庆祝）、考试倒计时与到期提醒 |
| 番茄钟 | `/pomodoro` | 绑定学习主题的专注计时、提示音、完成庆祝、专注时长统计 |
| 自我提升 | `/growth` | 行动打卡（连击激励/完成庆祝）、行动详情与周趋势 |
| 运动健康 | `/health` | 习惯打卡（与「自我提升」打卡归属单一入口分离）、体重/睡眠/运动记录、14 天热力图 |
| 复盘 | `/review` | 每日复盘、明日计划一键转待办、心情/评分趋势、连续天数 |
| 今日热点 | `/hot` | 多平台热榜聚合、已读标记、一键存为速记 |
| 灵感速记 | `/notes` | 快速记录、搜索、多标签、归档 |
| 资料库 | `/papers` | 论文库：文件夹树、想读/在读/读完状态、评分、BibTeX 引用导出 |
| 提醒中心 | `/reminders` | 任务/考试到期提醒，应用内横幅 + Web Push 双通道，侧边栏未读角标 |
| 我的项目 | `/projects` | 私有知识库「门户口」文档的只读镜像（10 分钟缓存），详情页展示 |
| 我的 | `/settings` | 身份卡、累计统计、周趋势、外观主题、通知与推送配置、数据导入导出、更新日志与 PWA 安装 |

**跨模块通用能力**：⌘K 命令面板（全局搜索任务/笔记/热点/导航）、快速捕获（全局快捷键 + 移动端 FAB）、浅色/深色主题、程序化日月光源的启动动画、JSON 数据备份与恢复、桌面侧边栏 / 移动端底部 Tab + 悬浮按钮的响应式布局。

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | React 19 · TypeScript（strict）· Vite 8 · React Router 7 |
| 样式/UI | Tailwind CSS v4 · shadcn 风格组件（base-ui 底座）· lucide-react 图标 |
| 状态/数据 | TanStack React Query v5 · Zustand |
| 后端 | Supabase（PostgreSQL + RLS + Auth）· Vercel Serverless Functions |
| PWA | vite-plugin-pwa（Workbox injectManifest） |
| 测试/质量 | Vitest + Testing Library · Playwright · oxlint · GitHub Actions CI |

## 架构

### 数据流

```
组件（src/modules/*）
  │  useQuery / useMutation —— modules/*/api.ts（queryKey 常量导出，mutation onSuccess 失效缓存）
  ▼
仓储接口（src/lib/db/types.ts）
  │  按 isCloudMode 自动分流
  ├─▶ LocalRepository      ── IndexedDB + localStorage（离线使用 / 本地开发 / 全量测试）
  └─▶ SupabaseRepository   ── Supabase Postgres + RLS + Auth（云端同步）
                                 ▲
Vercel Functions（api/*.ts）────┘  定时提醒扫描 + Web Push / 天气与空气质量代理
                                   / 多源热榜聚合 / 知识库门户口镜像
```

UI 不直接触碰仓储实现细节，全部经 React Query hooks 走仓储接口。

### 模块注册表

侧边栏、移动端底部 Tab、路由、首页卡片**全部由 `src/registry.ts` 一处注册生成**——新增一个页面只需在注册表加一条（路径 + 懒加载组件），导航和首页卡片自动出现。页面组件经 `lazyRetry` 懒加载（chunk 加载失败自动重试 + 防死循环守卫）。

### 双仓储同构

- 未配置 Supabase 环境变量时自动进入**本地模式**（IndexedDB/localStorage）；配置后走**云端模式**。
- 两套实现**必须行为一致**：`tests/repository-contract.test.ts` 用同一段操作脚本分别驱动两个仓储并对比结果，防止云端/本地行为漂移。

### Serverless 单文件约束

`api/*.ts` 每个端点一个自包含文件——Vercel 运行时不支持跨文件相对导入，业务逻辑写在同文件内（npm 包导入不受限）。

## PWA 与离线能力

- **预缓存 + 自动升级**：全部构建产物 Workbox precache；`skipWaiting + clientsClaim` 的 autoUpdate 模式让手机下次打开即用上新版本。
- **运行时缓存**：自家 `/api/*` GET 走 StaleWhileRevalidate（弱网秒开，1 小时内最多 10 条）；跨域图片 CacheFirst（30 天，最多 50 张）。
- **离线回退**：导航请求失败时返回缓存的 index.html，断网可继续使用本地数据。
- **Web Push**：VAPID 密钥体系；Service Worker 的 `push` 事件弹系统通知、`notificationclick` 聚焦/打开窗口；前台到期提醒走 `registration.showNotification`（Chrome 与 iOS 唯一共同合法路径），通知失败静默降级为应用内提醒。
- **安装**：桌面/安卓在「我的」页一键安装，iOS 走添加到主屏幕指引。

## 本地开发

```bash
npm install
npm run dev            # http://localhost:5173 —— 无环境变量即本地模式，数据存浏览器
npm test               # vitest 全量
npm run lint           # oxlint
npm run build          # tsc -b && vite build
npm run check:bundle   # 客户端体积预算门禁
npm run test:e2e       # Playwright 冒烟（本地 IndexedDB 模式，无需任何环境变量）
```

## 质量门禁

每次 push / PR 由 GitHub Actions 跑两个 job：**ci**（oxlint + vitest + build + 体积预算）与 **e2e**（Playwright 冒烟）。本地提交前同样全量验证；发版用一条命令：

```bash
node scripts/release.mjs --yes --title="..."   # 依次过 lint → test → build，任一失败自动回滚
```

几条特别的门禁：

- **客户端体积红线**：JS 总量 ≤ 1120KB、最大单 chunk ≤ 340KB（`scripts/check-bundle.mjs`）。历史上曾为移动端首屏把 recharts 替换成手绘 SVG（-312KB）——红线靠机器把关，不靠自觉。
- **双仓储契约测试**：改动任一仓储实现必须跑 `tests/repository-contract.test.ts`，同脚本双实现对比，防行为漂移。
- **真机语义测试桩**：涉及平台能力（通知/权限/Service Worker）的测试桩模拟最严格真机行为（如构造器抛 `TypeError`），而不是理想语义。

## 部署（Vercel + Supabase）

1. **Supabase**：建项目，SQL Editor 按序执行 `supabase/migrations/` 全部迁移（001→010 共 11 个文件，002 编号重复系历史既成；全部幂等，可重复执行）。
2. **Web Push 密钥**：`npx web-push generate-vapid-keys` 生成密钥对。
3. **Vercel**：导入仓库（框架预设 Vite，构建命令 `npm run build`），按下表配置环境变量。
4. **定时提醒**：任意外部定时器每日调用 `POST /api/cron-notify`（Bearer `CRON_SECRET` 鉴权）——扫描到期任务/考试并发送 Web Push；另有 `/api/check-reminders`、`/api/test-notify` 两个辅助入口（均经 `vercel.json` rewrites 暴露）。

### 环境变量

| 变量 | 用在 | 说明 |
|---|---|---|
| `VITE_SUPABASE_URL` | 前端 + API | Supabase 项目地址 |
| `VITE_SUPABASE_ANON_KEY` | 前端 + API | 匿名 key（会打进前端包，安全性由 RLS 保证） |
| `SUPABASE_SERVICE_ROLE_KEY` | 仅 API | 定时提醒扫描使用，绕过 RLS，绝不暴露给前端 |
| `GITHUB_TOKEN` | 仅 API | 读取私有知识库仓库「门户口」文档（项目页只读镜像） |
| `CRON_SECRET` | 仅 API | 定时入口 Bearer 鉴权 |
| `VITE_VAPID_PUBLIC_KEY` | 前端 | Web Push 公钥 |
| `VAPID_PRIVATE_KEY` | 仅 API | Web Push 私钥 |

未配置 Supabase 变量时应用自动降级为纯本地模式——CI 的全部测试就是在无云端环境下跑的。

## 目录结构

```
├── api/                    # Vercel Serverless Functions（单文件约束）：auth / hot / projects / reminders / weather / air-quality
├── e2e/                    # Playwright 冒烟测试
├── scripts/                # release.mjs 发版 · check-bundle.mjs 体积门禁
├── supabase/migrations/    # 001–010 幂等 SQL 迁移
├── src/
│   ├── app/                # 应用壳层：布局导航 / 首页 / 主题 / 认证 / 命令面板 / 快速捕获 / 全局状态
│   ├── registry.ts         # 模块注册表（路由 + 侧边栏 + 底部 Tab + 首页卡片）
│   ├── modules/            # 业务模块：overview / study / growth / health / review / news / projects / reminders / me
│   ├── lib/db/             # 仓储层：types.ts（模型+接口）· local-repository.ts · supabase-repository.ts
│   ├── lib/                # 纯函数工具（stats / heatmap / backup / pomodoro / weather …）
│   ├── components/ui/      # shadcn 风格组件（base-ui 底座）
│   └── sw.ts               # Service Worker：预缓存 / 运行时缓存 / Web Push / 离线回退
└── tests/                  # vitest：组件测试 + 纯函数测试 + 双仓储契约测试
```

## 设计原则

1. **稳定 > 完美，实用 > 花架子**——判断一切取舍的准绳。
2. **客户端体积红线神圣不可侵犯**——新依赖必须懒加载或拒绝。
3. **最简实现**——不加兼容层、不做预防性抽象；**架构决策往长了做**——不留「先这样以后再换」。
4. **优先成熟库**，动手前先翻已有依赖；新功能先调研成熟产品的已验证模式。
5. **增量生长**——先跑通最小端到端版本，绝不为了未完成的复杂度拆掉能跑的东西。

完整的工程约定（含面向编码 agent 的硬性规则与避坑清单）见 [AGENTS.md](./AGENTS.md)。

## 版本

语义化版本：`feat` → minor / `fix` → patch / 破坏性 → major，`docs` / `chore` / `refactor` 不发版。更新日志见 [src/app/changelog.ts](./src/app/changelog.ts)（应用内「我的 → 关于」同步展示），判级规则与发版 checklist 见 [VERSIONING.md](./VERSIONING.md)。

## 文档索引

| 文档 | 内容 |
|---|---|
| [AGENTS.md](./AGENTS.md) | 工程宪法：硬性约定、避坑清单、协作 SOP |
| [VERSIONING.md](./VERSIONING.md) | 版本判级表 + 发版 checklist |
| [docs/plans/](./docs/plans/) | 历次调研与实施计划归档 |
| [经验总结-审查核实与功能迭代执行.md](./经验总结-审查核实与功能迭代执行.md) | 跨版本踩坑与排障复盘（十四节） |

## 说明

本项目为个人自用的单用户应用，不提供多租户与权限体系，代码与文档仅供学习交流。应用不含任何遥测统计：数据要么在你的浏览器里（本地模式），要么在你自己的 Supabase 项目里（云端模式）。
