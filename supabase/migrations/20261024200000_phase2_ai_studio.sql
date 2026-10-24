-- Phase 2.5–2.6: AI studio jobs and a monthly credit pool per studio.

create table public.ai_settings (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  monthly_credits int not null default 500 check (monthly_credits between 0 and 100000),
  updated_at timestamptz not null default now()
);
alter table public.ai_settings enable row level security;
create policy ai_settings_select on public.ai_settings for select to authenticated using (private.is_org_member(org_id));
create policy ai_settings_upsert on public.ai_settings for insert to authenticated with check (private.can_admin_org(org_id));
create policy ai_settings_update on public.ai_settings for update to authenticated using (private.can_admin_org(org_id)) with check (private.can_admin_org(org_id));

create table public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  kind text not null check (kind in ('image', 'model')),
  op text not null,
  status text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  input jsonb not null default '{}'::jsonb,
  output_path text,
  render_id uuid references public.renders(id) on delete set null,
  provider text not null,
  cost_credits int not null default 0,
  error text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  finished_at timestamptz
);
create index ai_jobs_org_idx on public.ai_jobs (org_id, created_at desc);
alter table public.ai_jobs enable row level security;
-- Members read their studio's jobs; only the edge functions (service role) write them.
create policy ai_jobs_select on public.ai_jobs for select to authenticated using (private.is_org_member(org_id));

create table public.ai_credit_ledger (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.organizations(id) on delete cascade,
  delta int not null,
  reason text not null check (reason in ('monthly_grant', 'topup', 'debit', 'refund')),
  period text,
  job_id uuid references public.ai_jobs(id) on delete set null,
  note text not null default '',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create unique index ai_ledger_one_grant_per_month on public.ai_credit_ledger (org_id, period) where reason = 'monthly_grant';
create index ai_ledger_org_idx on public.ai_credit_ledger (org_id, created_at desc);
alter table public.ai_credit_ledger enable row level security;
create policy ai_ledger_select on public.ai_credit_ledger for select to authenticated using (private.is_org_member(org_id));
-- Admins may add credits; debits and refunds come only from the service role.
create policy ai_ledger_topup on public.ai_credit_ledger for insert to authenticated
  with check (private.can_admin_org(org_id) and reason = 'topup' and delta > 0 and delta <= 100000 and created_by = auth.uid());

-- Balance = sum of the ledger, after making sure this month's grant exists.
-- Monthly grants do not roll over: the grant tops the pool up to the allowance at most.
create or replace function private.ensure_monthly_grant(p_org uuid)
returns void language plpgsql security definer set search_path = public, private as $$
declare v_period text := to_char(now() at time zone 'Asia/Kolkata', 'YYYY-MM'); v_allow int; v_bal int;
begin
  if exists (select 1 from ai_credit_ledger where org_id = p_org and reason = 'monthly_grant' and period = v_period) then return; end if;
  select coalesce((select monthly_credits from ai_settings where org_id = p_org), 500) into v_allow;
  select coalesce(sum(delta), 0) into v_bal from ai_credit_ledger where org_id = p_org;
  insert into ai_credit_ledger (org_id, delta, reason, period, note)
  values (p_org, greatest(v_allow - greatest(v_bal, 0), 0), 'monthly_grant', v_period, 'Monthly allowance')
  on conflict do nothing;
end $$;
revoke all on function private.ensure_monthly_grant(uuid) from public, anon, authenticated;

create or replace function public.ai_credit_balance(p_org uuid)
returns int language plpgsql security definer set search_path = public, private as $$
begin
  if not private.is_org_member(p_org) then raise exception 'not allowed'; end if;
  perform private.ensure_monthly_grant(p_org);
  return (select coalesce(sum(delta), 0) from ai_credit_ledger where org_id = p_org);
end $$;
revoke all on function public.ai_credit_balance(uuid) from public, anon;
grant execute on function public.ai_credit_balance(uuid) to authenticated;

-- Atomic debit for edge functions: locks the studio's ledger, refuses if the pool is short.
create or replace function public.ai_debit(p_org uuid, p_cost int, p_job uuid, p_user uuid, p_note text)
returns int language plpgsql security definer set search_path = public, private as $$
declare v_bal int;
begin
  perform 1 from organizations where id = p_org for update;
  perform private.ensure_monthly_grant(p_org);
  select coalesce(sum(delta), 0) into v_bal from ai_credit_ledger where org_id = p_org;
  if v_bal < p_cost then raise exception 'insufficient_credits:%', v_bal; end if;
  insert into ai_credit_ledger (org_id, delta, reason, job_id, created_by, note) values (p_org, -p_cost, 'debit', p_job, p_user, coalesce(p_note, ''));
  return v_bal - p_cost;
end $$;
revoke all on function public.ai_debit(uuid, int, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.ai_debit(uuid, int, uuid, uuid, text) to service_role;

-- AI images join the project's render gallery.
alter table public.renders drop constraint renders_kind_check;
alter table public.renders add constraint renders_kind_check check (kind in ('still', 'panorama', 'ai'));

-- Sources and results for AI jobs (site photos, sketches, generated images and models).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('ai', 'ai', false, 62914560, array['image/png', 'image/jpeg', 'image/webp', 'model/gltf-binary', 'application/octet-stream'])
on conflict (id) do nothing;
create policy ai_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'ai' and private.is_org_member(((storage.foldername(name))[1])::uuid));
create policy ai_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'ai' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
