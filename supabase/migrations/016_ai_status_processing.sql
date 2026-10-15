-- 016 修正 wb_hot_items 的状态机：把 'processing' 补进去（2026-10-15，配套 v1.28.5）
--
-- 症状：/api/digest-enrich 稳定 500，正文只有一句没用的 {"ok":false,"error":"internal error"}；
--       紧接着 /api/digest-build 返回 built:false。两个现象是同一条链子上的。
--
-- 根因（两份真相打架）：
--   015 建表时状态机只允许 pending / done / skipped / failed —— 漏了 processing，
--   而同一个迁移里的 public.wb_claim_items() 领取条目时正是把它置为 'processing'。
--   于是这个函数【每次调用】都抛 23514 check_violation，条目一条也领不出来。
--   放大后果：没有条目被处理 → 没有 done 条目可聚簇 → 一个事件都建不起来 →
--   build 无从编排，只能返回 built:false。
--
--   为什么测试没拦住：单测里的 Supabase 替身是 JS 实现的，它只认逻辑、不认 CHECK 约束，
--   建表语句和领取函数之间的矛盾在测试里完全不可见。
--   已补 tests/digest-schema.test.ts：解析迁移 SQL，断言代码与 SQL 写进该列的每个取值
--   都出现在【最新一次】 CHECK 定义里。先跑红（expected ['processing'] to equal []）再修。
--
--   顺带修掉「错误信息被吞掉」：PostgREST 的报错是普通对象而不是 Error 实例，
--   原来那句三元判断永远只吐出 'internal error'。现在统一摊平成可读文本，
--   并附上失败发生在哪一段（stage），下一次出错一眼就能定位。
--
-- 修复：放宽 CHECK，把 processing 纳入状态机。其余一律不动。
-- 幂等：按【定义内容】而不是按名字找出这条 CHECK 再删（自动生成的名字可能因环境而异），然后重建。

begin;

do $$
declare c text;
begin
  for c in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
     where n.nspname = 'public'
       and rel.relname = 'wb_hot_items'
       and con.contype = 'c'
       and pg_get_constraintdef(con.oid) like '%ai_status%'
  loop
    execute format('alter table public.wb_hot_items drop constraint %I', c);
  end loop;
end $$;

alter table public.wb_hot_items
  add constraint wb_hot_items_ai_status_check
  check (ai_status in ('pending','processing','done','skipped','failed'));

commit;

-- 执行后自检（应看到 processing 在里面，共 5 个取值）：
--   select pg_get_constraintdef(oid) from pg_constraint where conname = 'wb_hot_items_ai_status_check';
