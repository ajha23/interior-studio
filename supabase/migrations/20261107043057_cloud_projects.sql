-- Spec 043: kitchens and homes are saved to the studio as full snapshots.
--
-- - project_versions.doc_type says what a scene is; every existing row is 'legacy_v1' (spec 044).
-- - public.create_project writes the project and version 1 in one transaction.
-- - public.save_project_version: idempotency key first, then a row lock and compare-and-swap on the
--   head, size and archived checks, and a scene hash computed here (never taken from the client).
-- - Rename, archive, unarchive and delete stay plain table writes decided by RLS. Column grants
--   stop anyone moving the head directly; triggers stamp the row and write the audit log.
-- - private.audit_log is append-only for every role; private.idempotency_keys records retries.
-- Public functions are SECURITY INVOKER wrappers over private SECURITY DEFINER bodies
-- (constitution XI, the 045 pattern); private is not exposed through the API.
-- Errors: PT401 not signed in, PT404 no such project here, 42501 not allowed, PT409 head moved
-- (detail: {"current_version_no": n}), PT413 scene over 2 000 000 bytes, PT423 archived,
-- 22023 bad argument. Rollback: docs/operations/rollback-043.md.

-- ---------------------------------------------------------------------------
-- Document type and the restore kind
-- ---------------------------------------------------------------------------
create type public.doc_type as enum ('kitchen', 'home', 'legacy_v1');
alter type public.version_kind add value if not exists 'restore';

alter table public.project_versions add column doc_type public.doc_type;
update public.project_versions set doc_type = 'legacy_v1';
alter table public.project_versions alter column doc_type set not null;

-- ---------------------------------------------------------------------------
-- Idempotency keys: one result per (studio, user, operation, key)
-- ---------------------------------------------------------------------------
create table private.idempotency_keys (
  org_id     uuid not null references public.organizations (id) on delete cascade,
  actor_id   uuid not null,
  op         text not null check (op in ('save_version', 'create_project')),
  key        uuid not null,
  project_id uuid,
  version_id uuid,
  created_at timestamptz not null default now(),
  primary key (org_id, actor_id, op, key)
);
revoke all on private.idempotency_keys from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Audit log: append-only for every role, including the owner
-- ---------------------------------------------------------------------------
create table private.audit_log (
  id        bigint generated always as identity primary key,
  org_id    uuid not null,            -- no foreign key: rows outlive a deleted project or studio
  actor_id  uuid,
  family    text not null check (family in ('auth', 'members', 'clients', 'quotes', 'versions', 'production', 'commercial', 'share_links')),
  action    text not null,
  target_id uuid,
  detail    jsonb not null default '{}'::jsonb,
  at        timestamptz not null default now()
);
create index audit_log_org_at_idx on private.audit_log (org_id, at desc);
revoke all on private.audit_log from public, anon, authenticated;

create function private.audit_log_append_only()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only' using errcode = 'PT403';
end
$$;
create trigger audit_log_no_change before update or delete on private.audit_log
  for each row execute function private.audit_log_append_only();
create trigger audit_log_no_truncate before truncate on private.audit_log
  for each statement execute function private.audit_log_append_only();

create function private.audit(p_org uuid, p_action text, p_target uuid, p_detail jsonb default '{}'::jsonb)
returns void
language sql
set search_path = ''
as $$
  insert into private.audit_log (org_id, actor_id, family, action, target_id, detail)
  values (p_org, auth.uid(), 'versions', p_action, p_target, coalesce(p_detail, '{}'::jsonb))
$$;

