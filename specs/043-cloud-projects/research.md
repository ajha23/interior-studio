# Research — 043 Cloud Projects

Facts checked in the repository on 2026-11-07 before planning.

## What exists today

- `public.projects` and `public.project_versions` exist (phase0 migration). There is no owner
  column; `created_by` is the owner. `version_kind` is `('autosave','manual','revision')`, so it
  has no `restore` value. The `scene` check allows 5 MB; `size_bytes` is a generated column.
- `public.save_project_version(uuid, jsonb, int, text, version_kind, text)` is `security definer`
  with `search_path = public, private`. It takes the scene hash from the client and has no
  compare-and-swap or idempotency. It does not meet FR-003–FR-005.
- Policies: `projects_select` (member), `projects_insert` (editor, `created_by = auth.uid()`),
  `projects_update` (editor, `using` only, every column), `projects_delete` (admin, any project).
  `project_versions` has a select policy only.
- The helpers live in `private` (`private.is_org_member`, `can_edit_org`, `can_admin_org`), as the
  spec assumes.
- No audit table exists anywhere. `pgcrypto` is in `extensions` (045 uses `extensions.gen_random_bytes`).
- Seed: 2 projects per studio with fake scenes (`{name, seed, version}`), which are `legacy_v1`
  in effect.
- Browser: `src/persistence/projectDb.ts` (IndexedDB stores `projects`, `homes`, `packages`,
  `assets`). Kitchen ids look like `prj_<12 hex>`, home ids like `home_…`. `EntityIdSchema` allows
  `[A-Za-z0-9_-]{1,64}`, so a uuid is a valid domain id. A home room's editor id is
  `${home.id}--${room.id}`, cut to 64 characters.
- Save entry points: `saveCurrentProject()` (`features/projects/projectActions.ts`), called from the
  TopBar, Ctrl+S, the command palette and the command line. Home save is `useHomeStore.save()`.
  Dirty state is `editorStore.savedProject` plus `homeStore.dirty`. `editorStore.revision`
  increments on every applied command.
- The 034.x cloud code to delete (FR-016): `src/domain/project/cloud{Types,Persistence,Errors,PersistencePort}.ts`
  (and their re-exports in `src/domain/index.ts`), `src/state/cloudProjectStore.ts`, and
  `src/infrastructure/persistence/*` (supabase adapter, in-memory adapter, factory, their tests,
  `SupabaseClientLike`, `createBrowserSupabaseClient`), plus `bootstrapPersistence()` in
  `src/main.tsx`. `CloudProjectModal.tsx` is already gone. Outside the deleted set, only
  `src/test/monorepoPackages.test.ts` (2 assertions) refers to these exports.
  `canonicalHash.ts` and `lifecycle.ts` have other users and stay.
- 31 e2e tests create a kitchen with "Create project" after signing in as `designer.a`
  (studio `alpha`) on the local stack.

## Decisions

### R1 — One creation path, one save path, both through functions
**Decision**: `create_project` and `save_project_version` are public `security invoker` wrappers
over `private` `security definer` bodies (the 045 pattern). `create_project` writes the project row
and version 1 in one transaction. Insert on `public.projects` is revoked from `authenticated`.
**Rationale**: a project with no version can't open. Creating it atomically means the editor never
sees one. The definer bodies use `search_path = ''`.
**Alternatives**: direct `insert` then a save (two round trips, and an empty project if the second
fails); a client-chosen row with no version.

### R2 — Rename, archive, unarchive and delete stay as table writes under RLS, with column grants and an audit trigger
**Decision**:
- `update` is revoked on `public.projects`, then granted on `(name, client_name, site_address,
  status, archived_at)` only, so `current_version_no`, `current_version_id`, `org_id` and
  `created_by` can't be changed directly.
- `projects_update` gets a `with check`.
- `projects_delete` becomes `private.can_admin_org(org_id) and archived_at is not null`.
- A `before update` trigger stamps `updated_at`/`updated_by` and replaces any client
  `archived_at` with `now()`.
- `after update` and `after delete` triggers write `private.audit_log`.

**Rationale**: these operations are single-row writes that RLS already decides. Triggers give
"one audit row per action" (FR-008) without four more RPCs. Column grants close the hole where an
editor could set `current_version_no` and defeat compare-and-swap.
**Alternatives**: an RPC per action (more surface, same checks); leaving update on every column
(breaks FR-003).

### R3 — Order inside the save: idempotency, then lock, then compare-and-swap
**Decision**:
1. Insert `(org_id, actor_id, 'save_version', key)` into `private.idempotency_keys` with
   `on conflict do nothing`.
2. If the key already exists, return the version it points to (the same response).
3. Otherwise lock the project `for update` and check `archived_at is null`, the size, and
   `current_version_no = p_expected_version_no`.
4. Insert the version and point the key at it.

