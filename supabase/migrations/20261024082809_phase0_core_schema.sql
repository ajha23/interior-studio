-- Phase 0: tenancy, members, invites, projects, immutable scene versions, RLS.
create extension if not exists citext;

create type public.org_role as enum ('owner','admin','designer','viewer');
create type public.project_status as enum ('lead','design','approved','production','installed','archived');
create type public.version_kind as enum ('autosave','manual','revision');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 120),
  slug citext not null unique check (slug ~ '^[a-z0-9-]{2,60}$'),
  plan text not null default 'inhouse',
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email citext not null,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.org_role not null default 'designer',
  created_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members(user_id);

create table public.org_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  email citext not null,
  role public.org_role not null default 'designer',
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (org_id, email)
);
create index org_invites_email_idx on public.org_invites(email) where accepted_at is null;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 160),
  client_name text not null default '',
  site_address text not null default '',
  status public.project_status not null default 'design',
  current_version_id uuid,
  current_version_no int not null default 0,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index projects_org_updated_idx on public.projects(org_id, updated_at desc);

create table public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  version_no int not null,
  kind public.version_kind not null default 'autosave',
  message text not null default '',
  schema_version int not null,
  scene jsonb not null,
  scene_hash text not null,
  size_bytes int generated always as (octet_length(scene::text)) stored,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, version_no),
  check (octet_length(scene::text) < 5000000)
);
create index project_versions_project_idx on public.project_versions(project_id, version_no desc);

alter table public.projects
  add constraint projects_current_version_fk foreign key (current_version_id)
  references public.project_versions(id) on delete set null;

create or replace function public.org_role_of(p_org uuid)
returns public.org_role language sql stable security definer set search_path = public as $$
  select role from public.org_members where org_id = p_org and user_id = auth.uid()
$$;

create or replace function public.is_org_member(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.org_members where org_id = p_org and user_id = auth.uid())
$$;

create or replace function public.can_edit_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.org_role_of(p_org) in ('owner','admin','designer'), false)
$$;

create or replace function public.can_admin_org(p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.org_role_of(p_org) in ('owner','admin'), false)
$$;

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (new.id, new.email,
          coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
          new.raw_user_meta_data->>'avatar_url')
  on conflict (id) do update set email = excluded.email;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.accept_pending_invites()
returns int language plpgsql security definer set search_path = public as $$
declare v_email citext; v_count int := 0; r record;
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

create or replace function public.save_project_version(
  p_project uuid, p_scene jsonb, p_schema_version int, p_scene_hash text,
  p_kind public.version_kind default 'autosave', p_message text default ''
) returns public.project_versions language plpgsql security definer set search_path = public as $$
declare v_proj public.projects; v_row public.project_versions;
begin
  select * into v_proj from public.projects where id = p_project for update;
  if v_proj.id is null then raise exception 'project not found'; end if;
  if not public.can_edit_org(v_proj.org_id) then raise exception 'not allowed'; end if;
  insert into public.project_versions (project_id, org_id, version_no, kind, message, schema_version, scene, scene_hash, created_by)
  values (p_project, v_proj.org_id, v_proj.current_version_no + 1, p_kind, coalesce(p_message,''), p_schema_version, p_scene, p_scene_hash, auth.uid())
  returning * into v_row;
  update public.projects set current_version_id = v_row.id, current_version_no = v_row.version_no,
    updated_at = now(), updated_by = auth.uid() where id = p_project;
  return v_row;
end $$;

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.org_members enable row level security;
alter table public.org_invites enable row level security;
alter table public.projects enable row level security;
alter table public.project_versions enable row level security;

create policy org_select on public.organizations for select using (public.is_org_member(id));
create policy org_update on public.organizations for update using (public.can_admin_org(id));

create policy profiles_select on public.profiles for select using (
  id = auth.uid() or exists (
    select 1 from public.org_members m1 join public.org_members m2 on m1.org_id = m2.org_id
    where m1.user_id = auth.uid() and m2.user_id = profiles.id));
create policy profiles_update on public.profiles for update using (id = auth.uid());

create policy members_select on public.org_members for select using (public.is_org_member(org_id));
create policy members_update on public.org_members for update using (public.can_admin_org(org_id) and role <> 'owner');
create policy members_delete on public.org_members for delete using (public.can_admin_org(org_id) and role <> 'owner');

create policy invites_select on public.org_invites for select using (public.can_admin_org(org_id));
create policy invites_insert on public.org_invites for insert with check (public.can_admin_org(org_id) and role <> 'owner');
create policy invites_delete on public.org_invites for delete using (public.can_admin_org(org_id));

create policy projects_select on public.projects for select using (public.is_org_member(org_id));
create policy projects_insert on public.projects for insert with check (public.can_edit_org(org_id) and created_by = auth.uid());
create policy projects_update on public.projects for update using (public.can_edit_org(org_id));
create policy projects_delete on public.projects for delete using (public.can_admin_org(org_id));

create policy versions_select on public.project_versions for select using (public.is_org_member(org_id));
-- inserts only through save_project_version()

revoke execute on function public.save_project_version(uuid, jsonb, int, text, public.version_kind, text) from anon;
revoke execute on function public.accept_pending_invites() from anon;
