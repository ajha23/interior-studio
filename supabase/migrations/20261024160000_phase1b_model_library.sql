-- Phase 1b: studio 3D model library (uploaded GLB files), private per organisation.

create table public.catalog_models (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  category text not null default 'decor',
  storage_path text not null unique,
  thumb_path text,
  width_um bigint not null check (width_um > 0),
  depth_um bigint not null check (depth_um > 0),
  height_um bigint not null check (height_um > 0),
  bytes bigint not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  -- Files live under "<org_id>/..." so storage policies can scope them by folder.
  constraint catalog_models_path_in_org check (split_part(storage_path, '/', 1) = org_id::text)
);
create index catalog_models_org_idx on public.catalog_models (org_id, created_at desc);
alter table public.catalog_models enable row level security;

create policy models_select on public.catalog_models for select to authenticated using (private.is_org_member(org_id));
create policy models_insert on public.catalog_models for insert to authenticated with check (private.can_edit_org(org_id) and created_by = auth.uid());
create policy models_update on public.catalog_models for update to authenticated using (private.can_edit_org(org_id)) with check (private.can_edit_org(org_id));
create policy models_delete on public.catalog_models for delete to authenticated using (private.can_admin_org(org_id) or created_by = auth.uid());

-- Private bucket; 50 MB per file; GLB models and PNG/WebP thumbnails only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('models', 'models', false, 52428800, array['model/gltf-binary', 'application/octet-stream', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy models_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'models' and private.is_org_member(((storage.foldername(name))[1])::uuid));
create policy models_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'models' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
create policy models_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'models' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
create policy models_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'models' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
