-- Spec 043 (FR-001–FR-008, FR-013; SaaS §8): projects and versions saved to the studio.
-- create_project writes the project and version 1; save_project_version checks the idempotency key
-- first, then compare-and-swap on the head, size and archived state, and hashes the scene itself.
-- Rename, archive, unarchive and delete are table writes decided by RLS and column grants, each
-- audited; the audit log is append-only. Two-connection races are in scripts/test-project-concurrency.mjs.
-- Written before the migration (T003), so on the previous schema it fails.
begin;
create extension if not exists pgtap with schema extensions;
select plan(71);

create schema t043;
grant usage on schema t043 to authenticated, anon;
create function t043.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function t043.act_as_nobody() returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
end $$;
-- Rows affected by a data-modifying statement; a permission error counts as zero.
create function t043.affected(dml text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('with x as (%s returning 1) select count(*) from x', dml) into n; return n;
exception when insufficient_privilege then return 0;
end $$;
grant execute on all functions in schema t043 to authenticated, anon;
-- Results of calls made while impersonating, for checks made afterwards as postgres.
create table t043.r (k text primary key, j jsonb);
grant select, insert on t043.r to authenticated;
create function t043.id(k text) returns uuid language sql as $$ select (j->>'id')::uuid from t043.r where r.k = $1 $$;
create function t043.pid(k text) returns uuid language sql as $$ select (j->>'project_id')::uuid from t043.r where r.k = $1 $$;
create function t043.scene(id uuid, w int default 600) returns jsonb language sql as
  $$ select jsonb_build_object('id', id::text, 'name', 'Test kitchen', 'width', w) $$;
create function t043.audits(target uuid, act text) returns bigint language sql as
  $$ select count(*) from private.audit_log where target_id = target and action = act $$;

-- The detail of a PT409 conflict, or null when the save went through.
create function t043.conflict_detail(p uuid) returns text language plpgsql as $$
declare d text;
begin
  perform * from public.save_project_version(p, 1, gen_random_uuid(), 'kitchen', t043.scene(p), 2);
  return null;
exception when sqlstate 'PT409' then
  get stacked diagnostics d = pg_exception_detail;
  return d;
end $$;
-- Rows visible to the current role; a permission error counts as zero.
create function t043.visible(q text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute q into n; return n;
exception when insufficient_privilege then return 0;
end $$;
grant execute on all functions in schema t043 to authenticated, anon;

-- Seeded users: a1 owner, a2 admin, a3 designer, a4 viewer (Alpha); b3 designer (Beta).
-- Alpha = aaaaaaaa-…, Beta = bbbbbbbb-…

-- ---------------------------------------------------------------------------
-- Grants and hygiene
-- ---------------------------------------------------------------------------
select ok(has_function_privilege('authenticated', 'public.create_project(uuid, text, public.doc_type, jsonb, integer, uuid, text)', 'execute'), 'signed-in users can call create_project');
select ok(not has_function_privilege('anon', 'public.create_project(uuid, text, public.doc_type, jsonb, integer, uuid, text)', 'execute'), 'anon cannot call create_project');
select ok(has_function_privilege('authenticated', 'public.save_project_version(uuid, integer, uuid, public.doc_type, jsonb, integer, public.version_kind, text)', 'execute'), 'signed-in users can call save_project_version');
select ok(not has_function_privilege('anon', 'public.save_project_version(uuid, integer, uuid, public.doc_type, jsonb, integer, public.version_kind, text)', 'execute'), 'anon cannot call save_project_version');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'save_project_version'), 1::bigint,
          'only the new save_project_version exists (the old one took a client hash)');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'private' and p.proname in ('create_project', 'save_project_version', 'projects_audit')
             and p.prosecdef and p.proconfig @> array['search_path=""']),
          3::bigint, 'the private bodies are definer functions with search_path = ''''');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('create_project', 'save_project_version') and not p.prosecdef),
          2::bigint, 'the public functions are SECURITY INVOKER wrappers');
select ok(not has_table_privilege('authenticated', 'private.audit_log', 'select'), 'users cannot read the audit log directly');
select ok(not has_table_privilege('authenticated', 'private.idempotency_keys', 'select'), 'users cannot read idempotency keys');
select ok(not has_table_privilege('authenticated', 'public.projects', 'insert'), 'projects are created only through create_project');
select is((select column_default from information_schema.columns
           where table_schema = 'public' and table_name = 'project_versions' and column_name = 'doc_type'), null,
          'doc_type has no default: every save says what it is');
select is((select count(*) from public.project_versions where doc_type <> 'legacy_v1'
             and project_id not in (select id from public.projects where name like '% Cloud Kitchen')), 0::bigint,
          'seeded versions are legacy_v1 (production backfill is checked at push, T010)');

-- ---------------------------------------------------------------------------
-- Anonymous and signed-out
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select * from public.create_project('aaaaaaaa-0000-4000-8000-000000000000', 'x', 'kitchen', '{}', 2, gen_random_uuid()) $$,
                 '42501', null, 'anon is refused by the grant (create)');
select throws_ok($$ select * from public.save_project_version('aaaa0001-0000-4000-8000-000000000001', 2, gen_random_uuid(), 'kitchen', '{}', 2) $$,
                 '42501', null, 'anon is refused by the grant (save)');
select is(t043.visible('select count(*) from public.projects'), 0::bigint, 'anon sees no projects');
reset role;
select t043.act_as_nobody();
select throws_ok($$ select * from public.create_project('aaaaaaaa-0000-4000-8000-000000000000', 'x', 'kitchen', '{}', 2, gen_random_uuid()) $$,
                 'PT401', null, 'no signed-in user → PT401');
reset role;

-- ---------------------------------------------------------------------------
-- Own studio: a designer creates and saves
-- ---------------------------------------------------------------------------
select t043.act_as('a3000000-0000-4000-8000-000000000003');
insert into t043.r select 'k1', to_jsonb(x) from public.create_project('aaaaaaaa-0000-4000-8000-000000000000', '  Cloud kitchen 1 ', 'kitchen',
  '{"id": "prj_local", "name": "Cloud kitchen 1"}', 2, 'c0000000-0000-4000-8000-000000000001', 'Mrs Rao') x;
reset role;
select results_eq($$ select name, client_name, current_version_no, created_by, org_id from public.projects where id = t043.id('k1') $$,
                  $$ values ('Cloud kitchen 1'::text, 'Mrs Rao'::text, 1, 'a3000000-0000-4000-8000-000000000003'::uuid, 'aaaaaaaa-0000-4000-8000-000000000000'::uuid) $$,
                  'a designer creates a project: trimmed name, client, head 1, owner, studio');
select results_eq($$ select version_no, kind::text, doc_type::text, scene->>'id', scene_hash from public.project_versions where project_id = t043.id('k1') $$,
                  $$ select 1, 'manual', 'kitchen', t043.id('k1')::text,
                            encode(extensions.digest(convert_to(v.scene::text, 'UTF8'), 'sha256'), 'hex')
                     from public.project_versions v where v.project_id = t043.id('k1') $$,
                  'version 1: manual, kitchen, the scene id is the project id, hashed in the database');
select is((select current_version_id from public.projects where id = t043.id('k1')),
          (select id from public.project_versions where project_id = t043.id('k1') and version_no = 1), 'the head points at version 1');

select t043.act_as('a3000000-0000-4000-8000-000000000003');
insert into t043.r select 's2', to_jsonb(x) from public.save_project_version(t043.id('k1'), 1, 'c0000000-0000-4000-8000-000000000002',
  'kitchen', t043.scene(t043.id('k1'), 700), 2, 'autosave', '') x;
reset role;
select is((select current_version_no from public.projects where id = t043.id('k1')), 2, 'a save with expected head 1 becomes version 2');
select is((select j->>'scene_hash' from t043.r where k = 's2'),
          encode(extensions.digest(convert_to(t043.scene(t043.id('k1'), 700)::text, 'UTF8'), 'sha256'), 'hex'),
          'the returned hash is sha256 of the scene as stored');

-- Idempotency on create
select t043.act_as('a3000000-0000-4000-8000-000000000003');
insert into t043.r select 'k1-again', to_jsonb(x) from public.create_project('aaaaaaaa-0000-4000-8000-000000000000', 'Cloud kitchen 1', 'kitchen',
  '{"id": "prj_local"}', 2, 'c0000000-0000-4000-8000-000000000001') x;
reset role;
select is(t043.id('k1-again'), t043.id('k1'), 'create_project with a repeated key returns the same project');
select is((select count(*) from public.projects where name = 'Cloud kitchen 1'), 1::bigint, '…and creates nothing new');

-- ---------------------------------------------------------------------------
-- Compare-and-swap and idempotency on save
-- ---------------------------------------------------------------------------
select t043.act_as('a3000000-0000-4000-8000-000000000003');
select throws_ok(format($$ select * from public.save_project_version(%L, 1, gen_random_uuid(), 'kitchen', %L, 2) $$, t043.id('k1'), t043.scene(t043.id('k1'))),
                 'PT409', null, 'expected head 1 when the head is 2 → PT409');
select is((t043.conflict_detail(t043.id('k1')))::jsonb ->> 'current_version_no', '2', 'the conflict names the current head');
-- Same key again after another save moved the head: the original version comes back.
insert into t043.r select 's3', to_jsonb(x) from public.save_project_version(t043.id('k1'), 2, gen_random_uuid(), 'kitchen', t043.scene(t043.id('k1'), 800), 2, 'manual', 'client review') x;
insert into t043.r select 's2-retry', to_jsonb(x) from public.save_project_version(t043.id('k1'), 1, 'c0000000-0000-4000-8000-000000000002',
  'kitchen', t043.scene(t043.id('k1'), 700), 2, 'autosave', '') x;
reset role;
select is(t043.id('s2-retry'), t043.id('s2'), 'a retried save returns the original version, even after the head moved');
select is((select j->>'version_no' from t043.r where k = 's2-retry'), '2', '…with the same version number');
select is((select count(*) from public.project_versions where project_id = t043.id('k1')), 3::bigint, '…and no duplicate version');
select results_eq($$ select kind::text, message from public.project_versions where id = t043.id('s3') $$,
                  $$ values ('manual'::text, 'client review'::text) $$, 'a manual save keeps its message');
-- The same key from another user is a different save.
select t043.act_as('a1000000-0000-4000-8000-000000000001');
select lives_ok(format($$ select * from public.save_project_version(%L, 3, 'c0000000-0000-4000-8000-000000000002', 'kitchen', %L, 2) $$, t043.id('k1'), t043.scene(t043.id('k1'))),
                'the same key from another user is an independent save');
reset role;
select is((select current_version_no from public.projects where id = t043.id('k1')), 4, '…which becomes version 4');

-- ---------------------------------------------------------------------------
-- Bad arguments, size, restore
-- ---------------------------------------------------------------------------
select t043.act_as('a3000000-0000-4000-8000-000000000003');
select throws_ok(format($$ select * from public.save_project_version(%L, 4, gen_random_uuid(), 'kitchen', %L, 2) $$, t043.id('k1'), t043.scene('aaaa0001-0000-4000-8000-000000000001')),
                 '22023', null, 'a scene belonging to another project is refused');
select throws_ok(format($$ select * from public.save_project_version(%L, 4, gen_random_uuid(), 'legacy_v1', %L, 2) $$, t043.id('k1'), t043.scene(t043.id('k1'))),
                 '22023', null, 'legacy_v1 cannot be saved');
select throws_ok(format($$ select * from public.save_project_version(%L, 4, gen_random_uuid(), 'kitchen', %L, 2, 'revision') $$, t043.id('k1'), t043.scene(t043.id('k1'))),
                 '22023', null, 'the old revision kind is not accepted');
select throws_ok($$ select * from public.create_project('aaaaaaaa-0000-4000-8000-000000000000', 'Old', 'legacy_v1', '{}', 1, gen_random_uuid()) $$,
                 '22023', null, 'a new project cannot be legacy_v1');
select throws_ok(format($$ select * from public.save_project_version(%L, 4, gen_random_uuid(), 'kitchen', %L, 2) $$, t043.id('k1'),
                        jsonb_build_object('id', t043.id('k1')::text, 'pad', repeat('x', 2000000))),
                 'PT413', null, 'a scene over 2 000 000 bytes → PT413');
select lives_ok(format($$ select * from public.save_project_version(%L, 4, gen_random_uuid(), 'kitchen', %L, 2, 'restore', 'Restored version 1') $$, t043.id('k1'), t043.scene(t043.id('k1'))),
                'a restore is saved as a new version');
reset role;
select is((select count(*) from public.project_versions where project_id = t043.id('k1')), 5::bigint, 'the oversized scene wrote no version');
select is((select kind::text from public.project_versions where project_id = t043.id('k1') and version_no = 5), 'restore', 'version 5 is a restore');

-- ---------------------------------------------------------------------------
-- Roles in the own studio
-- ---------------------------------------------------------------------------
select t043.act_as('a4000000-0000-4000-8000-000000000004');
select throws_ok(format($$ select * from public.save_project_version(%L, 5, gen_random_uuid(), 'kitchen', %L, 2) $$, t043.id('k1'), t043.scene(t043.id('k1'))),
                 '42501', null, 'a viewer cannot save');
select throws_ok($$ select * from public.create_project('aaaaaaaa-0000-4000-8000-000000000000', 'Viewer', 'kitchen', '{}', 2, gen_random_uuid()) $$,
                 '42501', null, 'a viewer cannot create a project');
select is(t043.affected(format($$ update public.projects set name = 'viewer rename' where id = %L $$, t043.id('k1'))), 0::bigint, 'a viewer cannot rename');
select is((select count(*) from public.projects where id = t043.id('k1')), 1::bigint, 'a viewer can see the project');
reset role;

-- Column grants: the head and the owner cannot be moved directly.
select t043.act_as('a3000000-0000-4000-8000-000000000003');
select throws_ok(format($$ update public.projects set current_version_no = 99 where id = %L $$, t043.id('k1')), '42501', null, 'a designer cannot move the head directly');
select throws_ok(format($$ update public.projects set org_id = 'bbbbbbbb-0000-4000-8000-000000000000' where id = %L $$, t043.id('k1')), '42501', null, 'a designer cannot move a project to another studio');
select throws_ok(format($$ update public.projects set created_by = 'a4000000-0000-4000-8000-000000000004' where id = %L $$, t043.id('k1')), '42501', null, 'a designer cannot change the owner');
reset role;

-- ---------------------------------------------------------------------------
-- Other studio
-- ---------------------------------------------------------------------------
select t043.act_as('b3000000-0000-4000-8000-000000000003');
select throws_ok($$ select * from public.create_project('aaaaaaaa-0000-4000-8000-000000000000', 'Intruder', 'kitchen', '{}', 2, gen_random_uuid()) $$,
                 '42501', null, 'Beta''s designer cannot create a project in Alpha');
select throws_ok(format($$ select * from public.save_project_version(%L, 5, gen_random_uuid(), 'kitchen', %L, 2) $$, t043.id('k1'), t043.scene(t043.id('k1'))),
                 'PT404', null, 'Beta''s designer cannot save to an Alpha project (and learns nothing)');
select is(t043.affected(format($$ update public.projects set name = 'pwned' where id = %L $$, t043.id('k1'))), 0::bigint, 'Beta''s designer cannot rename an Alpha project');
select is(t043.affected(format($$ update public.projects set archived_at = now() where id = %L $$, t043.id('k1'))), 0::bigint, 'Beta''s designer cannot archive an Alpha project');
select is((select count(*) from public.projects where org_id = 'aaaaaaaa-0000-4000-8000-000000000000'), 0::bigint, 'Beta''s designer sees no Alpha projects');
select is((select count(*) from public.project_versions where org_id = 'aaaaaaaa-0000-4000-8000-000000000000'), 0::bigint, 'Beta''s designer sees no Alpha versions');
reset role;
select t043.act_as('b1000000-0000-4000-8000-000000000001');
select is(t043.affected(format($$ delete from public.projects where id = %L $$, t043.id('k1'))), 0::bigint, 'Beta''s owner cannot delete an Alpha project');
reset role;
select results_eq($$ select name, current_version_no, archived_at is null from public.projects where id = t043.id('k1') $$,
                  $$ values ('Cloud kitchen 1'::text, 5, true) $$, 'the Alpha project is intact');

-- ---------------------------------------------------------------------------
-- Rename, archive, unarchive, delete
-- ---------------------------------------------------------------------------
select t043.act_as('a3000000-0000-4000-8000-000000000003');
select is(t043.affected(format($$ update public.projects set name = 'Rao kitchen' where id = %L $$, t043.id('k1'))), 1::bigint, 'a designer renames');
select is(t043.affected(format($$ update public.projects set archived_at = '2001-01-01' where id = %L $$, t043.id('k1'))), 1::bigint, 'a designer archives');
reset role;
select ok((select archived_at > now() - interval '1 minute' from public.projects where id = t043.id('k1')), 'the archive time is the server''s, not the client''s');
select is((select updated_by from public.projects where id = t043.id('k1')), 'a3000000-0000-4000-8000-000000000003'::uuid, 'the change is stamped with who made it');
select t043.act_as('a3000000-0000-4000-8000-000000000003');
select throws_ok(format($$ select * from public.save_project_version(%L, 5, gen_random_uuid(), 'kitchen', %L, 2) $$, t043.id('k1'), t043.scene(t043.id('k1'))),
                 'PT423', null, 'an archived project cannot be saved');
select is(t043.affected(format($$ delete from public.projects where id = %L $$, t043.id('k1'))), 0::bigint, 'a designer cannot delete');
select is(t043.affected(format($$ update public.projects set archived_at = null where id = %L $$, t043.id('k1'))), 1::bigint, 'a designer unarchives');
reset role;
select t043.act_as('a2000000-0000-4000-8000-000000000002');
select is(t043.affected(format($$ delete from public.projects where id = %L $$, t043.id('k1'))), 0::bigint, 'an admin cannot delete an active project');
select is(t043.affected(format($$ update public.projects set archived_at = now() where id = %L $$, t043.id('k1'))), 1::bigint, 'an admin archives');
select is(t043.affected(format($$ delete from public.projects where id = %L $$, t043.id('k1'))), 1::bigint, 'an admin deletes an archived project');
reset role;
select is((select count(*) from public.project_versions where project_id = t043.id('k1')), 0::bigint, 'its versions go with it');

-- ---------------------------------------------------------------------------
-- Audit: one row per action, outliving the project; append-only for everyone
-- ---------------------------------------------------------------------------
select results_eq($$ select action, count(*)::int from private.audit_log where target_id = t043.id('k1') group by action order by action $$,
                  $$ values ('project.archive'::text, 2), ('project.create', 1), ('project.delete', 1), ('project.rename', 1),
                            ('project.unarchive', 1), ('version.save', 4) $$,
                  'one audit row per create, save, rename, archive, unarchive and delete');
select results_eq($$ select distinct org_id, family from private.audit_log where target_id = t043.id('k1') $$,
                  $$ values ('aaaaaaaa-0000-4000-8000-000000000000'::uuid, 'versions'::text) $$, 'audit rows carry the studio and the versions family');
select is((select actor_id from private.audit_log where target_id = t043.id('k1') and action = 'project.delete'),
          'a2000000-0000-4000-8000-000000000002'::uuid, 'the delete is recorded with the admin who did it');
select throws_ok($$ update private.audit_log set action = 'x' $$, 'PT403', null, 'audit rows cannot be changed, even by the owner');
select throws_ok($$ delete from private.audit_log $$, 'PT403', null, 'audit rows cannot be deleted, even by the owner');
select throws_ok($$ truncate private.audit_log $$, 'PT403', null, 'the audit log cannot be truncated');

select * from finish();
rollback;
