-- 登录别名：手机号 → 账号（2026-08-13，配套 api/auth.ts + auth-page.tsx）
-- 背景：Supabase Auth 不支持「手机号+密码」原生登录（phone auth 是 OTP 且需付费 SMS），
--       故手机号作「登录别名」：注册时选填存 user_metadata.phone + 本表；
--       登录时输入手机号 → /api/resolve-phone（service role 绕过 RLS）解析邮箱 → 密码登录。
-- 认证域安全隔离：本表不进 WorkbenchRepository/BackupTables（防备份把别名带到另一账号）。
-- 向后兼容：仅建新表，DDL 可安全重复执行。

create table if not exists public.wb_login_aliases (
  phone text primary key,                        -- 规范化手机号（去空格/连字符/可选 +86 前缀，11 位）
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.wb_login_aliases enable row level security;

-- 本人 RLS：只能操作自己名下的别名行
-- 手机号→邮箱解析走 service role（api/auth.ts），不受 RLS 限制；anon 无会话一律拒绝
create policy p_select on public.wb_login_aliases for select using (user_id = auth.uid());
create policy p_insert on public.wb_login_aliases for insert with check (user_id = auth.uid());
create policy p_update on public.wb_login_aliases for update using (user_id = auth.uid());
create policy p_delete on public.wb_login_aliases for delete using (user_id = auth.uid());
