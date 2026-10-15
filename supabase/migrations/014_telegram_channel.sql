-- 014 Telegram 通知通道（2026-10-15，配套 v1.26）
--
-- 背景：安卓 Chrome 的推送服务（FCM）在中国大陆不可用，Web Push 实际收不到；
--       Server酱 走微信，只覆盖微信。用户已取得 Telegram Bot，作为第三个通道。
--       推送由 Vercel 函数（服务端出网）发起，与 Server酱 同路径，架构不变。
--
-- 幂等：add column if not exists。RLS 策略是行级的，加列不需要动策略。

alter table public.wb_channel_configs add column if not exists telegram_bot_token text;
alter table public.wb_channel_configs add column if not exists telegram_chat_id  text;

-- 执行后自检：
--   select user_id,
--          (serverchan_key   is not null) as has_serverchan,
--          (telegram_bot_token is not null) as has_telegram_token,
--          telegram_chat_id
--     from public.wb_channel_configs;