revoke all on function private.audit_log_append_only() from public, anon, authenticated;
revoke all on function private.audit(uuid, text, uuid, jsonb) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Create a project with its first version
-- ---------------------------------------------------------------------------
create function private.create_project(
  p_org uuid, p_name text, p_client_name text, p_doc_type public.doc_type,
  p_scene jsonb, p_schema_version integer, p_idempotency_key uuid
)
returns table (id uuid, org_id uuid, name text, client_name text, current_version_no integer,
               created_by uuid, created_at timestamptz, updated_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user  uuid := auth.uid();
  v_name  text := btrim(coalesce(p_name, ''));
  v_id    uuid;
  v_done  uuid;
  v_scene jsonb;
  v_ver   uuid;
begin
  if v_user is null then
    raise exception 'Sign in to save projects.' using errcode = 'PT401';
  end if;
  if not private.can_edit_org(p_org) then
    raise exception 'You cannot create projects in this studio.' using errcode = '42501';
  end if;

  insert into private.idempotency_keys (org_id, actor_id, op, key)
  values (p_org, v_user, 'create_project', p_idempotency_key)
  on conflict do nothing;
  if not found then
    -- A retry: the first call's project, unchanged.
    select k.project_id into v_done from private.idempotency_keys k
    where k.org_id = p_org and k.actor_id = v_user and k.op = 'create_project' and k.key = p_idempotency_key;
    return query
      select p.id, p.org_id, p.name, p.client_name, p.current_version_no, p.created_by, p.created_at, p.updated_at
      from public.projects p where p.id = v_done;
    return;
  end if;

  if p_doc_type is null or p_doc_type = 'legacy_v1' then
    raise exception 'A project is a kitchen or a home.' using errcode = '22023';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 160 then
    raise exception 'Give the project a name of 1 to 160 characters.' using errcode = '22023';
  end if;
  if p_scene is null or jsonb_typeof(p_scene) <> 'object' then
    raise exception 'The design is missing.' using errcode = '22023';
  end if;
  if octet_length(p_scene::text) > 2000000 then
    raise exception 'This design is larger than 2 MB and cannot be saved.' using errcode = 'PT413';
  end if;

  v_id := gen_random_uuid();
  v_scene := jsonb_set(p_scene, '{id}', to_jsonb(v_id::text));

  insert into public.projects (id, org_id, name, client_name, created_by, updated_by)
  values (v_id, p_org, v_name, btrim(coalesce(p_client_name, '')), v_user, v_user);

  insert into public.project_versions (project_id, org_id, version_no, kind, message, doc_type, schema_version, scene, scene_hash, created_by)
  values (v_id, p_org, 1, 'manual', 'Created', p_doc_type, p_schema_version, v_scene,
          encode(extensions.digest(convert_to(v_scene::text, 'UTF8'), 'sha256'), 'hex'), v_user)
  returning project_versions.id into v_ver;

  update public.projects p set current_version_id = v_ver, current_version_no = 1 where p.id = v_id;
  update private.idempotency_keys k set project_id = v_id, version_id = v_ver
  where k.org_id = p_org and k.actor_id = v_user and k.op = 'create_project' and k.key = p_idempotency_key;

  perform private.audit(p_org, 'project.create', v_id, jsonb_build_object('name', v_name, 'doc_type', p_doc_type));

  return query
    select p.id, p.org_id, p.name, p.client_name, p.current_version_no, p.created_by, p.created_at, p.updated_at
    from public.projects p where p.id = v_id;
end
$$;

-- ---------------------------------------------------------------------------
-- Save a version: idempotency → lock → checks → compare-and-swap → insert
-- ---------------------------------------------------------------------------
create function private.save_project_version(
  p_project uuid, p_expected_version_no integer, p_idempotency_key uuid,
  p_doc_type public.doc_type, p_scene jsonb, p_schema_version integer,
  p_kind public.version_kind, p_message text
)
returns table (id uuid, project_id uuid, version_no integer, kind public.version_kind, message text,
               scene_hash text, size_bytes integer, created_by uuid, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_proj public.projects%rowtype;
  v_done uuid;
  v_ver  uuid;
  v_no   integer;
begin
  if v_user is null then
    raise exception 'Sign in to save projects.' using errcode = 'PT401';
  end if;

  select * into v_proj from public.projects p where p.id = p_project;
  if not found or not private.is_org_member(v_proj.org_id) then
    raise exception 'This project is not in your studio.' using errcode = 'PT404';
  end if;
  if not private.can_edit_org(v_proj.org_id) then
    raise exception 'View only: ask a studio owner for edit access.' using errcode = '42501';
  end if;

  -- The key comes first: a retry after a lost response returns the original version, even though
  -- the head has moved on since. Concurrent calls with one key wait here on the primary key.
  insert into private.idempotency_keys (org_id, actor_id, op, key, project_id)
  values (v_proj.org_id, v_user, 'save_version', p_idempotency_key, p_project)
  on conflict do nothing;
  if not found then
    select k.version_id into v_done from private.idempotency_keys k
    where k.org_id = v_proj.org_id and k.actor_id = v_user and k.op = 'save_version' and k.key = p_idempotency_key;
    return query
      select v.id, v.project_id, v.version_no, v.kind, v.message, v.scene_hash, v.size_bytes, v.created_by, v.created_at
      from public.project_versions v where v.id = v_done;
    return;
  end if;

  select * into v_proj from public.projects p where p.id = p_project for update;

  if v_proj.archived_at is not null then
    raise exception 'This project was archived. Your changes are kept on this device.' using errcode = 'PT423';
  end if;
  if p_kind is null or p_kind::text not in ('autosave', 'manual', 'restore') then
    raise exception 'A version is an autosave, a manual save or a restore.' using errcode = '22023';
  end if;
  if p_doc_type is null or p_doc_type = 'legacy_v1' then
    raise exception 'A project is a kitchen or a home.' using errcode = '22023';
  end if;
  if p_scene is null or jsonb_typeof(p_scene) <> 'object' then
    raise exception 'The design is missing.' using errcode = '22023';
  end if;
  if octet_length(p_scene::text) > 2000000 then
    raise exception 'This design is larger than 2 MB and cannot be saved.' using errcode = 'PT413';
  end if;
  if (p_scene ->> 'id') is distinct from p_project::text then
    raise exception 'This design belongs to another project.' using errcode = '22023';
  end if;
  if v_proj.current_version_no <> p_expected_version_no then
    raise exception 'Someone else saved this project.' using errcode = 'PT409',
      detail = jsonb_build_object('current_version_no', v_proj.current_version_no)::text;
  end if;

  v_no := v_proj.current_version_no + 1;
  insert into public.project_versions (project_id, org_id, version_no, kind, message, doc_type, schema_version, scene, scene_hash, created_by)
  values (p_project, v_proj.org_id, v_no, p_kind, left(btrim(coalesce(p_message, '')), 500), p_doc_type, p_schema_version, p_scene,
          encode(extensions.digest(convert_to(p_scene::text, 'UTF8'), 'sha256'), 'hex'), v_user)
  returning project_versions.id into v_ver;

  update public.projects p set current_version_id = v_ver, current_version_no = v_no where p.id = p_project;
  update private.idempotency_keys k set version_id = v_ver
  where k.org_id = v_proj.org_id and k.actor_id = v_user and k.op = 'save_version' and k.key = p_idempotency_key;

  perform private.audit(v_proj.org_id, 'version.save', p_project, jsonb_build_object('version_no', v_no, 'kind', p_kind));

  return query
    select v.id, v.project_id, v.version_no, v.kind, v.message, v.scene_hash, v.size_bytes, v.created_by, v.created_at
    from public.project_versions v where v.id = v_ver;
end
$$;

-- ---------------------------------------------------------------------------
-- Public invoker wrappers (the API surface); the old save function goes
-- ---------------------------------------------------------------------------
drop function public.save_project_version(uuid, jsonb, integer, text, public.version_kind, text);

create function public.create_project(
  p_org uuid, p_name text, p_doc_type public.doc_type, p_scene jsonb, p_schema_version integer,
  p_idempotency_key uuid, p_client_name text default ''
)
returns table (id uuid, org_id uuid, name text, client_name text, current_version_no integer,
               created_by uuid, created_at timestamptz, updated_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from private.create_project(p_org, p_name, p_client_name, p_doc_type, p_scene, p_schema_version, p_idempotency_key) $$;

create function public.save_project_version(
  p_project uuid, p_expected_version_no integer, p_idempotency_key uuid,
  p_doc_type public.doc_type, p_scene jsonb, p_schema_version integer,
  p_kind public.version_kind default 'autosave', p_message text default ''
)
returns table (id uuid, project_id uuid, version_no integer, kind public.version_kind, message text,
               scene_hash text, size_bytes integer, created_by uuid, created_at timestamptz)
language sql
security invoker
set search_path = ''
as $$ select * from private.save_project_version(p_project, p_expected_version_no, p_idempotency_key, p_doc_type, p_scene, p_schema_version, p_kind, p_message) $$;

-- An invoker wrapper runs with the caller's privileges, so authenticated may execute the bodies too;
-- they are unreachable through the API because the private schema is not exposed.
revoke all on function private.create_project(uuid, text, text, public.doc_type, jsonb, integer, uuid) from public, anon;
revoke all on function private.save_project_version(uuid, integer, uuid, public.doc_type, jsonb, integer, public.version_kind, text) from public, anon;
revoke all on function public.create_project(uuid, text, public.doc_type, jsonb, integer, uuid, text) from public, anon;
revoke all on function public.save_project_version(uuid, integer, uuid, public.doc_type, jsonb, integer, public.version_kind, text) from public, anon;
grant execute on function private.create_project(uuid, text, text, public.doc_type, jsonb, integer, uuid) to authenticated;
grant execute on function private.save_project_version(uuid, integer, uuid, public.doc_type, jsonb, integer, public.version_kind, text) to authenticated;
grant execute on function public.create_project(uuid, text, public.doc_type, jsonb, integer, uuid, text) to authenticated;
grant execute on function public.save_project_version(uuid, integer, uuid, public.doc_type, jsonb, integer, public.version_kind, text) to authenticated;

-- ---------------------------------------------------------------------------
-- projects: one creation path; only these columns may change directly
-- ---------------------------------------------------------------------------
revoke insert, update on public.projects from anon, authenticated;
grant update (name, client_name, site_address, status, archived_at) on public.projects to authenticated;

drop policy projects_update on public.projects;
create policy projects_update on public.projects for update
  using (private.can_edit_org(org_id)) with check (private.can_edit_org(org_id));
drop policy projects_delete on public.projects;
create policy projects_delete on public.projects for delete
  using (private.can_admin_org(org_id) and archived_at is not null);

-- Stamp who changed it and when; archive time is the server's.
create function private.projects_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  if old.archived_at is null and new.archived_at is not null then
    new.archived_at := now();
  elsif old.archived_at is not null and new.archived_at is not null then
    new.archived_at := old.archived_at;
  end if;
  return new;
end
$$;
create trigger projects_stamp before update on public.projects
  for each row execute function private.projects_stamp();

-- One audit row per rename, archive, unarchive, other edit and delete. Saves are audited by the
-- save function, so an update that only moves the head is skipped here.
create function private.projects_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.audit(old.org_id, 'project.delete', old.id, jsonb_build_object('name', old.name));
    return old;
  end if;
  if new.name is distinct from old.name then
    perform private.audit(new.org_id, 'project.rename', new.id, jsonb_build_object('from', old.name, 'to', new.name));
  elsif old.archived_at is null and new.archived_at is not null then
    perform private.audit(new.org_id, 'project.archive', new.id, jsonb_build_object('name', new.name));
  elsif old.archived_at is not null and new.archived_at is null then
    perform private.audit(new.org_id, 'project.unarchive', new.id, jsonb_build_object('name', new.name));
  elsif (new.client_name, new.site_address, new.status) is distinct from (old.client_name, old.site_address, old.status) then
    perform private.audit(new.org_id, 'project.update', new.id, '{}'::jsonb);
  end if;
  return new;
end
$$;
create trigger projects_audit after update or delete on public.projects
  for each row execute function private.projects_audit();

revoke all on function private.projects_stamp() from public, anon, authenticated;
revoke all on function private.projects_audit() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Housekeeping: keys older than 7 days may go (not scheduled yet)
-- ---------------------------------------------------------------------------
create function private.purge_idempotency_keys()
returns integer
language sql
set search_path = ''
as $$
  with gone as (delete from private.idempotency_keys k where k.created_at < now() - interval '7 days' returning 1)
  select count(*)::integer from gone
$$;
revoke all on function private.purge_idempotency_keys() from public, anon, authenticated;
