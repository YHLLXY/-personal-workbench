-- 013 身体记录去重 + 体重/睡眠「一天一个数」唯一约束（2026-10-15，配套 v1.26）
--
-- 背景（为什么需要这一步）：
--   v1.11（commit bc9341f1ac）起 createHealthLog 已改为「体重/睡眠当日覆盖」，
--   但那一版的存量清理 SQL 是【手工动作】（docs/plans/PLAN_V111_UX_FIXES.md 执行顺序第 3 步），
--   是否执行过没有任何代码痕迹。只要库里还留着 v1.11 之前的重复行：
--     ① 云端 upsert 用 .select('id').eq(...).limit(1) 且没有 order → 更新的是「任意一行」；
--     ② 其余旧行继续留在列表里 → 用户看到的就是「我更新了，原来的还在」；
--     ③ 而且【永远不会自愈】：每次更新都可能打在另一行上。
--   本迁移一次性清理存量，并把这条语义固化成数据库约束。
--
-- 幂等：DDL 全部 if not exists；delete 重复执行时第二次匹配 0 行，无副作用。

begin;

-- 1) 清理存量重复：体重/睡眠按 (user_id, log_date, type) 分组，保留 id 最大的一条。
--    id 由 src/lib/db/types.ts 的 genId() 生成 = Date.now().toString(36) + '-' + 随机后缀，
--    时间戳前缀单调递增且位数恒定 → 字典序越大 = 创建越晚（PLAN_V111 依据同一性质）。
--    运动（exercise）一天多次是合理语义，不参与清理。
delete from public.wb_health_logs a
using public.wb_health_logs b
where a.user_id  = b.user_id
  and a.log_date = b.log_date
  and a.type     = b.type
  and a.type in ('weight', 'sleep')
  and a.id < b.id;

-- 2) 结构性约束：体重/睡眠每个 (user_id, log_date, type) 只允许一行。
--    用【部分】唯一索引把 exercise 排除在外（一天多次运动合理）。
--    注意：PostgREST 的 on_conflict 无法表达部分索引谓词，因此云端 createHealthLog
--    保留「先查后写」，但查询补上 order(id desc) 以避免命中任意行（v1.26 同步修改）。
create unique index if not exists wb_health_logs_daily_uniq
  on public.wb_health_logs (user_id, log_date, type)
  where type in ('weight', 'sleep');

commit;

-- 执行后自检（应返回 0 行；若返回行说明仍有重复，请把结果发我）：
--   select user_id, log_date, type, count(*)
--     from public.wb_health_logs
--    where type in ('weight','sleep')
--    group by 1,2,3
--   having count(*) > 1;
