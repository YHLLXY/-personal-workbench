-- 个人工作台 · 初始化迁移（可在已有 Supabase 项目上安全执行）
-- 表名加 wb_ 前缀避免与同项目其他应用冲突；RLS 限定 auth.uid()

create table if not exists public.wb_tasks (
  id text primary key,
  user_id uuid not null default auth.uid(),
  title text not null,
  focus boolean not null default false,
  priority text not null default 'medium' check (priority in ('high','medium','low')),
  status text not null default 'todo' check (status in ('todo','doing','done','someday')),
  due_date text,
  tags text[] not null default '{}',
  sort bigint not null default 0,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create table if not exists public.wb_habits (
  id text primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  icon text not null default '✓',
  color text not null default '#5B8A72',
  target_per_day int not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.wb_habit_logs (
  id text primary key,
  user_id uuid not null default auth.uid(),
  habit_id text not null references public.wb_habits(id) on delete cascade,
  log_date text not null,
  count int not null default 1,
  unique (habit_id, log_date)
);
create table if not exists public.wb_focus_sessions (
  id text primary key,
  user_id uuid not null default auth.uid(),
  start_at timestamptz not null default now(),
  minutes int not null,
  note text
);
create table if not exists public.wb_exams (
  id text primary key,
  user_id uuid not null default auth.uid(),
  title text not null,
  exam_date text not null,
  subject text,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.wb_notes (
  id text primary key,
  user_id uuid not null default auth.uid(),
  content text not null,
  tag text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.wb_papers (
  id text primary key,
  user_id uuid not null default auth.uid(),
  title text not null,
  authors text not null default '',
  arxiv_id text,
  url text,
  status text not null default 'want' check (status in ('want','reading','done')),
  rating int,
  note text,
  created_at timestamptz not null default now()
);
create table if not exists public.wb_health_logs (
  id text primary key,
  user_id uuid not null default auth.uid(),
  log_date text not null,
  type text not null check (type in ('weight','sleep','exercise')),
  value numeric not null
);
create table if not exists public.wb_reviews (
  id text primary key,
  user_id uuid not null default auth.uid(),
  review_date text not null,
  mood int not null default 3,
  summary text not null default '',
  plan_tomorrow text not null default '',
  updated_at timestamptz not null default now(),
  unique (user_id, review_date)
);

-- RLS 开启 + 策略（本人读写）
alter table public.wb_tasks enable row level security;
alter table public.wb_habits enable row level security;
alter table public.wb_habit_logs enable row level security;
alter table public.wb_focus_sessions enable row level security;
alter table public.wb_exams enable row level security;
alter table public.wb_notes enable row level security;
alter table public.wb_papers enable row level security;
alter table public.wb_health_logs enable row level security;
alter table public.wb_reviews enable row level security;

do $$
declare t text;
begin
  foreach t in array array['wb_tasks','wb_habits','wb_habit_logs','wb_focus_sessions','wb_exams','wb_notes','wb_papers','wb_health_logs','wb_reviews'] loop
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', 'p_select_' || t, t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', 'p_insert_' || t, t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid())', 'p_update_' || t, t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', 'p_delete_' || t, t);
  end loop;
end $$;
