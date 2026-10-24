create or replace function public.accept_pending_invites()
returns int language plpgsql security definer set search_path = public, extensions as $$
declare v_email extensions.citext; v_count int := 0; r record;
begin
  select email into v_email from auth.users where id = auth.uid();
  if v_email is null then return 0; end if;
  insert into public.profiles (id, email) values (auth.uid(), v_email) on conflict (id) do nothing;
  for r in select * from public.org_invites where email = v_email and accepted_at is null loop
    insert into public.org_members (org_id, user_id, role) values (r.org_id, auth.uid(), r.role)
      on conflict (org_id, user_id) do update set role = excluded.role;
    update public.org_invites set accepted_at = now() where id = r.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke all on function public.accept_pending_invites() from public, anon;
grant execute on function public.accept_pending_invites() to authenticated;

alter function private.handle_new_user() set search_path = public, extensions;

-- In-house organization and its owner invite
with o as (
  insert into public.organizations (name, slug) values ('Interior Studio', 'interior-studio') returning id
)
insert into public.org_invites (org_id, email, role) select id, 'akhilesh.jha.445@gmail.com', 'owner' from o;
