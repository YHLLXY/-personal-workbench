-- 任务焦点绑定日期（2026-08-13，Phase 1）
-- 背景：focus 是无日期布尔，焦点任务永久显示在今日待办（bug 根因）。
-- 解决：focus_date 绑定焦点任务所属日期，今日待办只显示 focus_date = 今天的焦点任务。
-- 兼容：仅加列，DDL 幂等可安全重复执行；旧行（focus=true 无 focus_date）由客户端读路径惰性迁移
--（服务端拿不到用户时区，勿用 SQL 回填 createdAt 日期）。

alter table public.wb_tasks add column if not exists focus_date text;
