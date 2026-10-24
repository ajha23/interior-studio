-- Move RLS helpers out of the exposed API schema; restrict who can execute what.
create schema if not exists private;
grant usage on schema private to authenticated;

alter function public.org_role_of(uuid) set schema private;
alter function public.is_org_member(uuid) set schema private;
alter function public.can_edit_org(uuid) set schema private;
alter function public.can_admin_org(uuid) set schema private;
alter function public.handle_new_user() set schema private;

create or replace function private.can_edit_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public, private as $$
  select coalesce(private.org_role_of(p_org) in ('owner','admin','designer'), false)
$$;
create or replace function private.can_admin_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public, private as $$
  select coalesce(private.org_role_of(p_org) in ('owner','admin'), false)
$$;

revoke all on function private.org_role_of(uuid), private.is_org_member(uuid), private.can_edit_org(uuid), private.can_admin_org(uuid) from public, anon;
grant execute on function private.org_role_of(uuid), private.is_org_member(uuid), private.can_edit_org(uuid), private.can_admin_org(uuid) to authenticated;
revoke all on function private.handle_new_user() from public, anon, authenticated;

create or replace function public.save_project_version(
  p_project uuid, p_scene jsonb, p_schema_version int, p_scene_hash text,
  p_kind public.version_kind default 'autosave', p_message text default ''
) returns public.project_versions language plpgsql security definer set search_path = public, private as $$
declare v_proj public.projects; v_row public.project_versions;
begin
  select * into v_proj from public.projects where id = p_project for update;
  if v_proj.id is null then raise exception 'project not found'; end if;
  if not private.can_edit_org(v_proj.org_id) then raise exception 'not allowed'; end if;
  insert into public.project_versions (project_id, org_id, version_no, kind, message, schema_version, scene, scene_hash, created_by)
  values (p_project, v_proj.org_id, v_proj.current_version_no + 1, p_kind, coalesce(p_message,''), p_schema_version, p_scene, p_scene_hash, auth.uid())
  returning * into v_row;
  update public.projects set current_version_id = v_row.id, current_version_no = v_row.version_no,
    updated_at = now(), updated_by = auth.uid() where id = p_project;
  return v_row;
end $$;

revoke all on function public.save_project_version(uuid, jsonb, int, text, public.version_kind, text) from public, anon;
grant execute on function public.save_project_version(uuid, jsonb, int, text, public.version_kind, text) to authenticated;
revoke all on function public.accept_pending_invites() from public, anon;
grant execute on function public.accept_pending_invites() to authenticated;

create schema if not exists extensions;
alter extension citext set schema extensions;
