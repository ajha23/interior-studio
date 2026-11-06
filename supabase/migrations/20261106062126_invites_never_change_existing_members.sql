-- Spec 042, FR-015. Exposed by supabase/tests/05_invites.test.sql (6 of 12 failing on the 041 baseline):
--   1. An admin could invite someone who was already a member, including the owner, and the invite
--      overwrote their role on next sign-in (on conflict … do update set role = excluded.role).
--      That let an admin demote the owner, getting round "admins never touch owners".
--   2. accept_pending_invites trusted any auth.users.email, confirmed or not, so an unconfirmed
--      sign-up with an invited address could claim that seat.
-- Fix: refuse invites for existing members; accept only for confirmed emails; never re-role a member.
--
-- Email comparisons use lower(…) explicitly. The columns are citext, but with search_path = '' the
-- citext `=` operator (in schema extensions) is not found and Postgres silently falls back to the
-- case-sensitive text `=`, which let 'OWNER.A@…' slip past 'owner.a@…' (caught by 05_invites test 2).

-- 1. Refuse an invite for someone who is already a member of that studio.
--    Security invoker: runs as the inviting admin under row-level security, which lets them see their
--    studio's memberships and their co-members' profiles.
create or replace function private.reject_invite_for_member()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.org_members m
    join public.profiles p on p.id = m.user_id
    where m.org_id = new.org_id and lower(p.email::text) = lower(new.email::text)
  ) then
    raise exception 'already a member'
      using errcode = '23505', hint = 'Change their role in Settings → Members instead.';
  end if;
  return new;
end
$$;

drop trigger if exists org_invites_reject_member on public.org_invites;
create trigger org_invites_reject_member
  before insert on public.org_invites
  for each row execute function private.reject_invite_for_member();

-- 2. Accept invites only for a confirmed email, and never change an existing member's role.
--    Same signature and return value (number of invites accepted) as the live function; it now meets
--    constitution principle XI: search_path = '', schema-qualified names, explicit grants.
create or replace function public.accept_pending_invites()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email extensions.citext;
  v_confirmed timestamptz;
  v_count integer := 0;
  r record;
begin
  select u.email, u.email_confirmed_at into v_email, v_confirmed
  from auth.users u
  where u.id = auth.uid();

  -- Unknown user, or an address nobody has proven they own: accept nothing.
  if v_email is null or v_confirmed is null then
    return 0;
  end if;

  insert into public.profiles (id, email) values (auth.uid(), v_email)
  on conflict (id) do nothing;

  for r in
    select i.id, i.org_id, i.role
    from public.org_invites i
    where lower(i.email::text) = lower(v_email::text) and i.accepted_at is null
  loop
    -- An existing membership is left exactly as it is: roles change only in Settings → Members.
    insert into public.org_members (org_id, user_id, role)
    values (r.org_id, auth.uid(), r.role)
    on conflict (org_id, user_id) do nothing;
    update public.org_invites set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end
$$;

revoke all on function public.accept_pending_invites() from public, anon;
grant execute on function public.accept_pending_invites() to authenticated;
