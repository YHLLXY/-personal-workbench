-- 015 AI 日报：热点落库 → 事件聚簇 → 日报成刊（2026-10-15，配套 v1.27）
--
-- 背景：/api/hot 是无状态聚合接口（Cache-Control: s-maxage=600 走 CDN），**一个字都没存**——
--       「昨天的热点」根本不存在，所以「用 AI 整理每天收集到的热点」缺的不是 AI，是输入。
--       本迁移建立三层数据（原始条目 / 事件 / 日报）外加一份运行日志（幂等 + 可运维）。
--
-- 依赖扩展：vector（事件聚簇召回）、pg_trgm（没配向量服务时的降级召回）。
-- ⚠️ 向量是可选的：DeepSeek 官方 API 不提供 embedding 端点，没配向量服务时
--    wb_match_events 自动降级为「标题文本相似度」召回，整条链路照样跑通。
--
-- 幂等：全部 if not exists / create or replace。

create extension if not exists vector;
create extension if not exists pg_trgm;

-- 注：URL 归一化与标题指纹**在 api/digest.ts 的 TypeScript 里算**（写库方即真相），
-- 不在这里再写一份 SQL 孪生函数——两处实现迟早漂移。
-- 需要手写 SQL 排查时直接用 wb_hot_items 上已算好的 url_hash / title_hash 列即可。

-- ========== 1. 原始条目 ==========

create table if not exists public.wb_hot_items (
  id           text primary key,
  user_id      uuid not null default auth.uid(),
  source_id    text not null,
  source_name  text not null,
  title        text not null,
  url          text not null,
  url_hash     text not null,
  title_hash   text not null,
  hot_value    numeric,                        -- 抓取源自带的热度（如微博热度值），可空
  fetched_date date not null default (now() at time zone 'Asia/Shanghai')::date,
  fetched_at   timestamptz not null default now(),

  -- AI 处理状态机：pending → done / skipped / failed
  ai_status    text not null default 'pending' check (ai_status in ('pending','done','skipped','failed')),
  ai_retry     smallint not null default 0,
  ai_score     numeric(4,1),                   -- 0-10 重要性
  ai_summary   text,                           -- 两三句中文摘要
  ai_category  text,                           -- 科技 / 财经 / 社会 / 国际 / 其他
  ai_tags      jsonb not null default '[]'::jsonb,
  ai_model     text,
  processed_at timestamptz,

  event_id     text,                           -- 归入的事件（层次 3 聚簇）
  embedding    vector(1024)                    -- 可空：没配向量服务时留空，走文本召回
);

create unique index if not exists wb_hot_items_url_uniq on public.wb_hot_items (user_id, url_hash);
create index if not exists wb_hot_items_pending_idx on public.wb_hot_items (user_id, ai_status, fetched_at desc);
create index if not exists wb_hot_items_event_idx on public.wb_hot_items (event_id);
create index if not exists wb_hot_items_date_idx on public.wb_hot_items (user_id, fetched_date desc);
create index if not exists wb_hot_items_title_trgm on public.wb_hot_items using gin (title gin_trgm_ops);

-- ========== 2. 事件（聚簇单元） ==========

create table if not exists public.wb_hot_events (
  id            text primary key,
  user_id       uuid not null default auth.uid(),
  event_date    date not null default (now() at time zone 'Asia/Shanghai')::date,
  title         text not null,                 -- 代表标题
  category      text not null default '其他',
  digest        text,                          -- 这「一件事」的一句话概括
  item_ids      jsonb not null default '[]'::jsonb,
  source_count  int not null default 0,
  heat          numeric(8,2) not null default 0,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  embedding     vector(1024)
);

create index if not exists wb_hot_events_recent_idx on public.wb_hot_events (user_id, last_seen_at desc);
create index if not exists wb_hot_events_date_idx on public.wb_hot_events (user_id, event_date desc);

-- 召回候选事件：配了向量就走 pgvector，没配就降级成标题文本相似度（pg_trgm）。
-- 两条路径返回同构结果，调用方无需分支。
create or replace function public.wb_match_events(
  p_user uuid,
  p_title text,
  p_embedding vector(1024) default null,
  p_days int default 14,
  p_limit int default 5)
returns table (event_id text, title text, similarity float)
language sql stable as $$
  select e.id, e.title,
         case when p_embedding is not null and e.embedding is not null
              then 1 - (e.embedding <=> p_embedding)
              else similarity(e.title, coalesce(p_title, ''))
         end as similarity
  from public.wb_hot_events e
  where e.user_id = p_user
    and e.last_seen_at > now() - make_interval(days => greatest(p_days, 1))
    and (p_embedding is null or e.embedding is not null or similarity(e.title, coalesce(p_title, '')) > 0.3)
  order by similarity desc
  limit greatest(p_limit, 1)
$$;

-- ========== 3. 日报 ==========

create table if not exists public.wb_daily_reports (
  id           text primary key,
  user_id      uuid not null default auth.uid(),
  report_date  date not null,
  title        text not null,
  overview     text not null default '',       -- 今日总述（LLM 写）
  sections     jsonb not null default '[]'::jsonb,  -- [{ category, items: [{ eventId, title, point, sources: [...] }] }]
  item_count   int not null default 0,
  source_count int not null default 0,
  model        text,
  generated_at timestamptz not null default now(),
  unique (user_id, report_date)
);

create index if not exists wb_daily_reports_date_idx on public.wb_daily_reports (user_id, report_date desc);

-- ========== 4. 运行日志（状态机幂等 + 可运维） ==========

create table if not exists public.wb_digest_runs (
  id          text primary key,
  user_id     uuid not null default auth.uid(),
  run_date    date not null,
  stage       text not null check (stage in ('enrich','cluster','digest')),
  status      text not null default 'running' check (status in ('running','ok','failed')),
  detail      text,
  items_in    int not null default 0,
  items_out   int not null default 0,
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  unique (user_id, run_date, stage)
);

-- 原子领取待处理条目：SKIP LOCKED 保证两个并发的 cron 不会抢到同一批（层次 4 幂等）
create or replace function public.wb_claim_items(p_user uuid, p_limit int default 20)
returns setof public.wb_hot_items
language sql volatile as $$
  with claimed as (
    select id from public.wb_hot_items
     where user_id = p_user and ai_status = 'pending'
     order by fetched_at desc
     limit greatest(p_limit, 1)
     for update skip locked
  )
  update public.wb_hot_items i
     set ai_status = 'processing'
    from claimed c
   where i.id = c.id
  returning i.*
$$;

-- ========== RLS ==========

do $$
declare t text;
begin
  foreach t in array array['wb_hot_items','wb_hot_events','wb_daily_reports','wb_digest_runs'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', 'p_select_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'p_insert_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'p_update_' || t, t);
    execute format('drop policy if exists %I on public.%I', 'p_delete_' || t, t);
    execute format('create policy %I on public.%I for select using (user_id = auth.uid())', 'p_select_' || t, t);
    execute format('create policy %I on public.%I for insert with check (user_id = auth.uid())', 'p_insert_' || t, t);
    execute format('create policy %I on public.%I for update using (user_id = auth.uid())', 'p_update_' || t, t);
    execute format('create policy %I on public.%I for delete using (user_id = auth.uid())', 'p_delete_' || t, t);
  end loop;
end $$;

-- 执行后自检（应各返回 4 行）：
--   select tablename, rowsecurity from pg_tables
--    where schemaname='public' and tablename like 'wb_%'
--      and tablename in ('wb_hot_items','wb_hot_events','wb_daily_reports','wb_digest_runs');
