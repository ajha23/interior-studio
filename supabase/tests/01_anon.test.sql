-- Spec 041, FR-006: the anonymous role reads nothing and writes nothing.
-- "Denied" means either zero visible rows or a permission error (SQLSTATE 42501).
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

-- Count rows visible to the current role; a permission error counts as zero.
create function pg_temp.visible(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute sql into n;
  return n;
exception when insufficient_privilege then
  return 0;
end $$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);

select is(pg_temp.visible(format('select count(*) from public.%I', t)), 0::bigint,
          format('anon reads no rows from %s', t))
from unnest(array[
  'organizations', 'org_members', 'org_invites', 'projects', 'project_versions', 'ai_credit_ledger',
  'ai_jobs', 'ai_settings', 'catalog_models', 'comments', 'price_lists', 'quotes', 'renders',
  'room_templates', 'share_links', 'profiles'
]) as t;

select throws_ok(
  $$insert into public.projects (org_id, name) values ('aaaaaaaa-0000-4000-8000-000000000000', 'anon project')$$,
  '42501', null, 'anon cannot insert a project');

select throws_ok(
  $$insert into public.org_members (org_id, user_id, role)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'c0000000-0000-4000-8000-000000000000', 'owner')$$,
  '42501', null, 'anon cannot add a studio member');

select throws_ok(
  $$insert into public.organizations (name, slug) values ('Anon Studio', 'anon-studio')$$,
  '42501', null, 'anon cannot create a studio');

select * from finish();
rollback;
