-- Spec 045: every AI call is charged in the database before the provider is called.
--
-- One transaction per charge (private.ai_start_call):
--   who is calling (auth.uid()) → member and not a viewer → per-studio row lock → refund stuck jobs
--   → monthly grant → cost from private.ai_costs → enough credits? → job + debit + finish token.
-- private.ai_finish_call marks the job succeeded, or failed and refunded, and needs the finish token
-- that only the server saw, so a user cannot refund a job while the provider is answering it.
-- Public functions are SECURITY INVOKER wrappers over private SECURITY DEFINER bodies
-- (constitution XI); private is not exposed through the API.
-- Errors use SQLSTATEs the server maps to HTTP: PT401, PT403, PT402, PT409, 22023.

-- ---------------------------------------------------------------------------
-- Cost table (FR-007; clarified costs, 2026-11-06)
-- ---------------------------------------------------------------------------
create table private.ai_costs (
  op      text primary key,
  kind    text not null,
  credits integer not null check (credits >= 0)
);
insert into private.ai_costs (op, kind, credits) values
  ('assistant',       'command', 1),
  ('assistant_rules', 'command', 0),
  ('speech',          'audio',   1),
  ('reference',       'image',   3),
  ('render',          'image',  10),
  ('live',            'live',    5);
revoke all on private.ai_costs from public, anon, authenticated;

-- Finish tokens: one per running job, never readable through the API.
create table private.ai_call_tokens (
  job_id uuid primary key references public.ai_jobs (id) on delete cascade,
  token  text not null
);
revoke all on private.ai_call_tokens from public, anon, authenticated;

-- New job kinds for speech and live voice.
alter table public.ai_jobs drop constraint ai_jobs_kind_check;
alter table public.ai_jobs add constraint ai_jobs_kind_check check (kind in ('image', 'model', 'command', 'audio', 'live'));

