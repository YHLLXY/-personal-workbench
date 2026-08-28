-- 定时提醒通知（2026-08-08，配套 api/reminders.ts）
-- 向后兼容：仅加列/建新表，DDL 可安全重复执行（策略块除外）

alter table public.wb_tasks add column if not exists due_time text;    -- HH:mm 可选，任务到期提醒时间
alter table public.wb_exams add column if not exists exam_time text;   -- HH:mm 可选（考前 1 小时节点必需）

create table if not exists public.wb_reminders (
  id text primary key,
  user_id uuid not null default auth.uid(),
  ref_type text not null check (ref_type in ('task','exam')),
  ref_id text not null,
  kind text not null check (kind in ('due','exam-3d','exam-1d','exam-1h')),
  scheduled_at timestamptz not null,       -- 计划提醒时刻（UTC）
  sent_at timestamptz,                     -- 已发送（null = 未发送）
  dismissed_at timestamptz,                -- 用户已忽略（null = 未忽略）
  created_at timestamptz not null default now(),
  unique (user_id, ref_type, ref_id, kind) -- 幂等去重
);

create table if not exists public.wb_push_subscriptions (
  id text primary key,
  user_id uuid not null default auth.uid(),
  endpoint text not null,
  keys_p256dh text not null,
  keys_auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (user_id, endpoint)               -- 同一浏览器重复订阅走 upsert
);

create table if not exists public.wb_channel_configs (
  user_id uuid primary key default auth.uid(),
  serverchan_key text,
  updated_at timestamptz not null default now()
);

-- RLS 开启 + 4 策略（沿用 002_subscriptions.sql 模式）
alter table public.wb_reminders enable row level security;
alter table public.wb_push_subscriptions enable row level security;
alter table public.wb_channel_configs enable row level security;

create policy p_select on public.wb_reminders for select using (user_id = auth.uid());
create policy p_insert on public.wb_reminders for insert with check (user_id = auth.uid());
create policy p_update on public.wb_reminders for update using (user_id = auth.uid());
create policy p_delete on public.wb_reminders for delete using (user_id = auth.uid());
drop policy if exists p_select on public.wb_push_subscriptions;
create policy p_select on public.wb_push_subscriptions for select using (user_id = auth.uid());
create policy p_insert on public.wb_push_subscriptions for insert with check (user_id = auth.uid());
create policy p_update on public.wb_push_subscriptions for update using (user_id = auth.uid());
create policy p_delete on public.wb_push_subscriptions for delete using (user_id = auth.uid());
drop policy if exists p_select on public.wb_channel_configs;
create policy p_select on public.wb_channel_configs for select using (user_id = auth.uid());
create policy p_insert on public.wb_channel_configs for insert with check (user_id = auth.uid());
create policy p_update on public.wb_channel_configs for update using (user_id = auth.uid());
create policy p_delete on public.wb_channel_configs for delete using (user_id = auth.uid());
