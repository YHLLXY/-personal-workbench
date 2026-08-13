-- 学习目标表（2026-08-13，Phase 6）
-- 目标管理：进度条 + 截止日 + 完成归档；属业务备份域（第 11 张表）。
-- 兼容：create table if not exists 幂等；策略名带表名（p_*_wb_study_goals），避免与裸策略名冲突。

create table if not exists public.wb_study_goals (
  id text primary key,
  user_id uuid not null default auth.uid(),
  title text not null,
  target int not null default 100,
  progress int not null default 0,
  deadline text,
  status text not null default 'active' check (status in ('active','done')),
  note text,
  created_at timestamptz not null default now()
);

alter table public.wb_study_goals enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wb_study_goals'] loop
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', 'p_select_' || t, t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', 'p_insert_' || t, t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid())', 'p_update_' || t, t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', 'p_delete_' || t, t);
  end loop;
end $$;
