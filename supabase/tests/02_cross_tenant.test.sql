-- Spec 041, FR-006 / FR-013: no member of studio A, in any role, can select, insert, update or
-- delete studio B's rows in any studio-owned table. Studio B's rows must still exist afterwards,
-- and each user must see their own studio's rows (positive control: a "0 rows" result only means
-- something if the rows exist and are visible to their owners).
-- "Denied" = zero rows affected/visible, or a permission error (SQLSTATE 42501).
begin;
create extension if not exists pgtap with schema extensions;
select plan(332);

-- Test helpers live in a throwaway schema; the transaction rollback removes them.
create schema t041;
grant usage on schema t041 to authenticated, anon;

create function t041.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims',
    json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;

-- Rows visible to the current role; a permission error counts as zero.
create function t041.visible(sql text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute sql into n; return n;
exception when insufficient_privilege then return 0;
end $$;

-- Rows affected by a data-modifying statement; a permission error counts as zero.
create function t041.affected(dml text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('with x as (%s returning 1) select count(*) from x', dml) into n; return n;
exception when insufficient_privilege then return 0;
end $$;

-- Five checks for one table and one attacking user.
create function t041.cross_tenant(tbl text, key text, who text, attacker uuid,
                                  own_org uuid, victim_org uuid, expect_own boolean)
returns setof text language plpgsql as $$
declare before bigint; after bigint; own bigint;
begin
  execute 'reset role';
  execute format('select count(*) from public.%I where %I = %L', tbl, key, victim_org) into before;

  perform t041.act_as(attacker);
  return next is(t041.visible(format('select count(*) from public.%I where %I = %L', tbl, key, victim_org)),
                 0::bigint, format('%s: %s cannot see studio B rows', tbl, who));
  return next is(t041.affected(format('update public.%I set %I = %I where %I = %L', tbl, key, key, key, victim_org)),
                 0::bigint, format('%s: %s cannot update studio B rows', tbl, who));
  return next is(t041.affected(format('delete from public.%I where %I = %L', tbl, key, victim_org)),
                 0::bigint, format('%s: %s cannot delete studio B rows', tbl, who));
  own := t041.visible(format('select count(*) from public.%I where %I = %L', tbl, key, own_org));
  return next is(own > 0, expect_own,
                 format('%s: %s %s own studio rows (positive control)', tbl, who,
                        case when expect_own then 'sees' else 'does not see' end));

  execute 'reset role';
  execute format('select count(*) from public.%I where %I = %L', tbl, key, victim_org) into after;
  return next ok(before > 0 and after = before, format('%s: studio B rows intact after %s (%s rows)', tbl, who, before));
end $$;

grant execute on all functions in schema t041 to authenticated, anon;

-- ---------------------------------------------------------------------------
-- Select / update / delete: 15 tables x 4 roles x 5 checks = 300 tests
-- ---------------------------------------------------------------------------
select t041.cross_tenant(t.tbl, t.key, r.who, r.uid,
                         'aaaaaaaa-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000000',
                         -- live rule: invites are visible to owners and admins only
                         not (t.tbl = 'org_invites' and r.who in ('designer.a', 'viewer.a')))
from (values
  ('organizations', 'id'), ('org_members', 'org_id'), ('org_invites', 'org_id'), ('projects', 'org_id'),
  ('project_versions', 'org_id'), ('ai_credit_ledger', 'org_id'), ('ai_jobs', 'org_id'),
  ('ai_settings', 'org_id'), ('catalog_models', 'org_id'), ('comments', 'org_id'),
  ('price_lists', 'org_id'), ('quotes', 'org_id'), ('renders', 'org_id'),
  ('room_templates', 'org_id'), ('share_links', 'org_id')
) as t(tbl, key)
cross join (values
  ('owner.a',    'a1000000-0000-4000-8000-000000000001'::uuid),
  ('admin.a',    'a2000000-0000-4000-8000-000000000002'::uuid),
  ('designer.a', 'a3000000-0000-4000-8000-000000000003'::uuid),
  ('viewer.a',   'a4000000-0000-4000-8000-000000000004'::uuid)
) as r(who, uid);

-- ---------------------------------------------------------------------------
-- Inserts into studio B: 14 studio-owned tables x 2 roles (owner.a, designer.a) = 28 tests
-- ---------------------------------------------------------------------------
create function t041.insert_into_b(who text, uid uuid) returns setof text language plpgsql as $$
declare
  b constant text := 'bbbbbbbb-0000-4000-8000-000000000000';
  bp constant text := 'bbbb0001-0000-4000-8000-000000000001';
  stmt record;
begin
  perform t041.act_as(uid);
  for stmt in
    select * from (values
      ('projects',         format($q$insert into public.projects (org_id, name, created_by) values (%L, 'x', %L)$q$, b, uid)),
      ('project_versions', format($q$insert into public.project_versions (project_id, org_id, version_no, schema_version, scene, scene_hash, created_by) values (%L, %L, 99, 2, '{}', 'x', %L)$q$, bp, b, uid)),
      ('org_members',      format($q$insert into public.org_members (org_id, user_id, role) values (%L, %L, 'owner')$q$, b, uid)),
      ('org_invites',      format($q$insert into public.org_invites (org_id, email, role) values (%L, 'intruder@example.test', 'admin')$q$, b)),
      ('ai_credit_ledger', format($q$insert into public.ai_credit_ledger (org_id, delta, reason) values (%L, 100, 'topup')$q$, b)),
      ('ai_jobs',          format($q$insert into public.ai_jobs (org_id, project_id, kind, op, provider, created_by) values (%L, %L, 'command', 'x', 'rules', %L)$q$, b, bp, uid)),
      ('ai_settings',      format($q$insert into public.ai_settings (org_id) values (%L)$q$, b)),
      ('catalog_models',   format($q$insert into public.catalog_models (org_id, name, storage_path, width_um, depth_um, height_um, source_format, created_by) values (%L, 'x', %L, 1, 1, 1, 'glb', %L)$q$, b, b || '/m.glb', uid)),
      ('comments',         format($q$insert into public.comments (org_id, project_id, body, source, author_id) values (%L, %L, 'x', 'team', %L)$q$, b, bp, uid)),
      ('price_lists',      format($q$insert into public.price_lists (org_id, rates) values (%L, '{}')$q$, b)),
      ('quotes',           format($q$insert into public.quotes (org_id, project_id, quote_no, lines, totals, rates) values (%L, %L, 'X-9', '[]', '{}', '{}')$q$, b, bp)),
      ('renders',          format($q$insert into public.renders (org_id, project_id, storage_path, width, height) values (%L, %L, %L, 100, 100)$q$, b, bp, b || '/x.png')),
      ('room_templates',   format($q$insert into public.room_templates (org_id, name, template, created_by) values (%L, 'x', '{}', %L)$q$, b, uid)),
      ('share_links',      format($q$insert into public.share_links (org_id, project_id, created_by) values (%L, %L, %L)$q$, b, bp, uid))
    ) as v(tbl, sql)
  loop
    return next throws_ok(stmt.sql, '42501', null, format('%s: %s cannot insert into studio B', stmt.tbl, who));
  end loop;
  execute 'reset role';
end $$;
grant execute on function t041.insert_into_b(text, uuid) to authenticated;

select t041.insert_into_b('owner.a', 'a1000000-0000-4000-8000-000000000001');
select t041.insert_into_b('designer.a', 'a3000000-0000-4000-8000-000000000003');

-- ---------------------------------------------------------------------------
-- Studio A rows pointing at a studio B project: 4 tests (private.project_in_org)
-- ---------------------------------------------------------------------------
select t041.act_as('a3000000-0000-4000-8000-000000000003');

select throws_ok(
  $$insert into public.quotes (org_id, project_id, quote_no, lines, totals, rates)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'bbbb0001-0000-4000-8000-000000000001', 'A-9', '[]', '{}', '{}')$$,
  '42501', null, 'quotes: designer.a cannot attach a studio A quote to a studio B project');

select throws_ok(
  $$insert into public.renders (org_id, project_id, storage_path, width, height)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'bbbb0001-0000-4000-8000-000000000001',
            'aaaaaaaa-0000-4000-8000-000000000000/x.png', 100, 100)$$,
  '42501', null, 'renders: designer.a cannot attach a studio A render to a studio B project');

select throws_ok(
  $$insert into public.share_links (org_id, project_id, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'bbbb0001-0000-4000-8000-000000000001',
            'a3000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'share_links: designer.a cannot share a studio B project from studio A');

select throws_ok(
  $$insert into public.comments (org_id, project_id, body, source, author_id)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'bbbb0001-0000-4000-8000-000000000001',
            'x', 'team', 'a3000000-0000-4000-8000-000000000003')$$,
  '42501', null, 'comments: designer.a cannot comment on a studio B project from studio A');

reset role;
select * from finish();
rollback;
