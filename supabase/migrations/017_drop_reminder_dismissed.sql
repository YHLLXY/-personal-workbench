-- v1.31：提醒回归「派生视图」——删掉「已忽略」列
--
-- 背景：dismissed_at 让提醒有了独立的生命周期（未读 / 已忽略 / 恢复），而提醒本是任务、考试、目标的
-- **派生数据**。于是同一件事要在「任务」和「提醒」两处各维护一次状态，且底层留下四个缺陷：
-- 改提醒时间不生效（去重键不含 scheduled_at）、已完成的提醒行永久滞留、tab 计数与角标口径不一致、
-- 首页横幅可能显示还没到期的提醒。v1.31 起代码不再读写该列，出口改为「去把事处理掉」。
--
-- 执行顺序：**先部署新版本代码，再执行本文件**（旧代码仍在写 dismissed_at 时删列会让它报错）。
-- 幂等：drop column if exists 可安全重复执行。
-- 回滚：alter table public.wb_reminders add column if not exists dismissed_at timestamptz;

alter table public.wb_reminders drop column if exists dismissed_at;
