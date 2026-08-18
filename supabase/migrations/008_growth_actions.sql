-- 自我提升行动表（2026-08-18，自我提升模块 v1.7）
-- 行动元数据：为什么/步骤/量化目标/验证方式；打卡复用 wb_habits + wb_habit_logs（habit_id 关联）。
-- 兼容：create table if not exists 幂等；策略名带表名（p_*_wb_growth_actions），避免与裸策略名冲突。

create table if not exists public.wb_growth_actions (
  id text primary key,
  user_id uuid not null default auth.uid(),
  no int not null,                       -- 行动编号 1-10
  title text not null,
  emoji text not null,
  category text not null,                -- 类别：睡眠/学业/表达/职业/心理/财务/决策/精力
  why text not null,                     -- 为什么做（问卷证据）
  steps text not null,                   -- JSON 数组字符串：分步实施
  targets text not null,                 -- JSON 数组字符串：量化目标
  verify text not null,                  -- 验证方式
  habit_id text references public.wb_habits(id),  -- 关联打卡习惯
  status text not null default 'active' check (status in ('active','paused','done')),
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.wb_growth_actions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wb_growth_actions'] loop
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', 'p_select_' || t, t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', 'p_insert_' || t, t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid())', 'p_update_' || t, t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', 'p_delete_' || t, t);
  end loop;
end $$;
