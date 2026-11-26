-- 020_study_links.sql（v1.36.0）
-- 学习联动：目标属于哪场考试、任务推进哪个目标、专注记录归属哪条任务。
-- 全部可空 + 不加外键：目标/任务被删除时这些引用只是变成悬空值，读侧按 null 处理，绝不阻塞删除。
-- 幂等：可重复执行（add column if not exists）。
-- 部署顺序：先执行本迁移，再部署 v1.36.0。

alter table public.wb_tasks add column if not exists goal_id text;
alter table public.wb_tasks add column if not exists progress_amount int;
alter table public.wb_study_goals add column if not exists exam_id text;
alter table public.wb_focus_sessions add column if not exists task_id text;
