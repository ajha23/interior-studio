-- Spec 042, User Story 5 (FR-017–FR-021), founder decision 2026-11-06: sign-in must not depend on an
-- invite. Every confirmed new user gets one Free studio; Free studios have 0 AI credits; studios cannot
-- change their own credits; only an operator function grants them. Tests: supabase/tests/06_self_serve.
-- All functions use search_path = '' with schema-qualified names (constitution XI); emails and slugs are
-- compared with lower() because citext's = is not visible with an empty search path (research R9).

-- FR-018: when a studio was last used, for the 90-day rule in spec 056.
alter table public.organizations
  add column if not exists last_active_at timestamptz not null default now();

-- FR-019: new studios get no AI allowance unless the operator sets one.
alter table public.ai_settings alter column monthly_credits set default 0;

-- FR-019: the monthly grant falls back to 0 for Free studios; other plans keep the 500 fallback,
-- so the existing in-house studio is unchanged. Same signature and behaviour otherwise.
create or replace function private.ensure_monthly_grant(p_org uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_period text := pg_catalog.to_char(pg_catalog.now() at time zone 'Asia/Kolkata', 'YYYY-MM');
  v_allow integer;
  v_bal integer;
begin
  if exists (
    select 1 from public.ai_credit_ledger l
    where l.org_id = p_org and l.reason = 'monthly_grant' and l.period = v_period
  ) then
    return;
  end if;

  select coalesce(
           (select s.monthly_credits from public.ai_settings s where s.org_id = p_org),
           case when (select o.plan from public.organizations o where o.id = p_org) = 'free' then 0 else 500 end
         )
    into v_allow;
  select coalesce(sum(l.delta), 0) into v_bal from public.ai_credit_ledger l where l.org_id = p_org;

  insert into public.ai_credit_ledger (org_id, delta, reason, period, note)
  values (p_org, greatest(v_allow - greatest(v_bal, 0), 0), 'monthly_grant', v_period, 'Monthly allowance')
  on conflict do nothing;
end
$$;

-- FR-020: studios cannot change their own AI credits. Members can still read their allowance and
-- balance (ai_settings_select, ai_ledger_select stay). Debits and grants happen in definer functions.
drop policy if exists ai_settings_upsert on public.ai_settings;
drop policy if exists ai_settings_update on public.ai_settings;
drop policy if exists ai_ledger_topup on public.ai_credit_ledger;

-- FR-021: the founder grants credits per studio from the Supabase SQL editor (runs as postgres).
-- Sets the monthly allowance (applies from the next monthly grant) and optionally adds a one-off
-- top-up now. See docs/operations/ai-credits.md.
create or replace function private.set_ai_credits(
  p_studio_slug text,
  p_monthly_credits integer,
  p_top_up integer default 0,
  p_note text default ''
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org uuid;
begin
  select o.id into v_org from public.organizations o where lower(o.slug::text) = lower(p_studio_slug);
  if v_org is null then
    raise exception 'No studio with slug "%"', p_studio_slug;
  end if;
  if p_monthly_credits < 0 or p_monthly_credits > 100000 then
    raise exception 'Monthly credits must be between 0 and 100000 (got %)', p_monthly_credits;
  end if;
  if p_top_up < 0 or p_top_up > 100000 then
    raise exception 'A top-up must be between 0 and 100000 (got %)', p_top_up;
  end if;

  insert into public.ai_settings (org_id, monthly_credits, updated_at)
  values (v_org, p_monthly_credits, pg_catalog.now())
  on conflict (org_id) do update set monthly_credits = excluded.monthly_credits, updated_at = excluded.updated_at;

  if p_top_up > 0 then
    insert into public.ai_credit_ledger (org_id, delta, reason, note)
    values (v_org, p_top_up, 'topup', coalesce(nullif(p_note, ''), 'Operator top-up'));
  end if;
end
$$;

revoke all on function private.set_ai_credits(text, integer, integer, text) from public, anon, authenticated;

-- FR-017: called by the app after every sign-in. For a confirmed email it accepts pending invites
-- (FR-015 rules); if the user still has no studio, it creates one Free studio with them as owner;
-- then it records activity on all their studios. Returns the number of invites accepted.
create or replace function public.start_session()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_email text;
  v_confirmed timestamptz;
  v_display text;
  v_name text;
  v_base text;
  v_org uuid;
  v_accepted integer := 0;
begin
  if v_uid is null then
    return 0;
  end if;

  select u.email::text, u.email_confirmed_at,
         coalesce(nullif(u.raw_user_meta_data ->> 'full_name', ''), nullif(u.raw_user_meta_data ->> 'name', ''))
    into v_email, v_confirmed, v_display
  from auth.users u
  where u.id = v_uid;

  -- Unknown user, or an address nobody has proven they own: no invites, no studio.
  if v_email is null or v_confirmed is null then
    return 0;
  end if;

  -- One studio per user even when two tabs sign in at once.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('start_session:' || v_uid::text, 0));

  v_accepted := public.accept_pending_invites();

  if not exists (select 1 from public.org_members m where m.user_id = v_uid) then
    v_name := pg_catalog.split_part(pg_catalog.btrim(coalesce(v_display, pg_catalog.split_part(v_email, '@', 1))), ' ', 1);
    if pg_catalog.length(v_name) < 1 then
      v_name := 'My';
    end if;
    v_name := pg_catalog.left(v_name, 100) || '''s studio';

    v_base := pg_catalog.btrim(pg_catalog.regexp_replace(pg_catalog.lower(v_name), '[^a-z0-9]+', '-', 'g'), '-');
    v_base := pg_catalog.left(v_base, 40);
    if pg_catalog.length(v_base) < 2 then
      v_base := 'studio';
    end if;

    -- A short random suffix keeps slugs unique; retry on the rare collision.
    loop
      begin
        insert into public.organizations (name, slug, plan)
        values (v_name, v_base || '-' || pg_catalog.substr(pg_catalog.md5(pg_catalog.random()::text || pg_catalog.clock_timestamp()::text), 1, 6), 'free')
        returning id into v_org;
        exit;
      exception when unique_violation then
        -- try another suffix
      end;
    end loop;

    insert into public.org_members (org_id, user_id, role) values (v_org, v_uid, 'owner');
  end if;

  update public.organizations o
  set last_active_at = pg_catalog.now()
  where o.id in (select m.org_id from public.org_members m where m.user_id = v_uid)
    and o.last_active_at < pg_catalog.now() - interval '1 minute';

  return v_accepted;
end
$$;

revoke all on function public.start_session() from public, anon;
grant execute on function public.start_session() to authenticated;
