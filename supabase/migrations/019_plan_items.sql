-- 019_plan_items.sql（v1.35.0，2026-11-26）
-- 每日计划快照：某一天「计划了哪些任务」的事实记录。
-- 先执行本迁移，再部署 v1.35.0（代码会写这张表；表不存在时前端静默降级，复盘显示"从 v1.35 起记录"）。
-- 幂等：可重复执行（create ... if not exists + drop policy if exists）。

create table if not exists public.wb_plan_items (
  user_id uuid not null default auth.uid(),
  plan_date text not null,
  task_id text not null,
  title text not null,
  goal_id text,
  amount int,
  done_at timestamptz,
  moved_to text,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_date, task_id)
);

create index if not exists wb_plan_items_user_date_idx on public.wb_plan_items (user_id, plan_date);

alter table public.wb_plan_items enable row level security;

drop policy if exists p_select_wb_plan_items on public.wb_plan_items;
create policy p_select_wb_plan_items on public.wb_plan_items for select using (user_id = auth.uid());

drop policy if exists p_insert_wb_plan_items on public.wb_plan_items;
create policy p_insert_wb_plan_items on public.wb_plan_items for insert with check (user_id = auth.uid());

drop policy if exists p_update_wb_plan_items on public.wb_plan_items;
create policy p_update_wb_plan_items on public.wb_plan_items for update using (user_id = auth.uid());

drop policy if exists p_delete_wb_plan_items on public.wb_plan_items;
create policy p_delete_wb_plan_items on public.wb_plan_items for delete using (user_id = auth.uid());

-- 说明：
-- 1) 无外键。task_id 指向 wb_tasks.id，但任务删除后计划项必须保留（历史可读），
--    所以不加 references，删除任务时不级联。
-- 2) 主键就是业务唯一键 (user_id, plan_date, task_id)：一行 = 一条任务在某一天的某个计划，
--    行级 upsert 幂等；不用 JSON 数组是因为收尾会并发改 5 条，读-改-写必然丢更新。
-- 3) goal_id / amount 是 v1.36 学习联动要用的冗余快照（计划时写入，任务删了也不丢目标归属）。
