-- 018 提醒的通道级投递状态（2026-10-19，配套 v1.32）
--
-- 背景：v1.31 之前一个 wb_reminders 行只有一个 sent_at，发送逻辑是「任一通道成功 → 整行标记已发送」。
--      于是 Web Push 成功（FCM 返回 201，设备却可能收不到）会把 Telegram 当次的失败永久掩盖，
--      之后再也不会补发。2026-10-19 用户实测症状就是「手机一条都没收到」。
--
-- 改法：按通道记账 { webpush, serverchan, telegram, errors }，成功的通道不重发、失败的下一轮补发；
--      全部「已配置」的通道都成功才写 sent_at。
--
-- 幂等：add column if not exists。RLS 是行级的，加列不需要动策略。
-- 执行顺序：**先执行本迁移，再部署 v1.32** —— 新代码读写 sent_channels，缺列会让 cron / check 500。
--
-- 回滚：
--   alter table public.wb_reminders drop column if exists sent_channels;

alter table public.wb_reminders add column if not exists sent_channels jsonb not null default '{}'::jsonb;

-- 执行后自检：
--   select id, kind, scheduled_at, sent_at, sent_channels
--     from public.wb_reminders order by scheduled_at desc limit 5;
