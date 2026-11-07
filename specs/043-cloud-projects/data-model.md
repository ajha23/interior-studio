# Data model — 043 Cloud Projects

One migration: `supabase/migrations/<ts>_cloud_projects.sql` (from `supabase migration new cloud_projects`).

## Changed: `public.projects`

| Column | Change |
| --- | --- |
| `id` … `archived_at` | unchanged (`created_by` is shown as the owner) |

Privileges and policies:
- `insert`: **revoked** from `authenticated`. Projects are created only by `create_project`. The
  `projects_insert` policy stays so XI's "policy for every command" holds; with no privilege it
  never applies.
- `update`: revoked on the table, then granted on `(name, client_name, site_address, status,
  archived_at)` only. `projects_update`: `using (private.can_edit_org(org_id)) with check
  (private.can_edit_org(org_id))`.
- `delete`: `projects_delete` becomes `using (private.can_admin_org(org_id) and archived_at is not null)`.
- Triggers:
  - `projects_stamp`, before update (`private.projects_stamp()`): sets `updated_at = now()` and
    `updated_by = auth.uid()`; sets `archived_at = now()` when it changes from null to non-null.
    A non-null value can't be moved to another non-null value.
  - `projects_audit`, after update or delete (`private.projects_audit()`, definer): one
    `audit_log` row: `project.rename`, `project.archive`, `project.unarchive`, `project.update`
    or `project.delete`.

State transitions: `active (archived_at null)` ⇄ `archived (archived_at set)` → `deleted` (admin
only, archived only).

## Changed: `public.project_versions`

| Column | Type | Rule |
| --- | --- | --- |
| `doc_type` | `public.doc_type` enum `('kitchen','home','legacy_v1')` | **new**, `not null`. The migration adds it, sets every existing row to `legacy_v1`, then sets `not null` with **no default** |
| `kind` | `public.version_kind` | gains the value `restore` |
| `scene_hash` | text | always computed in the database (R4) |

Writes come only from `private.save_project_version` and `private.create_project`. Select stays
`private.is_org_member(org_id)`. There are still no insert, update or delete privileges or policies
for API roles.

## New: `private.idempotency_keys`

| Column | Type | Rule |
| --- | --- | --- |
| `org_id` | uuid | not null, FK `organizations` on delete cascade |
| `actor_id` | uuid | not null (`auth.uid()`) |
| `op` | text | `'save_version'` or `'create_project'` |
| `key` | uuid | from the client |
| `project_id` | uuid | null until the result is known |
| `version_id` | uuid | the result |
| `created_at` | timestamptz | default `now()` |

The primary key is `(org_id, actor_id, op, key)`. `revoke all … from public, anon, authenticated`.
Rows older than 7 days may be purged (`private.purge_idempotency_keys()`, not scheduled yet).

## New: `private.audit_log` (append-only)

| Column | Type |
| --- | --- |
| `id` | bigint identity |
| `org_id` | uuid not null (no FK, so rows outlive a deleted studio or project) |
| `actor_id` | uuid (`auth.uid()`; null for maintenance) |
| `family` | text check in the constitution's 8 families (`versions` for these actions) |
| `action` | text (`project.create`, `version.save`, `project.rename`, `project.archive`, `project.unarchive`, `project.update`, `project.delete`) |
| `target_id` | uuid (project id) |
| `detail` | jsonb (version_no, kind, old/new name …; never the scene) |
| `at` | timestamptz default `now()` |

- `revoke all` from API roles.
- A `before update or delete or truncate` trigger raises `PT403 'audit_log is append-only'`, for
  every role including the owner (FR-008).
- It has no reader in 043. A later spec exposes it to admins.

## Functions

See [contracts/project-rpc.md](contracts/project-rpc.md). In summary:
- `public.create_project(p_org, p_name, p_client_name, p_doc_type, p_scene, p_schema_version, p_idempotency_key)`
  returns a `projects` row plus `version_no = 1`;
- `public.save_project_version(p_project, p_expected_version_no, p_idempotency_key, p_doc_type, p_scene, p_schema_version, p_kind, p_message)`
  returns a `project_versions` row without the scene;
- the old 6-argument `save_project_version` is **dropped**.

## Browser: IndexedDB (`src/persistence/cloudCache.ts`, same database, version bump)

| Store | Key | Value |
| --- | --- | --- |
| `cloud_docs` | `[userId, orgId, projectId]` | `{ docType, versionNo, scene, name, cachedAt }`: the last head opened or saved here (FR-011a) |
| `cloud_lists` | `[userId, orgId]` | the last project list (offline Projects page) |
| `cloud_queue` | auto id; index `[userId, orgId, projectId]` | `{ projectId, expectedVersionNo, idempotencyKey, docType, scene, kind, message, queuedAt }` (spec's Local queue entry) |

On sign-out, every entry for that user is deleted. "On this device" keeps using the existing
`projects` and `homes` stores, unchanged.

## Domain

No schema change, so no `SCHEMA_VERSION` bump. A cloud document's `id` is set to the project's uuid
(valid under `EntityIdSchema`). `src/domain` and `src/engine` gain no imports.
