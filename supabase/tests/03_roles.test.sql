-- Spec 041, FR-006 / FR-011: role rules inside one studio, as the live policies define them
-- (specs/041-supabase-baseline/data-model.md), plus privileges that bypass row-level security.
begin;
create extension if not exists pgtap with schema extensions;
select plan(59);

create schema t041;
grant usage on schema t041 to authenticated, anon;

create function t041.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

create function t041.affected(dml text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('with x as (%s returning 1) select count(*) from x', dml) into n; return n;
exception when insufficient_privilege then return 0;
end $$;

grant execute on all functions in schema t041 to authenticated, anon;

-- ---------------------------------------------------------------------------
-- TRUNCATE bypasses RLS: no API role may hold it on any public table (32 tests)
-- ---------------------------------------------------------------------------
select ok(not has_table_privilege(r.role, format('public.%I', t.tbl), 'TRUNCATE'),
          format('%s cannot truncate %s', r.role, t.tbl))
from unnest(array[
  'organizations', 'org_members', 'org_invites', 'projects', 'project_versions', 'ai_credit_ledger',
  'ai_jobs', 'ai_settings', 'catalog_models', 'comments', 'price_lists', 'quotes', 'renders',
  'room_templates', 'share_links', 'profiles'
]) as t(tbl)
cross join (values ('anon'), ('authenticated')) as r(role);

-- Tables created later by migrations (owner: postgres) must not get TRUNCATE either (2 tests)
create table public.t041_future_table (id int);
select ok(not has_table_privilege('anon', 'public.t041_future_table', 'TRUNCATE'),
          'anon gets no TRUNCATE on tables created later');
select ok(not has_table_privilege('authenticated', 'public.t041_future_table', 'TRUNCATE'),
          'authenticated gets no TRUNCATE on tables created later');
drop table public.t041_future_table;

-- ---------------------------------------------------------------------------
-- Viewer (a4): read-only
-- ---------------------------------------------------------------------------
select t041.act_as('a4000000-0000-4000-8000-000000000004');
select throws_ok(
  $$insert into public.projects (org_id, name, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'viewer project', 'a4000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'viewer cannot create a project');
select is(t041.affected($$update public.projects set name = 'renamed by viewer'
                          where id = 'aaaa0001-0000-4000-8000-000000000001'$$), 0::bigint,
          'viewer cannot rename a project');
select throws_ok(
  $$insert into public.project_versions (project_id, org_id, version_no, schema_version, scene, scene_hash, created_by)
    values ('aaaa0001-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000000', 50, 2, '{}', 'x',
            'a4000000-0000-4000-8000-000000000004')$$,
  '42501', null, 'viewer cannot write a project version');

-- ---------------------------------------------------------------------------
-- Designer (a3): edits projects, cannot manage the studio
-- ---------------------------------------------------------------------------
select t041.act_as('a3000000-0000-4000-8000-000000000003');
-- Spec 043: projects are created only through create_project (direct insert is revoked).
select lives_ok(
  $$select * from public.create_project('aaaaaaaa-0000-4000-8000-000000000000', 'designer project', 'kitchen',
                                        '{"id": "x"}', 2, gen_random_uuid())$$,
  'designer can create a project (positive control)');
select throws_ok(
  $$insert into public.projects (org_id, name, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'designer project', 'a3000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'designer cannot insert a project directly (create_project only)');
select is(t041.affected($$delete from public.projects where id = 'aaaa0002-0000-4000-8000-000000000002'$$), 0::bigint,
          'designer cannot delete a project (admin+ only)');
select throws_ok(
  $$insert into public.org_invites (org_id, email, role)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'friend@example.test', 'designer')$$,
  '42501', null, 'designer cannot invite');
select is(t041.affected($$update public.org_members set role = 'admin'
                          where user_id = 'a3000000-0000-4000-8000-000000000003'$$), 0::bigint,
          'designer cannot change roles (not even their own)');
select throws_ok(
  $$insert into public.ai_credit_ledger (org_id, delta, reason, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 100, 'topup', 'a3000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'designer cannot add AI credits');

-- ---------------------------------------------------------------------------
-- Admin (a2): manages members, never owners
-- ---------------------------------------------------------------------------
select t041.act_as('a2000000-0000-4000-8000-000000000002');
select lives_ok(
  $$insert into public.org_invites (org_id, email, role)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'newdesigner@example.test', 'designer')$$,
  'admin can invite a designer (positive control)');
select throws_ok(
  $$insert into public.org_invites (org_id, email, role)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'newowner@example.test', 'owner')$$,
  '42501', null, 'admin cannot invite an owner');
select is(t041.affected($$update public.org_members set role = 'viewer'
                          where user_id = 'a1000000-0000-4000-8000-000000000001'$$), 0::bigint,
          'admin cannot demote the owner');
select is(t041.affected($$delete from public.org_members
                          where user_id = 'a1000000-0000-4000-8000-000000000001'$$), 0::bigint,
          'admin cannot remove the owner');
select throws_ok(
  $$update public.org_members set role = 'owner' where user_id = 'a3000000-0000-4000-8000-000000000003'$$,
  '42501', null, 'admin cannot promote a member to owner');
select throws_ok(
  $$insert into public.ai_credit_ledger (org_id, delta, reason, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000000', -100, 'debit', 'a2000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'admin cannot write debits or refunds directly');
-- Spec 042 FR-020: studios cannot add their own credits; only the operator function can.
select throws_ok(
  $$insert into public.ai_credit_ledger (org_id, delta, reason, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 100, 'topup', 'a2000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'admin cannot add a top-up');

-- ---------------------------------------------------------------------------
-- Nobody writes versions or AI jobs directly, not even the owner (a1)
-- ---------------------------------------------------------------------------
select t041.act_as('a1000000-0000-4000-8000-000000000001');
select throws_ok(
  $$insert into public.project_versions (project_id, org_id, version_no, schema_version, scene, scene_hash, created_by)
    values ('aaaa0001-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000000', 51, 2, '{}', 'x',
            'a1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'owner cannot insert a version directly (save_project_version only)');
select is(t041.affected($$update public.project_versions set message = 'edited'
                          where project_id = 'aaaa0001-0000-4000-8000-000000000001'$$), 0::bigint,
          'owner cannot edit a saved version');
select is(t041.affected($$delete from public.project_versions
                          where project_id = 'aaaa0001-0000-4000-8000-000000000001'$$), 0::bigint,
          'owner cannot delete a saved version');
select throws_ok(
  $$insert into public.ai_jobs (org_id, project_id, kind, op, provider, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'aaaa0001-0000-4000-8000-000000000001', 'command', 'x',
            'rules', 'a1000000-0000-4000-8000-000000000001')$$,
  '42501', null, 'owner cannot insert an AI job directly');
select is(t041.affected($$update public.ai_jobs set status = 'failed'
                          where org_id = 'aaaaaaaa-0000-4000-8000-000000000000'$$), 0::bigint,
          'owner cannot change an AI job');
select is(t041.affected($$delete from public.ai_jobs where org_id = 'aaaaaaaa-0000-4000-8000-000000000000'$$), 0::bigint,
          'owner cannot delete an AI job');
select is(t041.affected($$update public.ai_credit_ledger set delta = 99999
                          where org_id = 'aaaaaaaa-0000-4000-8000-000000000000'$$), 0::bigint,
          'owner cannot edit the credit ledger');
select is(t041.affected($$delete from public.ai_credit_ledger where org_id = 'aaaaaaaa-0000-4000-8000-000000000000'$$), 0::bigint,
          'owner cannot delete credit ledger rows');
select throws_ok(
  $$insert into public.organizations (name, slug) values ('Second Studio', 'second-studio')$$,
  '42501', null, 'owner cannot create a studio directly');

reset role;
select * from finish();
rollback;
