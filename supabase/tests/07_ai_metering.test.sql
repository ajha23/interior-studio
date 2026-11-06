-- Spec 045, User Stories 1–2 (FR-004–FR-008, FR-011): AI calls are charged in the database before
-- any provider call. Only signed-in, non-viewer members of the studio can start a call; the cost
-- comes from private.ai_costs; the balance never goes below the cost; a failure is refunded only
-- with the finish token the server holds; stuck jobs are refunded by the next call.
-- Written before the migration (T006), so on the previous schema it fails.
begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

create schema t045;
grant usage on schema t045 to authenticated, anon;
create function t045.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
end $$;
create function t045.act_as_nobody() returns void language plpgsql as $$
begin
  perform set_config('role', 'authenticated', true);
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated')::text, true);
end $$;
grant execute on all functions in schema t045 to authenticated, anon;
-- Calls made while impersonating write their result here, for checks made afterwards as postgres.
create table t045.r (k text primary key, j jsonb);
grant select, insert on t045.r to authenticated;

create function t045.balance(org uuid) returns int language sql as
  $$ select coalesce(sum(delta), 0)::int from public.ai_credit_ledger where org_id = org $$;

-- A Free test studio with 0 credits and one owner.
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
                        confirmation_token, recovery_token, email_change_token_new, email_change)
values ('00000000-0000-0000-0000-000000000000', 'f7000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
        'free.owner@example.test', '', now(), '{}', '{}', now(), now(), '', '', '', '');
insert into public.organizations (id, name, slug, plan) values ('fa000000-0000-4000-8000-000000000000', 'Free Test Studio', 'free-test', 'free');
insert into public.org_members (org_id, user_id, role) values ('fa000000-0000-4000-8000-000000000000', 'f7000000-0000-4000-8000-000000000001', 'owner');

