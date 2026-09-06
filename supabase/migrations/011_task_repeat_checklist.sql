-- v1.24 任务系统升级：重复任务 + 清单 + 手动排序（2026-09-06，需用户在场执行；push 后第一个动作）
-- 幂等性：加列 IF NOT EXISTS；sort 类型重跑为等值转换；回填带 sort < 1e13 guard，可重复执行。

alter table public.wb_tasks add column if not exists repeat jsonb;
alter table public.wb_tasks add column if not exists checklist jsonb;

-- sort 从 bigint 转 double precision（拖拽半序需要小数中点；存量毫秒值 1.75e12 < 2^53 无损）。
-- 同步移除 UI 层 priorityRank 比较器，排序语义改为 sort 降序——
-- 把存量优先级烘焙进 sort，保证烘焙后顺序与旧 UI 顺序（高→中→低、同优先级新在前）完全一致。
-- 公式与 types.bakeTaskSort、local-repository 惰性归一化一致：
--   sort = 1e13 * (优先级档位 + 1) + 原毫秒时间戳（high=3 / medium=2 / low=1）
alter table public.wb_tasks alter column sort type double precision;
update public.wb_tasks
  set sort = 1e13 * (case priority when 'high' then 3 when 'medium' then 2 else 1 end) + sort
  where sort < 10000000000000;
