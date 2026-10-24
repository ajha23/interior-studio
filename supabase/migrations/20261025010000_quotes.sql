-- Studio price list (one per studio) and saved client quotes.
create table public.price_lists (
  org_id uuid primary key references public.organizations(id) on delete cascade,
  rates jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references auth.users(id) on delete set null
);
alter table public.price_lists enable row level security;
create policy price_lists_select on public.price_lists for select to authenticated using (private.is_org_member(org_id));
create policy price_lists_insert on public.price_lists for insert to authenticated with check (private.can_admin_org(org_id));
create policy price_lists_update on public.price_lists for update to authenticated using (private.can_admin_org(org_id)) with check (private.can_admin_org(org_id));

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  quote_no text not null,
  version_no integer not null default 0,
  status text not null default 'draft' check (status in ('draft', 'sent', 'accepted', 'rejected')),
  client_name text not null default '',
  lines jsonb not null,
  totals jsonb not null,
  rates jsonb not null,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  unique (org_id, quote_no)
);
create index quotes_project_idx on public.quotes (project_id, created_at desc);
alter table public.quotes enable row level security;
create policy quotes_select on public.quotes for select to authenticated using (private.is_org_member(org_id));
create policy quotes_insert on public.quotes for insert to authenticated with check (private.can_edit_org(org_id) and private.project_in_org(project_id, org_id));
create policy quotes_update on public.quotes for update to authenticated using (private.can_edit_org(org_id)) with check (private.can_edit_org(org_id));
create policy quotes_delete on public.quotes for delete to authenticated using (private.can_admin_org(org_id));
