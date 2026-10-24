-- Phase 2.7: comment threads on designs, from the team and (optionally) from clients via share links.

alter table public.share_links add column allow_comments boolean not null default false;

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  -- Where the thread points: {kind:'point', x, y} in plan µm, {kind:'item', itemId}, {kind:'render', renderId}, or null.
  anchor jsonb,
  body text not null check (char_length(body) between 1 and 4000),
  source text not null default 'team' check (source in ('team', 'client')),
  author_id uuid references auth.users(id),
  author_name text not null default '' check (char_length(author_name) <= 80),
  share_link_id uuid references public.share_links(id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint comments_author check ((source = 'team' and author_id is not null) or (source = 'client' and author_id is null and share_link_id is not null))
);
create index comments_project_idx on public.comments (project_id, created_at);
create index comments_parent_idx on public.comments (parent_id);
alter table public.comments enable row level security;

create policy comments_select on public.comments for select to authenticated using (private.is_org_member(org_id));
-- Any member (viewers included, e.g. reviewers) may comment as themselves on their studio's projects.
create policy comments_insert on public.comments for insert to authenticated
  with check (private.is_org_member(org_id) and source = 'team' and author_id = auth.uid() and private.project_in_org(project_id, org_id));
-- Authors edit their own text; editors resolve and reopen any thread.
create policy comments_update on public.comments for update to authenticated
  using (author_id = auth.uid() or private.can_edit_org(org_id))
  with check (author_id = auth.uid() or private.can_edit_org(org_id));
create policy comments_delete on public.comments for delete to authenticated using (author_id = auth.uid() or private.can_admin_org(org_id));

-- Only the body (by its author) or the resolution (by editors) may change.
create or replace function private.comments_guard()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.org_id <> old.org_id or new.project_id <> old.project_id or new.parent_id is distinct from old.parent_id
     or new.source <> old.source or new.author_id is distinct from old.author_id or new.share_link_id is distinct from old.share_link_id
     or new.created_at <> old.created_at then
    raise exception 'only the text or the resolution of a comment can change';
  end if;
  if new.body <> old.body then
    if old.author_id is distinct from auth.uid() then raise exception 'only the author can edit a comment'; end if;
    new.edited_at := now();
  end if;
  return new;
end $$;
create trigger comments_guard before update on public.comments for each row execute function private.comments_guard();

-- Live updates in the editor.
alter publication supabase_realtime add table public.comments;