-- ---------------------------------------------------------------------------
-- Start a call: check, charge, record
-- ---------------------------------------------------------------------------
create function private.ai_start_call(p_org uuid, p_op text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_role  public.org_role;
  v_cost  private.ai_costs%rowtype;
  v_bal   integer;
  v_job   uuid;
  v_token text;
  v_stale record;
begin
  if v_user is null then
    raise exception 'Sign in to use AI.' using errcode = 'PT401';
  end if;

  select m.role into v_role from public.org_members m where m.org_id = p_org and m.user_id = v_user;
  if v_role is null then
    raise exception 'not a member of this studio' using errcode = 'PT403';
  end if;
  if v_role = 'viewer' then
    raise exception 'viewer' using errcode = 'PT403', hint = 'viewer';
  end if;

  select * into v_cost from private.ai_costs c where c.op = p_op;
  if not found then
    raise exception 'unknown AI operation: %', p_op using errcode = '22023';
  end if;

  -- Serialise every charge for this studio, so the balance read below is always current.
  perform 1 from public.organizations o where o.id = p_org for update;

  -- Jobs stuck for more than 15 minutes (the provider timed out after the function's limit): refund.
  for v_stale in
    select j.id, j.cost_credits from public.ai_jobs j
    where j.org_id = p_org and j.status = 'running' and j.created_at < pg_catalog.now() - interval '15 minutes'
    for update
  loop
    update public.ai_jobs set status = 'failed', error = 'timed out', finished_at = pg_catalog.now() where id = v_stale.id;
    if v_stale.cost_credits > 0 then
      insert into public.ai_credit_ledger (org_id, delta, reason, job_id, note)
      values (p_org, v_stale.cost_credits, 'refund', v_stale.id, 'Timed out');
    end if;
    delete from private.ai_call_tokens t where t.job_id = v_stale.id;
  end loop;

  perform private.ensure_monthly_grant(p_org);

  select coalesce(sum(l.delta), 0)::integer into v_bal from public.ai_credit_ledger l where l.org_id = p_org;
  if v_bal < v_cost.credits then
    raise exception 'not enough AI credits' using errcode = 'PT402', detail = pg_catalog.format('balance=%s cost=%s', v_bal, v_cost.credits);
  end if;

  insert into public.ai_jobs (org_id, kind, op, status, provider, cost_credits, created_by)
  values (p_org, v_cost.kind, v_cost.op, 'running', 'pending', v_cost.credits, v_user)
  returning id into v_job;

  if v_cost.credits > 0 then
    insert into public.ai_credit_ledger (org_id, delta, reason, job_id, created_by, note)
    values (p_org, -v_cost.credits, 'debit', v_job, v_user, v_cost.op);
  end if;

  v_token := pg_catalog.encode(extensions.gen_random_bytes(24), 'hex');
  insert into private.ai_call_tokens (job_id, token) values (v_job, v_token);

  return pg_catalog.jsonb_build_object('job_id', v_job, 'finish_token', v_token, 'balance', v_bal - v_cost.credits, 'cost', v_cost.credits);
end
$$;

-- ---------------------------------------------------------------------------
-- Finish a call: succeeded, or failed and refunded
-- ---------------------------------------------------------------------------
create function private.ai_finish_call(p_job uuid, p_finish_token text, p_ok boolean, p_provider text default null, p_error text default null)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_job  public.ai_jobs%rowtype;
begin
  select j.* into v_job from public.ai_jobs j
  where j.id = p_job and j.status = 'running' and j.created_by = v_user
    and exists (select 1 from private.ai_call_tokens t where t.job_id = j.id and t.token = p_finish_token)
  for update;
  if not found then
    raise exception 'this AI call cannot be finished' using errcode = 'PT409';
  end if;

  delete from private.ai_call_tokens t where t.job_id = p_job;

  if p_ok then
    update public.ai_jobs
    set status = 'succeeded', finished_at = pg_catalog.now(), provider = coalesce(p_provider, provider)
    where id = p_job;
    return 'succeeded';
  end if;

  update public.ai_jobs
  set status = 'failed', finished_at = pg_catalog.now(), provider = coalesce(p_provider, provider), error = pg_catalog.left(coalesce(p_error, 'failed'), 500)
  where id = p_job;
  if v_job.cost_credits > 0 then
    insert into public.ai_credit_ledger (org_id, delta, reason, job_id, created_by, note)
    values (v_job.org_id, v_job.cost_credits, 'refund', p_job, v_user, 'Provider failed');
  end if;
  return 'failed';
end
$$;

-- ---------------------------------------------------------------------------
-- Public invoker wrappers (the API surface)
-- ---------------------------------------------------------------------------
create function public.ai_start_call(p_org uuid, p_op text)
returns jsonb
language sql
security invoker
set search_path = ''
as $$ select private.ai_start_call(p_org, p_op) $$;

create function public.ai_finish_call(p_job uuid, p_finish_token text, p_ok boolean, p_provider text default null, p_error text default null)
returns text
language sql
security invoker
set search_path = ''
as $$ select private.ai_finish_call(p_job, p_finish_token, p_ok, p_provider, p_error) $$;

-- An invoker wrapper runs with the caller's privileges, so authenticated may execute the bodies too;
-- they are unreachable through the API because the private schema is not exposed.
revoke all on function private.ai_start_call(uuid, text) from public, anon;
revoke all on function private.ai_finish_call(uuid, text, boolean, text, text) from public, anon;
revoke all on function public.ai_start_call(uuid, text) from public, anon;
revoke all on function public.ai_finish_call(uuid, text, boolean, text, text) from public, anon;
grant execute on function private.ai_start_call(uuid, text) to authenticated;
grant execute on function private.ai_finish_call(uuid, text, boolean, text, text) to authenticated;
grant execute on function public.ai_start_call(uuid, text) to authenticated;
grant execute on function public.ai_finish_call(uuid, text, boolean, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Replace the old debit (caller-supplied user and cost, service_role only, unused)
-- ---------------------------------------------------------------------------
drop function public.ai_debit(uuid, integer, uuid, uuid, text);

-- ---------------------------------------------------------------------------
-- ai_credit_balance: same behaviour, search_path = '' and qualified names
-- ---------------------------------------------------------------------------
create or replace function public.ai_credit_balance(p_org uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_org_member(p_org) then
    raise exception 'not allowed';
  end if;
  perform private.ensure_monthly_grant(p_org);
  return (select coalesce(sum(l.delta), 0)::integer from public.ai_credit_ledger l where l.org_id = p_org);
end
$$;
revoke all on function public.ai_credit_balance(uuid) from public, anon;
grant execute on function public.ai_credit_balance(uuid) to authenticated;
