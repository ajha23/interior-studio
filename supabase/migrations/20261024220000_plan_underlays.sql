-- Floor-plan images (and rendered PDF pages) shown under the walls for tracing.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('plans', 'plans', false, 31457280, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;
create policy plans_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'plans' and private.is_org_member(((storage.foldername(name))[1])::uuid));
create policy plans_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'plans' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
create policy plans_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'plans' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
