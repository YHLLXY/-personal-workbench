-- v1.25 任务备注：卡片在标题下方直接显示备注内容（2026-09-13，需用户在场执行；push 前执行）
-- 幂等：加列 IF NOT EXISTS，可重复执行；存量行为 NULL（UI 视为无备注）。
-- 部署窗口安全：前端 createTask 对 note 条件写入（无备注不发键），本迁移未执行期间云端常规增改不受影响。

alter table public.wb_tasks add column if not exists note text;