Two concurrent calls with the same key serialise on the unique index. The second waits, then finds
the key.
**Rationale**: a retry after a lost response must return the original version, not a conflict (its
head has already moved on). That is the spec's "timeout but committed" edge case.

### R4 — The scene hash and the size check happen in the database
**Decision**: `scene_hash = encode(extensions.digest(p_scene::text, 'sha256'), 'hex')`. `jsonb`
text output is normalised (key order, whitespace), so equal scenes hash equally. A scene with
`octet_length(p_scene::text) > 2_000_000` is rejected before any write (FR-004, FR-006).

### R5 — Typed errors use PostgREST's `PTxxx` codes (as 045 does)
| Situation | SQLSTATE | HTTP | Client state |
| --- | --- | --- | --- |
| head ≠ expected | `PT409` | 409 | Conflict dialog |
| scene > 2 MB | `PT413` | 413 | Error: "This design is larger than 2 MB…" |
| project archived | `PT423` | 423 | Error: "This project was archived by …" |
| not found / not a member | `PT404` | 404 | Error |
| not an editor | `42501` | 403 | Read-only / Error |

The details carry `current_version_no` on a conflict, so "Save mine on top" needs no second read.

### R6 — The scene is the domain object; the envelope is rebuilt to load
**Decision**: `scene` stores the `KitchenProject` or `Home` object. `schema_version` stores
`SCHEMA_VERSION` or `HOME_SCHEMA_VERSION`, and `doc_type` says which. Loading rebuilds
`{format, schemaVersion, savedAt, project|home}` and goes through `parseProjectFile` /
`parseHomeFile`, so the existing migrations, Zod and invariants apply. A cloud document's domain id
is set to the `projects.id` uuid.
**Rationale**: one parsing path. The id in the scene matches the row, so routing and caching key on
one id.

### R7 — Browser layering
- `src/infrastructure/projects/cloudProjects.ts`: the only module that calls supabase-js for
  projects. It takes the client as a parameter (no module-level instance, FR-015) and returns typed
  results or typed errors.
- `src/persistence/cloudCache.ts`: IndexedDB stores `cloud_docs` and `cloud_queue`, keyed by
  `[userId, orgId, projectId]` (DB version bump, upgrade test). It is cleared on sign-out.
- `src/features/projects/cloud/sync.ts`: the sync controller (autosave debounce, queue drain,
  status). It is a small zustand store in `features` because it depends on infrastructure. `state`
  must not.
- `src/state/editorStore.ts` gains `readOnly` (with `dispatch`, transactions and undo refused). The
  home store's mutations check the same flag.

### R8 — Routes for cloud documents
`#/s/<slug>/p/<id>` (kitchen), `#/s/<slug>/h/<id>` and `#/s/<slug>/h/<id>/room/<roomId>` (home).
The device routes `#/project/<id>` and `#/home/<id>` stay for "On this device". Routing moves to a
library in 049.

### R9 — Autosave and the queue
- 2 s after the last change (`editorStore.revision` or `homeStore.dirty`), the controller enqueues
  `{expected, key, scene}` and drains. The queue holds one in-flight save per project.
- Offline, every debounced snapshot is queued, chained with `expected = previous expected + 1`, and
  sent in order on `online`.
- A `PT409` stops the drain and opens the dialog. The later entries wait (US4-3).
- "Save mine on top" re-bases the waiting entries onto the new head.
- Keys are `crypto.randomUUID()` (not security code).
- Ctrl+S / Save version sends kind `manual` with an optional message.

### R10 — Concurrency is proven outside pgTAP
pgTAP runs in one transaction. As in 045, `scripts/test-project-concurrency.mjs` (local only) fires
2 saves with the same expected head from 2 clients (exactly 1 wins, 1 gets `PT409`) and 2 saves
with the same key (1 version, identical response). CI's `db` job runs it after `db:test`.

### R11 — Splitting into PRs (≤ 3-day branches, about 400 lines each)
1. **043a — database**: migration, pgTAP, concurrency script, types, the seed, and this spec/plan.
2. **043b — studio projects**: adapter, cache, list/create/open/rename/archive/delete, autosave,
   status, viewer read-only, deleting the 034.x code, e2e updates.
3. **043c — conflicts, offline, history**: conflict dialog, offline queue, history and restore, gate.

Each PR keeps `main` deployable. 043a changes no behaviour (nothing calls the new functions yet).

### R12 — Existing e2e
"Create project" in the studio now creates a cloud project. The 31 tests keep their steps. Only
URL assertions (`#/project/`) and local-only checks change. A `cloudProject` helper in
`e2e/fixtures` waits for "Saved" where a test reloads.

## Open risks

- **SC-001 (p95 < 500 ms on staging)**: staging arrives in 048. We measure on production with the
  125 KB home fixture and record the result, then re-check in 052.
- **Previews use the production database (until 048)**: the preview gate creates real projects in
  the founder's studio, and the gate notes say to archive and delete them afterwards.
