-- 今日热点订阅配置（用户偏好，不进备份导出闭环）
create table if not exists public.wb_subscriptions (
  user_id uuid primary key default auth.uid(),
  source_ids text[] not null default '{}',
  topics text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.wb_subscriptions enable row level security;
create policy p_select on public.wb_subscriptions for select using (user_id = auth.uid());
create policy p_insert on public.wb_subscriptions for insert with check (user_id = auth.uid());
create policy p_update on public.wb_subscriptions for update using (user_id = auth.uid());
create policy p_delete on public.wb_subscriptions for delete using (user_id = auth.uid());
