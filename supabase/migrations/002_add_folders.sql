-- 资料库 v1.1：wb_papers 扩展 + wb_folders 新表（幂等，可重复执行）

-- wb_papers 扩展（旧数据 type 默认 'paper'，无缝兼容）
alter table public.wb_papers add column if not exists type text not null default 'paper';
alter table public.wb_papers add column if not exists folder_id text;
alter table public.wb_papers add column if not exists tags text[] not null default '{}';
alter table public.wb_papers add column if not exists content text;
alter table public.wb_papers add column if not exists summary text;
alter table public.wb_papers add column if not exists keywords text[] not null default '{}';
alter table public.wb_papers add column if not exists file_url text;
alter table public.wb_papers add column if not exists source text;

-- 文件夹树（多级：parent_id 自引用）
create table if not exists public.wb_folders (
  id text primary key,
  user_id uuid not null default auth.uid(),
  name text not null,
  parent_id text references public.wb_folders(id) on delete cascade,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

alter table public.wb_folders enable row level security;
create policy p_select_wb_folders on public.wb_folders for select using (user_id = auth.uid());
create policy p_insert_wb_folders on public.wb_folders for insert with check (user_id = auth.uid());
create policy p_update_wb_folders on public.wb_folders for update using (user_id = auth.uid());
create policy p_delete_wb_folders on public.wb_folders for delete using (user_id = auth.uid());
