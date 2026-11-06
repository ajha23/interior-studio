-- Spec 042, FR-015: invites never change an existing member's role, an invite for an existing member is
-- refused, and accepting invites requires a confirmed email address.
-- Written before the migration (T030): on the 041 baseline the first, second, third and unconfirmed-
-- email tests fail; the fix is 20261106*_invites_never_change_existing_members.sql.
begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

create schema t042;
grant usage on schema t042 to authenticated, anon;

create function t042.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
grant execute on all functions in schema t042 to authenticated, anon;

-- Two extra users, created as postgres: one confirmed with no studio, one whose email is not confirmed.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'e1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'newbie@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'e2000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'unconfirmed@example.test', '', null, '{}', '{}', now(), now(), '', '', '', '');

-- ---------------------------------------------------------------------------
-- Inviting an existing member is refused (closes the owner-demotion path)
-- ---------------------------------------------------------------------------
select t042.act_as('a2000000-0000-4000-8000-000000000002');  -- admin.a
select throws_ok(
  $$insert into public.org_invites (org_id, email, role)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'designer.a@example.test', 'viewer')$$,
  '23505', 'already a member', 'admin cannot invite someone who is already a member');
select throws_ok(
  $$insert into public.org_invites (org_id, email, role)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'OWNER.A@example.test', 'viewer')$$,
  '23505', 'already a member', 'admin cannot invite the owner (any letter case) as a viewer');
select lives_ok(
  $$insert into public.org_invites (org_id, email, role)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'colleague@example.test', 'designer')$$,
  'admin can still invite someone who is not a member (positive control)');

-- ---------------------------------------------------------------------------
-- A stale invite (created before the person joined) never changes their role
-- ---------------------------------------------------------------------------
reset role;
set local session_replication_role = replica;  -- simulate an invite written before membership existed
insert into public.org_invites (id, org_id, email, role)
values ('e3000000-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000000', 'owner.a@example.test', 'viewer')
on conflict (org_id, email) do update set id = excluded.id, role = 'viewer', accepted_at = null;
set local session_replication_role = origin;

select t042.act_as('a1000000-0000-4000-8000-000000000001');  -- owner.a signs in
select public.accept_pending_invites();
reset role;
select is((select role::text from public.org_members
           where org_id = 'aaaaaaaa-0000-4000-8000-000000000000' and user_id = 'a1000000-0000-4000-8000-000000000001'),
          'owner', 'accepting a stale invite does not demote the owner');
select isnt((select accepted_at from public.org_invites where id = 'e3000000-0000-4000-8000-000000000003'), null,
            'the stale invite is marked accepted, so it does not linger');

-- ---------------------------------------------------------------------------
-- A confirmed new user joins with the invited role
-- ---------------------------------------------------------------------------
insert into public.org_invites (org_id, email, role)
values ('aaaaaaaa-0000-4000-8000-000000000000', 'newbie@example.test', 'designer');
select t042.act_as('e1000000-0000-4000-8000-000000000001');
select is(public.accept_pending_invites(), 1, 'a confirmed user accepts their one invite');
reset role;
select is((select role::text from public.org_members
           where org_id = 'aaaaaaaa-0000-4000-8000-000000000000' and user_id = 'e1000000-0000-4000-8000-000000000001'),
          'designer', 'the new member has the invited role');

-- ---------------------------------------------------------------------------
-- An unconfirmed email gains nothing from an invite for that address
-- ---------------------------------------------------------------------------
insert into public.org_invites (id, org_id, email, role)
values ('e4000000-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000000', 'unconfirmed@example.test', 'admin');
select t042.act_as('e2000000-0000-4000-8000-000000000002');
select is(public.accept_pending_invites(), 0, 'an unconfirmed email accepts nothing');
reset role;
select is((select count(*) from public.org_members where user_id = 'e2000000-0000-4000-8000-000000000002'), 0::bigint,
          'an unconfirmed email gets no membership');
select is((select accepted_at from public.org_invites where id = 'e4000000-0000-4000-8000-000000000004'), null,
          'the invite stays pending for when the address is confirmed');

-- ---------------------------------------------------------------------------
-- Who may invite, and who may call the function
-- ---------------------------------------------------------------------------
select t042.act_as('a3000000-0000-4000-8000-000000000003');  -- designer.a
select throws_ok(
  $$insert into public.org_invites (org_id, email, role)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 'friend@example.test', 'designer')$$,
  '42501', null, 'a designer cannot invite');
reset role;
select ok(not has_function_privilege('anon', 'public.accept_pending_invites()', 'execute'),
          'anon cannot execute accept_pending_invites');

select * from finish();
rollback;
