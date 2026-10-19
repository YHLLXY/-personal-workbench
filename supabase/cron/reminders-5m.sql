-- 提醒的主触发器：Supabase Cron（pg_cron + pg_net）
--
-- 为什么放这里：GitHub Actions 的 schedule 实测中位 199 分钟、最长 410 分钟一次（25 次运行，
-- 没有一个 ≤60 分钟）；Vercel Cron 的 Hobby 档只允许每天一次；第三方 ping 服务（cron-job.org 等）
-- 在部分网络下注册不可用。Supabase Cron 跑在你自己的库里，**不需要任何新账号**，精度到分钟。
--
-- 用法：把下面 <CRON_SECRET> 换掉，在 Supabase → SQL Editor 整段执行一次即可。幂等，可重复执行。
--
-- ⚠️ 密钥会以明文存进 cron.job.command（只有库的所有者能读；cron schema 不在 PostgREST 暴露范围）。
--    不接受明文的话就别用这条路，改用本机任务计划（见 README）。

-- 1) 扩展（若报 not available：改到 Dashboard → Database → Extensions 里勾选 pg_cron / pg_net，
--    再回来只执行第 3 步）
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 2) 先删同名 job，保证重复执行不会堆出两个
do $$
begin
  if exists (select 1 from cron.job where jobname = 'wb-reminders-5m') then
    perform cron.unschedule('wb-reminders-5m');
  end if;
end $$;

-- 3) 每 5 分钟打一次 cron-notify（服务端会做生成 + 发送，幂等）
select cron.schedule(
  'wb-reminders-5m',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := 'https://workbench.yuhailinlxy.com/api/cron-notify',
    headers := jsonb_build_object(
      'Authorization', 'Bearer <CRON_SECRET>',
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 10000
  );
  $job$
);

-- ===== 自检（建完等 1 分钟再跑这两条）=====
--   select jobid, jobname, schedule, active from cron.job;
--   select id, status_code, timed_out, error_msg, created
--     from net._http_response order by id desc limit 5;
--   200 = 通了 ｜ 401 = CRON_SECRET 不对 ｜ timed_out / error_msg = 出网或域名问题
