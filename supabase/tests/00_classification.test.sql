-- Spec 041, FR-006 / FR-013: every public table is classified and has RLS enabled.
-- The classification list mirrors specs/041-supabase-baseline/data-model.md.
-- A migration that adds a public table must add it here (and to the matching tests) in the same PR.
begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

select set_eq(
  $$select tablename::text from pg_tables where schemaname = 'public'$$,
  array[
    -- studio (self)
    'organizations',
    -- studio-owned (org_id not null)
    'org_members', 'org_invites', 'projects', 'project_versions', 'ai_credit_ledger', 'ai_jobs',
    'ai_settings', 'catalog_models', 'comments', 'price_lists', 'quotes', 'renders',
    'room_templates', 'share_links',
    -- user-owned
    'profiles'
  ],
  'every public table is classified (studio, studio-owned or user-owned)'
);

select is_empty(
  $$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity$$,
  'row-level security is enabled on every public table'
);

select is_empty(
  $$select t.tablename::text from pg_tables t
    where t.schemaname = 'public'
      and t.tablename not in ('organizations', 'profiles')
      and not exists (
        select 1 from information_schema.columns c
        where c.table_schema = 'public' and c.table_name = t.tablename
          and c.column_name = 'org_id' and c.is_nullable = 'NO')$$,
  'every studio-owned table has a non-null org_id'
);

select is_empty(
  $$select c.relname::text from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
      and not exists (select 1 from pg_policy p where p.polrelid = c.oid and p.polcmd in ('r', '*'))$$,
  'every public table has a select policy'
);

select * from finish();
rollback;
