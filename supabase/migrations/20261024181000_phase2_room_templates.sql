-- Phase 2.2: studio style templates (a room's finishes and furniture, reusable across projects).
create table public.room_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  style text not null default '' check (char_length(style) <= 60),
  room_type text not null default '' check (char_length(room_type) <= 60),
  template jsonb not null,
  piece_count int not null default 0,
  created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now()
);
create index room_templates_org_idx on public.room_templates (org_id, created_at desc);
alter table public.room_templates enable row level security;
create policy templates_select on public.room_templates for select to authenticated using (private.is_org_member(org_id));
create policy templates_insert on public.room_templates for insert to authenticated with check (private.can_edit_org(org_id) and created_by = auth.uid());
create policy templates_update on public.room_templates for update to authenticated using (private.can_edit_org(org_id)) with check (private.can_edit_org(org_id));
create policy templates_delete on public.room_templates for delete to authenticated using (private.can_admin_org(org_id) or created_by = auth.uid());
