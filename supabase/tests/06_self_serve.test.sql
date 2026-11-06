-- Spec 042, User Story 5 (FR-017–FR-021): every confirmed new user gets one Free studio; Free studios
-- have 0 AI credits; studios cannot change their own credits; only the operator function can.
-- Written before the migration (T044), so on the previous schema it fails.
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create schema t042b;
grant usage on schema t042b to authenticated, anon;
create function t042b.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function t042b.affected(dml text) returns bigint language plpgsql as $$
declare n bigint;
begin
  execute format('with x as (%s returning 1) select count(*) from x', dml) into n; return n;
exception when insufficient_privilege then return 0;
end $$;
grant execute on all functions in schema t042b to authenticated, anon;

-- Users for this test: a confirmed newcomer, an invited newcomer, an unconfirmed newcomer.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values
  ('00000000-0000-0000-0000-000000000000', 'f5000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'solo@example.test', '', now(), '{}', '{"full_name":"Solo Person"}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f5000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'invited.newcomer@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', 'f5000000-0000-4000-8000-000000000003', 'authenticated', 'authenticated',
   'unconfirmed.newcomer@example.test', '', null, '{}', '{}', now(), now(), '', '', '', '');
insert into public.org_invites (org_id, email, role)
values ('aaaaaaaa-0000-4000-8000-000000000000', 'invited.newcomer@example.test', 'designer');

-- ---------------------------------------------------------------------------
-- A confirmed newcomer gets exactly one Free studio, as owner
-- ---------------------------------------------------------------------------
select t042b.act_as('f5000000-0000-4000-8000-000000000001');
select lives_ok('select public.start_session()', 'a confirmed newcomer can start a session');
reset role;
select is((select count(*) from public.org_members where user_id = 'f5000000-0000-4000-8000-000000000001'), 1::bigint,
          'they belong to exactly one studio');
select is((select role::text from public.org_members where user_id = 'f5000000-0000-4000-8000-000000000001'), 'owner',
          'they own it');
select is((select o.plan from public.organizations o join public.org_members m on m.org_id = o.id
           where m.user_id = 'f5000000-0000-4000-8000-000000000001'), 'free', 'the new studio is on the Free plan');
select is((select o.name from public.organizations o join public.org_members m on m.org_id = o.id
           where m.user_id = 'f5000000-0000-4000-8000-000000000001'), 'Solo''s studio', 'it is named after them');
select matches((select o.slug::text from public.organizations o join public.org_members m on m.org_id = o.id
                where m.user_id = 'f5000000-0000-4000-8000-000000000001'), '^[a-z0-9-]{2,60}$', 'its slug is valid');

select t042b.act_as('f5000000-0000-4000-8000-000000000001');
select public.start_session();
reset role;
select is((select count(*) from public.org_members where user_id = 'f5000000-0000-4000-8000-000000000001'), 1::bigint,
          'signing in again creates no second studio');

-- Free studio credits are 0.
select t042b.act_as('f5000000-0000-4000-8000-000000000001');
select is(public.ai_credit_balance((select org_id from public.org_members where user_id = 'f5000000-0000-4000-8000-000000000001')),
          0, 'a Free studio has 0 AI credits');
reset role;

-- ---------------------------------------------------------------------------
-- An invited newcomer joins the inviting studio and gets no personal studio
-- ---------------------------------------------------------------------------
select t042b.act_as('f5000000-0000-4000-8000-000000000002');
select public.start_session();
reset role;
select is((select array_agg(org_id) from public.org_members where user_id = 'f5000000-0000-4000-8000-000000000002'),
          array['aaaaaaaa-0000-4000-8000-000000000000'::uuid], 'an invited newcomer joins only the inviting studio');
select is((select role::text from public.org_members where user_id = 'f5000000-0000-4000-8000-000000000002'), 'designer',
          'with the invited role');

-- ---------------------------------------------------------------------------
-- An unconfirmed newcomer gets nothing
-- ---------------------------------------------------------------------------
select t042b.act_as('f5000000-0000-4000-8000-000000000003');
select public.start_session();
reset role;
select is((select count(*) from public.org_members where user_id = 'f5000000-0000-4000-8000-000000000003'), 0::bigint,
          'an unconfirmed newcomer gets no studio');

-- ---------------------------------------------------------------------------
-- Every sign-in records studio activity (spec 056 uses it)
-- ---------------------------------------------------------------------------
update public.organizations set last_active_at = now() - interval '30 days' where id = 'aaaaaaaa-0000-4000-8000-000000000000';
select t042b.act_as('a3000000-0000-4000-8000-000000000003');  -- designer.a
select public.start_session();
reset role;
select ok((select last_active_at > now() - interval '1 minute' from public.organizations where id = 'aaaaaaaa-0000-4000-8000-000000000000'),
          'a member signing in updates the studio''s last-active time');

-- ---------------------------------------------------------------------------
-- Other plans keep the current 500 fallback (the in-house studio is unchanged)
-- ---------------------------------------------------------------------------
select private.ensure_monthly_grant((select id from public.organizations where slug = 'interior-studio'));
select is((select coalesce(sum(delta), 0)::int from public.ai_credit_ledger
           where org_id = (select id from public.organizations where slug = 'interior-studio')),
          500, 'an in-house studio keeps its 500-credit monthly fallback');

-- ---------------------------------------------------------------------------
-- Studios cannot change their own credits
-- ---------------------------------------------------------------------------
select t042b.act_as('a2000000-0000-4000-8000-000000000002');  -- admin.a
select is(t042b.affected($$update public.ai_settings set monthly_credits = 100000
                          where org_id = 'aaaaaaaa-0000-4000-8000-000000000000'$$), 0::bigint,
          'an admin cannot raise their studio''s AI allowance');
select throws_ok(
  $$insert into public.ai_credit_ledger (org_id, delta, reason, created_by)
    values ('aaaaaaaa-0000-4000-8000-000000000000', 100, 'topup', 'a2000000-0000-4000-8000-000000000002')$$,
  '42501', null, 'an admin cannot add AI credits');
reset role;

-- ---------------------------------------------------------------------------
-- Only the operator function grants credits
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('authenticated', 'private.set_ai_credits(text,integer,integer,text)', 'execute'),
          'signed-in users cannot run the operator credit function');
select ok(not has_function_privilege('anon', 'private.set_ai_credits(text,integer,integer,text)', 'execute'),
          'anonymous callers cannot run the operator credit function');
select private.set_ai_credits(
  (select o.slug::text from public.organizations o join public.org_members m on m.org_id = o.id
   where m.user_id = 'f5000000-0000-4000-8000-000000000001'),
  200, 50, 'pgTAP grant');
select is((select monthly_credits from public.ai_settings s join public.org_members m on m.org_id = s.org_id
           where m.user_id = 'f5000000-0000-4000-8000-000000000001'), 200, 'the operator sets a monthly allowance');
select is((select delta from public.ai_credit_ledger l join public.org_members m on m.org_id = l.org_id
           where m.user_id = 'f5000000-0000-4000-8000-000000000001' and l.reason = 'topup'), 50,
          'and adds a one-off top-up');

select * from finish();
rollback;