-- ---------------------------------------------------------------------------
-- Grants and hygiene
-- ---------------------------------------------------------------------------
select ok(not has_function_privilege('anon', 'public.ai_start_call(uuid, text)', 'execute'), 'anon cannot start an AI call');
select ok(has_function_privilege('authenticated', 'public.ai_start_call(uuid, text)', 'execute'), 'signed-in users can start an AI call');
select ok(not has_function_privilege('anon', 'public.ai_finish_call(uuid, text, boolean, text, text)', 'execute'), 'anon cannot finish an AI call');
select ok(has_function_privilege('authenticated', 'public.ai_finish_call(uuid, text, boolean, text, text)', 'execute'), 'signed-in users can finish an AI call');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'ai_debit'),
          0::bigint, 'the old ai_debit (caller-supplied user and cost) is gone');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname, p.proname) in (('public', 'ai_credit_balance'), ('private', 'ai_start_call'), ('private', 'ai_finish_call'))
             and p.prosecdef and p.proconfig @> array['search_path=""']),
          3::bigint, 'ai_credit_balance and both private bodies are definer functions with search_path = ''''');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname in ('ai_start_call', 'ai_finish_call') and not p.prosecdef),
          2::bigint, 'the public functions are SECURITY INVOKER wrappers');
select ok(not has_table_privilege('authenticated', 'private.ai_costs', 'select'), 'users cannot read the cost table directly');
select ok(not has_table_privilege('authenticated', 'private.ai_call_tokens', 'select'), 'users cannot read finish tokens');

-- ---------------------------------------------------------------------------
-- Who may start a call
-- ---------------------------------------------------------------------------
set local role anon;
select throws_ok($$ select public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'assistant') $$, '42501', null, 'anon is refused by the grant');
reset role;
select t045.act_as_nobody();
select throws_ok($$ select public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'assistant') $$, 'PT401', null, 'no signed-in user → PT401');
reset role;
select t045.act_as('b1000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'assistant') $$, 'PT403', null, 'the owner of Beta cannot charge Alpha');
reset role;
select t045.act_as('a4000000-0000-4000-8000-000000000004');
select throws_ok($$ select public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'assistant') $$, 'PT403', null, 'an Alpha viewer cannot spend credits');
reset role;

select is(t045.balance('aaaaaaaa-0000-4000-8000-000000000000'), 500, 'Alpha starts with 500 credits');
select t045.act_as('a3000000-0000-4000-8000-000000000003');
insert into t045.r values ('designer-assistant', public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'assistant'));
reset role;
select is(t045.balance('aaaaaaaa-0000-4000-8000-000000000000'), 499, 'an assistant message costs exactly 1 credit');
select is((select count(*) from public.ai_credit_ledger where job_id = ((select j from t045.r where k = 'designer-assistant')->>'job_id')::uuid
           and reason = 'debit' and delta = -1), 1::bigint, 'one debit row of -1 for that job');
select results_eq($$ select status, kind, op, cost_credits, created_by from public.ai_jobs
                     where id = ((select j from t045.r where k = 'designer-assistant')->>'job_id')::uuid $$,
                  $$ values ('running'::text, 'command'::text, 'assistant'::text, 1, 'a3000000-0000-4000-8000-000000000003'::uuid) $$,
                  'one running assistant job, created by the caller');
select is(((select j from t045.r where k = 'designer-assistant')->>'balance')::int, 499, 'the call returns the balance after the charge');
select ok(length((select j from t045.r where k = 'designer-assistant')->>'finish_token') >= 32, 'the call returns a finish token');

select t045.act_as('a2000000-0000-4000-8000-000000000002');
select lives_ok($$ select public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'assistant') $$, 'an Alpha admin can start a call');
reset role;
select t045.act_as('a1000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'assistant') $$, 'the Alpha owner can start a call');
reset role;

-- ---------------------------------------------------------------------------
-- Costs per operation
-- ---------------------------------------------------------------------------
select t045.act_as('a3000000-0000-4000-8000-000000000003');
insert into t045.r values ('speech', public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'speech'));
insert into t045.r values ('reference', public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'reference'));
insert into t045.r values ('render', public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'render'));
insert into t045.r values ('live', public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'live'));
insert into t045.r values ('rules', public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'assistant_rules'));
reset role;
select results_eq($$ select j.op, j.kind, j.cost_credits, (select -sum(l.delta)::int from public.ai_credit_ledger l where l.job_id = j.id)
                     from public.ai_jobs j where j.id in (select (j->>'job_id')::uuid from t045.r where k in ('speech', 'reference', 'render', 'live'))
                     order by j.op $$,
                  $$ values ('live'::text, 'live'::text, 5, 5), ('reference', 'image', 3, 3), ('render', 'image', 10, 10), ('speech', 'audio', 1, 1) $$,
                  'each operation is charged its cost from the cost table');
select is((select count(*) from public.ai_credit_ledger where job_id = ((select j from t045.r where k = 'rules')->>'job_id')::uuid),
          0::bigint, 'a built-in rules answer writes a job but spends nothing');
select t045.act_as('a3000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.ai_start_call('aaaaaaaa-0000-4000-8000-000000000000', 'free_lunch') $$, '22023', null, 'an unknown operation is refused');
reset role;

-- ---------------------------------------------------------------------------
-- Not enough credits (Free studio)
-- ---------------------------------------------------------------------------
select t045.act_as('f7000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.ai_start_call('fa000000-0000-4000-8000-000000000000', 'assistant') $$, 'PT402', null, 'a Free studio with 0 credits cannot make a paid call');
select lives_ok($$ select public.ai_start_call('fa000000-0000-4000-8000-000000000000', 'assistant_rules') $$, 'a Free studio can still use the 0-credit rules answer');
reset role;
insert into public.ai_credit_ledger (org_id, delta, reason, note) values ('fa000000-0000-4000-8000-000000000000', 9, 'topup', 't045');
select t045.act_as('f7000000-0000-4000-8000-000000000001');
select throws_ok($$ select public.ai_start_call('fa000000-0000-4000-8000-000000000000', 'render') $$, 'PT402', null, 'a balance of cost − 1 is refused');
reset role;
insert into public.ai_credit_ledger (org_id, delta, reason, note) values ('fa000000-0000-4000-8000-000000000000', 1, 'topup', 't045');
select t045.act_as('f7000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.ai_start_call('fa000000-0000-4000-8000-000000000000', 'render') $$, 'a balance of exactly the cost is enough');
select throws_ok($$ select public.ai_start_call('fa000000-0000-4000-8000-000000000000', 'assistant') $$, 'PT402', null, '…and then the studio is empty');
reset role;
select is(t045.balance('fa000000-0000-4000-8000-000000000000'), 0, 'the balance ends at 0, never below');

-- ---------------------------------------------------------------------------
-- Finishing: success, failure with refund, and the token
-- ---------------------------------------------------------------------------
select t045.act_as('a3000000-0000-4000-8000-000000000003');
select is(public.ai_finish_call(((select j from t045.r where k = 'designer-assistant')->>'job_id')::uuid,
                                (select j from t045.r where k = 'designer-assistant')->>'finish_token', true, 'gemini'),
          'succeeded', 'finishing with the token marks the job succeeded');
select is(public.ai_finish_call(((select j from t045.r where k = 'render')->>'job_id')::uuid,
                                (select j from t045.r where k = 'render')->>'finish_token', false, 'gemini', 'provider timed out'),
          'failed', 'a provider failure marks the job failed');
reset role;
select is((select count(*) from public.ai_credit_ledger where job_id = ((select j from t045.r where k = 'designer-assistant')->>'job_id')::uuid and reason = 'refund'),
          0::bigint, 'a succeeded job is not refunded');
select is((select delta from public.ai_credit_ledger where job_id = ((select j from t045.r where k = 'render')->>'job_id')::uuid and reason = 'refund'),
          10, 'a failed render is refunded its 10 credits, on the same job');

create temp table t045_before as select count(*) as n from public.ai_credit_ledger;
grant select on t045_before to authenticated;
select t045.act_as('a3000000-0000-4000-8000-000000000003');
select throws_ok(format($$ select public.ai_finish_call(%L, 'not-the-token', false) $$, (select j from t045.r where k = 'speech')->>'job_id'),
                 'PT409', null, 'a wrong token cannot finish (or refund) a job');
select throws_ok(format($$ select public.ai_finish_call(%L, %L, false) $$, (select j from t045.r where k = 'designer-assistant')->>'job_id',
                        (select j from t045.r where k = 'designer-assistant')->>'finish_token'),
                 'PT409', null, 'a finished job cannot be finished again');
reset role;
select t045.act_as('a2000000-0000-4000-8000-000000000002');
select throws_ok(format($$ select public.ai_finish_call(%L, %L, false) $$, (select j from t045.r where k = 'speech')->>'job_id',
                        (select j from t045.r where k = 'speech')->>'finish_token'),
                 'PT409', null, 'another member cannot finish someone else''s job, even with its token');
reset role;
select is((select count(*) from public.ai_credit_ledger), (select n from t045_before), 'refused finishes write nothing');

-- ---------------------------------------------------------------------------
-- Stuck jobs are refunded by the next call for that studio
-- ---------------------------------------------------------------------------
insert into public.ai_jobs (id, org_id, kind, op, status, provider, cost_credits, created_by, created_at) values
  ('5ca1e000-0000-4000-8000-000000000016', 'bbbbbbbb-0000-4000-8000-000000000000', 'image', 'reference', 'running', 'gemini', 3, 'b1000000-0000-4000-8000-000000000001', now() - interval '16 minutes'),
  ('5ca1e000-0000-4000-8000-000000000014', 'bbbbbbbb-0000-4000-8000-000000000000', 'image', 'reference', 'running', 'gemini', 3, 'b1000000-0000-4000-8000-000000000001', now() - interval '14 minutes');
insert into public.ai_credit_ledger (org_id, delta, reason, job_id, note) values
  ('bbbbbbbb-0000-4000-8000-000000000000', -3, 'debit', '5ca1e000-0000-4000-8000-000000000016', 't045'),
  ('bbbbbbbb-0000-4000-8000-000000000000', -3, 'debit', '5ca1e000-0000-4000-8000-000000000014', 't045');
select t045.act_as('b1000000-0000-4000-8000-000000000001');
insert into t045.r values ('beta', public.ai_start_call('bbbbbbbb-0000-4000-8000-000000000000', 'assistant'));
reset role;
select is((select status from public.ai_jobs where id = '5ca1e000-0000-4000-8000-000000000016'), 'failed', 'a job running for 16 minutes is marked failed');
select is((select delta from public.ai_credit_ledger where job_id = '5ca1e000-0000-4000-8000-000000000016' and reason = 'refund'), 3, '…and refunded');
select is((select status from public.ai_jobs where id = '5ca1e000-0000-4000-8000-000000000014'), 'running', 'a job running for 14 minutes is left alone');

-- ---------------------------------------------------------------------------
-- Tenant isolation
-- ---------------------------------------------------------------------------
select t045.act_as('a3000000-0000-4000-8000-000000000003');
select throws_ok($$ select public.ai_start_call('bbbbbbbb-0000-4000-8000-000000000000', 'assistant') $$, 'PT403', null, 'an Alpha designer cannot charge Beta');
select throws_ok(format($$ select public.ai_finish_call(%L, %L, false) $$, (select j from t045.r where k = 'beta')->>'job_id',
                        (select j from t045.r where k = 'beta')->>'finish_token'),
                 'PT409', null, 'an Alpha designer cannot finish (or refund) a Beta job');
reset role;

select * from finish();
rollback;
