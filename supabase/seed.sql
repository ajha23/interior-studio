-- Synthetic seed for local development and the pgTAP suite (spec 041, FR-004).
-- Test fixture only: never applied to production. Every email ends in @example.test.
-- Fixed ids follow a readable pattern so tests can name rows:
--   studios  aaaaaaaa-… (Alpha) and bbbbbbbb-… (Beta)
--   users    a1…a4 (Alpha owner, admin, designer, viewer), b1…b4 (Beta), c0… (stranger)
--   projects/versions and other rows use the studio letter in the first group.
-- The live migration 20261024082852 also creates the "Interior Studio" studio; it is left as is.

-- ---------------------------------------------------------------------------
-- Users: auth.users + auth.identities. Profiles come from private.handle_new_user.
-- Local password for every seeded user: password123
-- ---------------------------------------------------------------------------
with u(id, email, full_name) as (
  values
    ('a1000000-0000-4000-8000-000000000001'::uuid, 'owner.a@example.test',    'Alpha Owner'),
    ('a2000000-0000-4000-8000-000000000002'::uuid, 'admin.a@example.test',    'Alpha Admin'),
    ('a3000000-0000-4000-8000-000000000003'::uuid, 'designer.a@example.test', 'Alpha Designer'),
    ('a4000000-0000-4000-8000-000000000004'::uuid, 'viewer.a@example.test',   'Alpha Viewer'),
    ('b1000000-0000-4000-8000-000000000001'::uuid, 'owner.b@example.test',    'Beta Owner'),
    ('b2000000-0000-4000-8000-000000000002'::uuid, 'admin.b@example.test',    'Beta Admin'),
    ('b3000000-0000-4000-8000-000000000003'::uuid, 'designer.b@example.test', 'Beta Designer'),
    ('b4000000-0000-4000-8000-000000000004'::uuid, 'viewer.b@example.test',   'Beta Viewer'),
    ('c0000000-0000-4000-8000-000000000000'::uuid, 'stranger@example.test',   'No Studio')
)
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('password123', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', u.full_name), now(), now(),
       '', '', '', ''
from u;

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@example.test' and u.email not in ('founder@example.test', 'studio-owner@example.test');

-- ---------------------------------------------------------------------------
-- Studios and memberships
-- ---------------------------------------------------------------------------
insert into public.organizations (id, name, slug) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'Alpha Studio', 'alpha'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'Beta Studio',  'beta');

insert into public.org_members (org_id, user_id, role) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a1000000-0000-4000-8000-000000000001', 'owner'),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a2000000-0000-4000-8000-000000000002', 'admin'),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a3000000-0000-4000-8000-000000000003', 'designer'),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a4000000-0000-4000-8000-000000000004', 'viewer'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'b1000000-0000-4000-8000-000000000001', 'owner'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'b2000000-0000-4000-8000-000000000002', 'admin'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'b3000000-0000-4000-8000-000000000003', 'designer'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'b4000000-0000-4000-8000-000000000004', 'viewer');

-- ---------------------------------------------------------------------------
-- Projects: 2 per studio; versions: 2 per project (autosave + manual)
-- ---------------------------------------------------------------------------
insert into public.projects (id, org_id, name, client_name, status, created_by, updated_by) values
  ('aaaa0001-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000000', 'Alpha Kitchen', 'Client A1', 'design', 'a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003'),
  ('aaaa0002-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000000', 'Alpha Home',    'Client A2', 'lead',   'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('bbbb0001-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000000', 'Beta Kitchen',  'Client B1', 'design', 'b3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000003'),
  ('bbbb0002-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000000', 'Beta Home',     'Client B2', 'lead',   'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');

insert into public.project_versions (project_id, org_id, version_no, kind, message, schema_version, scene, scene_hash, created_by)
select p.id, p.org_id, v.n, v.kind::public.version_kind, v.msg, 2,
       jsonb_build_object('name', p.name, 'seed', true, 'version', v.n),
       md5(p.id::text || v.n::text), p.created_by  -- size_bytes is a generated column
from public.projects p
cross join (values (1, 'autosave', ''), (2, 'manual', 'First saved version')) as v(n, kind, msg)
where p.org_id in ('aaaaaaaa-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000000');

update public.projects p
set current_version_no = 2,
    current_version_id = (select v.id from public.project_versions v where v.project_id = p.id and v.version_no = 2)
where p.org_id in ('aaaaaaaa-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-000000000000');

-- ---------------------------------------------------------------------------
-- One or more rows in every other studio-owned table, for both studios
-- (cross-tenant "0 rows" results are only meaningful if the other studio has rows).
-- Columns follow each table's NOT NULL and CHECK constraints in the live migrations.
-- ---------------------------------------------------------------------------
with s(org, letter, owner_id, designer_id, project_id) as (
  values
    ('aaaaaaaa-0000-4000-8000-000000000000'::uuid, 'a', 'a1000000-0000-4000-8000-000000000001'::uuid, 'a3000000-0000-4000-8000-000000000003'::uuid, 'aaaa0001-0000-4000-8000-000000000001'::uuid),
    ('bbbbbbbb-0000-4000-8000-000000000000'::uuid, 'b', 'b1000000-0000-4000-8000-000000000001'::uuid, 'b3000000-0000-4000-8000-000000000003'::uuid, 'bbbb0001-0000-4000-8000-000000000001'::uuid)
),
invites as (
  insert into public.org_invites (org_id, email, role, invited_by)
  select org, 'invitee.' || letter || '@example.test', 'designer', owner_id from s
  returning 1
),
settings as (
  insert into public.ai_settings (org_id) select org from s returning 1
),
ledger as (
  insert into public.ai_credit_ledger (org_id, delta, reason, period, created_by)
  select org, 500, 'monthly_grant', to_char(now(), 'YYYY-MM'), owner_id from s
  returning 1
),
jobs as (
  insert into public.ai_jobs (org_id, project_id, kind, op, status, provider, created_by)
  select org, project_id, 'command', 'seed', 'succeeded', 'rules', designer_id from s
  returning 1
),
models as (
  insert into public.catalog_models (org_id, name, storage_path, width_um, depth_um, height_um, source_format, created_by)
  select org, 'Seed cabinet ' || upper(letter), org::text || '/models/seed.glb', 600000, 560000, 720000, 'glb', designer_id from s
  returning 1
),
prices as (
  insert into public.price_lists (org_id, rates) select org, '{"carcass_per_sqft": 150000}'::jsonb from s
  returning 1
),
quoting as (
  insert into public.quotes (org_id, project_id, quote_no, lines, totals, rates, created_by)
  select org, project_id, upper(letter) || '-0001', '[]'::jsonb, '{"total": 0}'::jsonb, '{}'::jsonb, designer_id from s
  returning 1
),
rendering as (
  insert into public.renders (org_id, project_id, storage_path, width, height, created_by)
  select org, project_id, org::text || '/' || project_id::text || '/seed.png', 1920, 1080, designer_id from s
  returning 1
),
templates as (
  insert into public.room_templates (org_id, name, template, created_by)
  select org, 'Seed template ' || upper(letter), '{}'::jsonb, designer_id from s
  returning 1
),
links as (
  insert into public.share_links (org_id, project_id, label, created_by)
  select org, project_id, 'Seed link ' || upper(letter), designer_id from s
  returning 1
)
insert into public.comments (org_id, project_id, body, source, author_id, author_name)
select org, project_id, 'Seed comment ' || upper(letter), 'team', designer_id, 'Seed' from s;
