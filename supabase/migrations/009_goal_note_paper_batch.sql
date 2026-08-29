-- 009: v1.14 数据模型批次——目标完成时间 / 速记置顶 / 论文读完时间 / 目标截止提醒
-- 全部幂等（add column if not exists + drop/add 约束），可安全重跑。
-- ⚠️ 部署顺序：必须先在 Supabase 执行本文件，再部署引用新列的代码（v1.14.0）。

-- 1. 学习目标：完成时间（归档时写入，恢复时清空；由仓储层维护，勿手填）
alter table public.wb_study_goals add column if not exists completed_at timestamptz;

-- 2. 速记：置顶（列表排序 pinned 优先）
alter table public.wb_notes add column if not exists pinned boolean not null default false;

-- 3. 论文：读完时间（状态改为 done 时写入）
alter table public.wb_papers add column if not exists finished_at timestamptz;

-- 4. 提醒系统接入目标截止：扩 ref_type / kind 枚举（check 约束名按 PG 默认命名）
alter table public.wb_reminders drop constraint if exists wb_reminders_ref_type_check;
alter table public.wb_reminders add constraint wb_reminders_ref_type_check check (ref_type in ('task','exam','goal'));
alter table public.wb_reminders drop constraint if exists wb_reminders_kind_check;
alter table public.wb_reminders add constraint wb_reminders_kind_check check (kind in ('due','exam-3d','exam-1d','exam-1h','goal-3d','goal-due'));
-- unique (user_id, ref_type, ref_id, kind) 已在 003 建好，goal 提醒天然幂等复用
