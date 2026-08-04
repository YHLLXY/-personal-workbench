# 🧭 个人工作台

个人专属工作台：总览、学习、资讯、健康、复盘一站式管理。手机（PWA）+ 电脑双端，莫兰迪淡雅配色。

## 在线访问

**正式网址**：<https://personal-workbench-lilac.vercel.app/>

- 首次使用：输入邮箱 + 密码点「进入工作台」即自动注册，无需提前注册
- 数据云端同步（Supabase）：换设备用同一账号登录，数据自动一致
- ⚠️ **认准域名**：正式网址固定为 `personal-workbench-lilac.vercel.app`。Vercel 每次部署还会生成 `personal-workbench-<随机串>-yhllxys-projects.vercel.app` 样式的临时链接（带随机串），**不要使用**——临时链接可能停留在旧版本，子路由会 404/被 Vercel 拦截

## 功能

| 主模块 | 子模块 |
|--------|--------|
| 总览与设计 | 工作台总览（首页仪表盘）、今日待办（今日焦点） |
| 学习与科研 | 学习管理（考试倒计时）、番茄钟（专注记录） |
| 资讯与资料 | 今日热点（多源聚合）、论文资料库（arXiv）、灵感速记（自动保存） |
| 健康 | 习惯打卡（热力图）、体重/睡眠/运动记录 |
| 复盘 | 今日复盘（当日数据自动汇总） |

## 技术栈

React 19 · Vite · TypeScript · Tailwind CSS v4 · shadcn/ui · Lucide · Supabase · TanStack Query · Vercel

## 本地运行

```bash
npm install
npm run dev
```

## 开发验证

```bash
npm test        # 32 个单元测试（仓库/过滤/番茄/热力图/复盘/解析等）
npm run lint    # oxlint 静态检查
```

## 云端模式（可选）

1. 在 Supabase SQL Editor 执行 `supabase/migrations/001_init.sql`
2. 复制项目的 URL 与 anon key 到 `.env`（参考 `.env.example`）
3. 重新构建部署，数据自动云端同步

## 部署

```bash
vercel --prod
```
环境变量：`VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`（不配则本地模式）。

## 验证

自动化验证与人工验收清单见 [docs/VERIFY.md](docs/VERIFY.md)。

## 更新日志

- 2026-08-04 v1.0.0 首个版本：5 大主模块 + PWA + 双端适配
