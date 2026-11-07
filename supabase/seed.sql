-- Synthetic seed for local development and the pgTAP suite (spec 041, FR-004).
-- Test fixture only: never applied to production. Every email ends in @example.test.
-- Fixed ids follow a readable pattern so tests can name rows:
--   studios  aaaaaaaa-… (Alpha) and bbbbbbbb-… (Beta)
--   users    a1…a4 (Alpha owner, admin, designer, viewer), b1…b4 (Beta), c0… (stranger),
--            d0… (both@: designer in Alpha, viewer in Beta)
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
    ('c0000000-0000-4000-8000-000000000000'::uuid, 'stranger@example.test',   'No Studio'),
    -- Member of both studios (spec 042: studio switcher). Not used by the cross-tenant tests.
    ('d0000000-0000-4000-8000-000000000000'::uuid, 'both@example.test',       'Two Studios')
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
  ('bbbbbbbb-0000-4000-8000-000000000000', 'b4000000-0000-4000-8000-000000000004', 'viewer'),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'd0000000-0000-4000-8000-000000000000', 'designer'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'd0000000-0000-4000-8000-000000000000', 'viewer');

-- ---------------------------------------------------------------------------
-- Projects: 2 per studio; versions: 2 per project (autosave + manual)
-- ---------------------------------------------------------------------------
insert into public.projects (id, org_id, name, client_name, status, created_by, updated_by) values
  ('aaaa0001-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000000', 'Alpha Kitchen', 'Client A1', 'design', 'a3000000-0000-4000-8000-000000000003', 'a3000000-0000-4000-8000-000000000003'),
  ('aaaa0002-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000000', 'Alpha Home',    'Client A2', 'lead',   'a1000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001'),
  ('bbbb0001-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000000', 'Beta Kitchen',  'Client B1', 'design', 'b3000000-0000-4000-8000-000000000003', 'b3000000-0000-4000-8000-000000000003'),
  ('bbbb0002-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000000', 'Beta Home',     'Client B2', 'lead',   'b1000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001');

-- Spec 043: these fake scenes are the old, unversioned format, so they are 'legacy_v1' (spec 044).
insert into public.project_versions (project_id, org_id, version_no, kind, message, doc_type, schema_version, scene, scene_hash, created_by)
select p.id, p.org_id, v.n, v.kind::public.version_kind, v.msg, 'legacy_v1', 2,
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

