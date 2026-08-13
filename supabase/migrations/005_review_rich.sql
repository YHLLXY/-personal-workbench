-- 今日复盘丰富字段（2026-08-13，Phase 5）
-- 背景：复盘模型仅 mood/summary/planTomorrow 三输入，信息单调。
-- 解决：新增 4 个文本板块（成就/反思/感恩/收获）+ 1-10 今日评分（可留空）。
-- 兼容：仅加列，DDL 幂等可安全重复执行；旧行由客户端 ?? '' 兜底。

alter table public.wb_reviews add column if not exists achievements text not null default '';
alter table public.wb_reviews add column if not exists reflection text not null default '';
alter table public.wb_reviews add column if not exists gratitude text not null default '';
alter table public.wb_reviews add column if not exists learnings text not null default '';
alter table public.wb_reviews add column if not exists score int check (score between 1 and 10);
