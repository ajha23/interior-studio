-- Phase 1c: saved renders and client share links.

create table public.renders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  version_no int not null default 0,
  storage_path text not null unique,
  width int not null check (width between 16 and 8192),
  height int not null check (height between 16 and 8192),
  samples int not null default 0,
  mood text not null default 'day' check (mood in ('day', 'evening')),
  caption text not null default '' check (char_length(caption) <= 200),
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  constraint renders_path_in_org check (split_part(storage_path, '/', 1) = org_id::text)
);
create index renders_project_idx on public.renders (project_id, created_at desc);
alter table public.renders enable row level security;

-- org_id must match the project's org, so a designer can't file renders against another studio's project.
create or replace function private.project_in_org(p_project uuid, p_org uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projects where id = p_project and org_id = p_org)
$$;
revoke all on function private.project_in_org(uuid, uuid) from public, anon;
grant execute on function private.project_in_org(uuid, uuid) to authenticated;

create policy renders_select on public.renders for select to authenticated using (private.is_org_member(org_id));
create policy renders_insert on public.renders for insert to authenticated
  with check (private.can_edit_org(org_id) and created_by = auth.uid() and private.project_in_org(project_id, org_id));
create policy renders_update on public.renders for update to authenticated using (private.can_edit_org(org_id)) with check (private.can_edit_org(org_id));
create policy renders_delete on public.renders for delete to authenticated using (private.can_admin_org(org_id) or created_by = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('renders', 'renders', false, 31457280, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

create policy renders_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'renders' and private.is_org_member(((storage.foldername(name))[1])::uuid));
create policy renders_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'renders' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
create policy renders_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'renders' and private.can_edit_org(((storage.foldername(name))[1])::uuid));

-- Share links: an unguessable token opens a read-only view of one project for anyone holding it.
create table public.share_links (
  id uuid primary key default gen_random_uuid(),
  token text not null unique default replace(replace(rtrim(encode(extensions.gen_random_bytes(24), 'base64'), '='), '+', '-'), '/', '_'),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  -- null = always show the latest saved version; otherwise pinned to that version.
  version_id uuid references public.project_versions(id) on delete cascade,
  label text not null default '' check (char_length(label) <= 120),
  show_renders boolean not null default true,
  show_plan boolean not null default true,
  expires_at timestamptz,
  revoked_at timestamptz,
  view_count int not null default 0,
  last_viewed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index share_links_project_idx on public.share_links (project_id, created_at desc);
alter table public.share_links enable row level security;

create policy shares_select on public.share_links for select to authenticated using (private.is_org_member(org_id));
create policy shares_insert on public.share_links for insert to authenticated
  with check (private.can_edit_org(org_id) and created_by = auth.uid() and private.project_in_org(project_id, org_id));
create policy shares_update on public.share_links for update to authenticated using (private.can_edit_org(org_id)) with check (private.can_edit_org(org_id));
create policy shares_delete on public.share_links for delete to authenticated using (private.can_admin_org(org_id) or created_by = auth.uid());

-- The token itself is never changed after creation.
create or replace function private.share_links_freeze_token()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.token <> old.token or new.project_id <> old.project_id or new.org_id <> old.org_id then
    raise exception 'token, project and studio of a share link cannot change';
  end if;
  return new;
end $$;
create trigger share_links_freeze before update on public.share_links
  for each row execute function private.share_links_freeze_token();