-- ---------------------------------------------------------------------------
-- Spec 043: one real kitchen per studio, created the way the app creates one (create_project as
-- the studio's designer), so e2e and manual checks can open a cloud project straight away.
-- The scene is createProject(DEFAULT_ROOM, 'straight') with fixed ids (schema version 2).
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims', '{"sub":"a3000000-0000-4000-8000-000000000003","role":"authenticated"}', false);
select * from private.create_project('aaaaaaaa-0000-4000-8000-000000000000', 'Alpha Cloud Kitchen', 'Client A3', 'kitchen',
  $scene${"schemaVersion":2,"id":"prj_seed0001","name":"Cloud Kitchen","room":{"width":4200,"length":3200,"height":2700,"wallThickness":150},"surfaces":{"floor":"floor-oak","wall":"wall-warm-white","countertop":"counter-quartz-white","carcass":"carcass-white"},"materials":{"shutter-white-matte":{"id":"shutter-white-matte","name":"White matte","category":"shutter","color":"#f1f0eb","roughness":0.65,"metalness":0},"shutter-oak":{"id":"shutter-oak","name":"Natural oak","category":"shutter","color":"#b98c5d","roughness":0.55,"metalness":0,"texture":"wood","textureScale":600},"shutter-walnut":{"id":"shutter-walnut","name":"Walnut","category":"shutter","color":"#6a4a34","roughness":0.5,"metalness":0,"texture":"wood","textureScale":600},"shutter-sage":{"id":"shutter-sage","name":"Sage green","category":"shutter","color":"#8ea38b","roughness":0.6,"metalness":0},"shutter-navy":{"id":"shutter-navy","name":"Deep navy","category":"shutter","color":"#2e3c55","roughness":0.5,"metalness":0},"shutter-graphite":{"id":"shutter-graphite","name":"Graphite","category":"shutter","color":"#3b3c3f","roughness":0.45,"metalness":0},"shutter-cashmere":{"id":"shutter-cashmere","name":"Cashmere","category":"shutter","color":"#d8cbb8","roughness":0.6,"metalness":0},"carcass-white":{"id":"carcass-white","name":"White carcass","category":"carcass","color":"#ebe8e1","roughness":0.7,"metalness":0},"carcass-grey":{"id":"carcass-grey","name":"Grey carcass","category":"carcass","color":"#9c9c9a","roughness":0.7,"metalness":0},"counter-quartz-white":{"id":"counter-quartz-white","name":"White quartz","category":"countertop","color":"#ebe9e4","roughness":0.25,"metalness":0,"texture":"marble","textureScale":1200},"counter-black-granite":{"id":"counter-black-granite","name":"Black granite","category":"countertop","color":"#27282b","roughness":0.3,"metalness":0,"texture":"stone","textureScale":600},"counter-oak":{"id":"counter-oak","name":"Oak butcher block","category":"countertop","color":"#a97a4b","roughness":0.5,"metalness":0,"texture":"wood","textureScale":600},"counter-concrete":{"id":"counter-concrete","name":"Concrete","category":"countertop","color":"#9c9a95","roughness":0.75,"metalness":0,"texture":"concrete","textureScale":1500},"floor-oak":{"id":"floor-oak","name":"Oak planks","category":"floor","color":"#c7a27b","roughness":0.6,"metalness":0,"texture":"planks","textureScale":180},"floor-grey-tile":{"id":"floor-grey-tile","name":"Grey tile","category":"floor","color":"#b8b6b1","roughness":0.4,"metalness":0,"texture":"tile","textureScale":600},"floor-terrazzo":{"id":"floor-terrazzo","name":"Terrazzo","category":"floor","color":"#d9d4ca","roughness":0.45,"metalness":0,"texture":"terrazzo","textureScale":800},"floor-marble":{"id":"floor-marble","name":"White marble","category":"floor","color":"#e9e6df","roughness":0.2,"metalness":0,"texture":"marble","textureScale":800},"wall-warm-white":{"id":"wall-warm-white","name":"Warm white","category":"wall","color":"#f3f0e9","roughness":0.9,"metalness":0,"texture":"plaster","textureScale":2000},"wall-sage":{"id":"wall-sage","name":"Sage","category":"wall","color":"#c8d2c2","roughness":0.9,"metalness":0,"texture":"plaster","textureScale":2000},"wall-greige":{"id":"wall-greige","name":"Greige","category":"wall","color":"#d8d1c6","roughness":0.9,"metalness":0,"texture":"plaster","textureScale":2000},"wall-exposed-brick":{"id":"wall-exposed-brick","name":"Exposed brick","category":"wall","color":"#a35d43","roughness":0.85,"metalness":0,"texture":"brick","textureScale":300}},"viewpoints":[],"openings":[],"furniture":[],"mep":[],"preferences":{"unit":"mm"},"production":{},"cabinets":[{"id":"cab_seed0003","type":"base","dimensions":{"width":600,"height":720,"depth":560},"position":{"x":1000,"y":100,"z":280},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"base-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":335,"glass":false}]}]}},{"id":"cab_seed0004","type":"sink","dimensions":{"width":800,"height":720,"depth":560},"position":{"x":1700,"y":100,"z":280},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"sink-800","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[]}]}},{"id":"cab_seed0007","type":"drawer","dimensions":{"width":600,"height":720,"depth":560},"position":{"x":3600,"y":100,"z":280},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"drawer-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[]}]}},{"id":"cab_seed0008","type":"wall","dimensions":{"width":600,"height":720,"depth":350},"position":{"x":1000,"y":1480,"z":175},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"wall-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":215,"glass":false},{"kind":"shelf","y":450,"glass":false}]}]}},{"id":"cab_seed0009","type":"wall","dimensions":{"width":800,"height":720,"depth":350},"position":{"x":1700,"y":1480,"z":175},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"wall-800","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":215,"glass":false},{"kind":"shelf","y":450,"glass":false}]}]}},{"id":"cab_seed0010","type":"wall","dimensions":{"width":600,"height":720,"depth":350},"position":{"x":2400,"y":1480,"z":175},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"wall-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":215,"glass":false},{"kind":"shelf","y":450,"glass":false}]}]}},{"id":"cab_seed0012","type":"wall","dimensions":{"width":600,"height":720,"depth":350},"position":{"x":3600,"y":1480,"z":175},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"wall-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":215,"glass":false},{"kind":"shelf","y":450,"glass":false}]}]}}],"appliances":[{"id":"app_seed0002","type":"fridge","dimensions":{"width":700,"height":1800,"depth":650},"position":{"x":350,"y":0,"z":325},"rotationY":0,"wallId":"back"},{"id":"app_seed0005","type":"dishwasher","dimensions":{"width":600,"height":820,"depth":560},"position":{"x":2400,"y":0,"z":280},"rotationY":0,"wallId":"back"},{"id":"app_seed0006","type":"range","dimensions":{"width":600,"height":860,"depth":600},"position":{"x":3000,"y":0,"z":300},"rotationY":0,"wallId":"back"},{"id":"app_seed0011","type":"hood","dimensions":{"width":600,"height":690,"depth":500},"position":{"x":3000,"y":1510,"z":250},"rotationY":0,"wallId":"back"}]}$scene$::jsonb, 2, 'aaaa5eed-0000-4000-8000-000000000043');
