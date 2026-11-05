insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('render-jobs', 'render-jobs', false, 157286400, array['model/gltf-binary', 'application/octet-stream'])
on conflict (id) do nothing;

create policy render_jobs_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'render-jobs' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
create policy render_jobs_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'render-jobs' and private.can_edit_org(((storage.foldername(name))[1])::uuid));
create policy render_jobs_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'render-jobs' and private.can_edit_org(((storage.foldername(name))[1])::uuid));

alter table public.renders add column if not exists engine text not null default 'browser';
alter table public.renders add constraint renders_engine_check check (engine in ('browser', 'cycles', 'ai'));
update public.renders set engine = 'ai' where kind = 'ai';;
