-- 010: v1.16 速记多标签——tag 单标签列升格为 tags 数组
-- 幂等：add column if not exists + 仅在 tags 为空且 tag 非空时回填，可安全重跑。
-- ⚠️ 部署顺序：先在 Supabase 执行本文件，再部署引用 tags 列的代码（v1.16.0）。
-- tag 旧列暂保留（回滚兼容），代码已不再读写；确认稳定后可在后续迁移 drop。

alter table public.wb_notes add column if not exists tags text[] not null default '{}';

update wb_notes
set tags = array[tag]
where tag is not null and tag <> '' and cardinality(tags) = 0;