select set_config('request.jwt.claims', '{"sub":"b3000000-0000-4000-8000-000000000003","role":"authenticated"}', false);
select * from private.create_project('bbbbbbbb-0000-4000-8000-000000000000', 'Beta Cloud Kitchen', 'Client B3', 'kitchen',
  $scene${"schemaVersion":2,"id":"prj_seed0001","name":"Cloud Kitchen","room":{"width":4200,"length":3200,"height":2700,"wallThickness":150},"surfaces":{"floor":"floor-oak","wall":"wall-warm-white","countertop":"counter-quartz-white","carcass":"carcass-white"},"materials":{"shutter-white-matte":{"id":"shutter-white-matte","name":"White matte","category":"shutter","color":"#f1f0eb","roughness":0.65,"metalness":0},"shutter-oak":{"id":"shutter-oak","name":"Natural oak","category":"shutter","color":"#b98c5d","roughness":0.55,"metalness":0,"texture":"wood","textureScale":600},"shutter-walnut":{"id":"shutter-walnut","name":"Walnut","category":"shutter","color":"#6a4a34","roughness":0.5,"metalness":0,"texture":"wood","textureScale":600},"shutter-sage":{"id":"shutter-sage","name":"Sage green","category":"shutter","color":"#8ea38b","roughness":0.6,"metalness":0},"shutter-navy":{"id":"shutter-navy","name":"Deep navy","category":"shutter","color":"#2e3c55","roughness":0.5,"metalness":0},"shutter-graphite":{"id":"shutter-graphite","name":"Graphite","category":"shutter","color":"#3b3c3f","roughness":0.45,"metalness":0},"shutter-cashmere":{"id":"shutter-cashmere","name":"Cashmere","category":"shutter","color":"#d8cbb8","roughness":0.6,"metalness":0},"carcass-white":{"id":"carcass-white","name":"White carcass","category":"carcass","color":"#ebe8e1","roughness":0.7,"metalness":0},"carcass-grey":{"id":"carcass-grey","name":"Grey carcass","category":"carcass","color":"#9c9c9a","roughness":0.7,"metalness":0},"counter-quartz-white":{"id":"counter-quartz-white","name":"White quartz","category":"countertop","color":"#ebe9e4","roughness":0.25,"metalness":0,"texture":"marble","textureScale":1200},"counter-black-granite":{"id":"counter-black-granite","name":"Black granite","category":"countertop","color":"#27282b","roughness":0.3,"metalness":0,"texture":"stone","textureScale":600},"counter-oak":{"id":"counter-oak","name":"Oak butcher block","category":"countertop","color":"#a97a4b","roughness":0.5,"metalness":0,"texture":"wood","textureScale":600},"counter-concrete":{"id":"counter-concrete","name":"Concrete","category":"countertop","color":"#9c9a95","roughness":0.75,"metalness":0,"texture":"concrete","textureScale":1500},"floor-oak":{"id":"floor-oak","name":"Oak planks","category":"floor","color":"#c7a27b","roughness":0.6,"metalness":0,"texture":"planks","textureScale":180},"floor-grey-tile":{"id":"floor-grey-tile","name":"Grey tile","category":"floor","color":"#b8b6b1","roughness":0.4,"metalness":0,"texture":"tile","textureScale":600},"floor-terrazzo":{"id":"floor-terrazzo","name":"Terrazzo","category":"floor","color":"#d9d4ca","roughness":0.45,"metalness":0,"texture":"terrazzo","textureScale":800},"floor-marble":{"id":"floor-marble","name":"White marble","category":"floor","color":"#e9e6df","roughness":0.2,"metalness":0,"texture":"marble","textureScale":800},"wall-warm-white":{"id":"wall-warm-white","name":"Warm white","category":"wall","color":"#f3f0e9","roughness":0.9,"metalness":0,"texture":"plaster","textureScale":2000},"wall-sage":{"id":"wall-sage","name":"Sage","category":"wall","color":"#c8d2c2","roughness":0.9,"metalness":0,"texture":"plaster","textureScale":2000},"wall-greige":{"id":"wall-greige","name":"Greige","category":"wall","color":"#d8d1c6","roughness":0.9,"metalness":0,"texture":"plaster","textureScale":2000},"wall-exposed-brick":{"id":"wall-exposed-brick","name":"Exposed brick","category":"wall","color":"#a35d43","roughness":0.85,"metalness":0,"texture":"brick","textureScale":300}},"viewpoints":[],"openings":[],"furniture":[],"mep":[],"preferences":{"unit":"mm"},"production":{},"cabinets":[{"id":"cab_seed0003","type":"base","dimensions":{"width":600,"height":720,"depth":560},"position":{"x":1000,"y":100,"z":280},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"base-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":335,"glass":false}]}]}},{"id":"cab_seed0004","type":"sink","dimensions":{"width":800,"height":720,"depth":560},"position":{"x":1700,"y":100,"z":280},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"sink-800","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[]}]}},{"id":"cab_seed0007","type":"drawer","dimensions":{"width":600,"height":720,"depth":560},"position":{"x":3600,"y":100,"z":280},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"drawer-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[]}]}},{"id":"cab_seed0008","type":"wall","dimensions":{"width":600,"height":720,"depth":350},"position":{"x":1000,"y":1480,"z":175},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"wall-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":215,"glass":false},{"kind":"shelf","y":450,"glass":false}]}]}},{"id":"cab_seed0009","type":"wall","dimensions":{"width":800,"height":720,"depth":350},"position":{"x":1700,"y":1480,"z":175},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"wall-800","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":215,"glass":false},{"kind":"shelf","y":450,"glass":false}]}]}},{"id":"cab_seed0010","type":"wall","dimensions":{"width":600,"height":720,"depth":350},"position":{"x":2400,"y":1480,"z":175},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"wall-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":215,"glass":false},{"kind":"shelf","y":450,"glass":false}]}]}},{"id":"cab_seed0012","type":"wall","dimensions":{"width":600,"height":720,"depth":350},"position":{"x":3600,"y":1480,"z":175},"rotationY":0,"materialId":"shutter-white-matte","wallId":"back","catalogItemId":"wall-600","frontStyle":"solid","interior":{"sections":[{"width":null,"fittings":[{"kind":"shelf","y":215,"glass":false},{"kind":"shelf","y":450,"glass":false}]}]}}],"appliances":[{"id":"app_seed0002","type":"fridge","dimensions":{"width":700,"height":1800,"depth":650},"position":{"x":350,"y":0,"z":325},"rotationY":0,"wallId":"back"},{"id":"app_seed0005","type":"dishwasher","dimensions":{"width":600,"height":820,"depth":560},"position":{"x":2400,"y":0,"z":280},"rotationY":0,"wallId":"back"},{"id":"app_seed0006","type":"range","dimensions":{"width":600,"height":860,"depth":600},"position":{"x":3000,"y":0,"z":300},"rotationY":0,"wallId":"back"},{"id":"app_seed0011","type":"hood","dimensions":{"width":600,"height":690,"depth":500},"position":{"x":3000,"y":1510,"z":250},"rotationY":0,"wallId":"back"}]}$scene$::jsonb, 2, 'bbbb5eed-0000-4000-8000-000000000043');
select set_config('request.jwt.claims', '', false);
