# Implementation Plan: 043 — Cloud Projects on the Live Schema

**Branch**: `043-cloud-projects` | **Date**: 2026-11-07 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/043-cloud-projects/spec.md` (clarified 2026-11-07)

## Summary

Kitchens and homes get saved to the studio, in `public.projects` and `public.project_versions`, as
full snapshots. IndexedDB becomes the offline cache and queue.

- **Database**:
  - two functions, each a public invoker wrapper over a private definer body:
    - `create_project` writes the row and version 1 atomically;
    - `save_project_version` replaces today's function and adds idempotency, then
      compare-and-swap, a size check, an archived check and a scene hash computed in the database;
  - column grants and triggers make rename, archive, unarchive and delete plain RLS writes, each
    audited;
  - an append-only `private.audit_log` and `private.idempotency_keys`;
  - `doc_type` on versions (existing rows become `legacy_v1`) and a `restore` version kind.
- **Browser**:
  - one supabase-js adapter;
  - an IndexedDB cache and queue;
  - a sync controller: 2 s autosave, ordered offline drain, conflict dialog;
  - a quiet status indicator;
  - a viewer read-only mode;
  - History with open and restore;
  - the Projects page with a studio list and an "On this device" section;
  - the 034.x cloud code deleted.
- **Delivery**: three PRs (R11): 043a database, 043b studio projects and autosave, 043c conflicts,
  offline and history.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, PL/pgSQL on Postgres 17
**Primary Dependencies**: `@supabase/supabase-js@2.118.0`, zustand, zod, Immer (all existing). **No new package**
**Storage**:
- Postgres: `projects` and `project_versions` (changed); `private.idempotency_keys` and
  `private.audit_log` (new);
- IndexedDB: `cloud_docs`, `cloud_lists` and `cloud_queue` (new stores in the existing database);
- the device stores `projects` and `homes` are unchanged

**Testing**:
- pgTAP `supabase/tests/08_cloud_projects.test.sql`, plus updates to `01`–`03`;
- `scripts/test-project-concurrency.mjs` (local, CI `db` job);
- Vitest for the adapter (fake client), the queue and cache (fake-indexeddb), the sync controller
  (fake timers) and read-only in the editor store;
- RTL for the indicator, conflict dialog and Projects page;
- Playwright `e2e/cloud-projects.spec.ts` on the local stack

**Target Platform**: the browser SPA on Vercel; Supabase (local, then production; staging arrives in 048)
**Project Type**: web app (single Vite project)
**Performance Goals**: a save p95 under 500 ms for a 125 KB home (SC-001; measured on production until staging exists); autosave 2 s after the last change
**Constraints**:
- no silent overwrite;
- no lost queued save across reload;
- scenes ≤ 2 MB;
- the hash computed in the database;
- no actor id in any RPC;
- no module-level Supabase client in the adapter

**Scale/Scope**:
- 1 migration;
- 1 new pgTAP file and 3 updated;
- 1 script;
- about 8 new browser modules;
- about 10 changed files (Projects page, App routes, TopBar, editor and home stores, save entry
  points);
- about 14 files deleted

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | Check | Result |
| --- | --- | --- |
| I — framework-free domain | No change in `src/domain`/`src/engine` except deleting the 034.x cloud files and their re-exports. The adapter is in `src/infrastructure`; the controller is in `src/features` | ✅ |
| II — single mutation path | Saves serialise the store's project; loading uses `openProject`. Read-only refuses `dispatch`. Restore loads a scene; it never edits one in place | ✅ |
| III — integer mm, no silent coercion | No geometry change. Oversized scenes are rejected with a message, never truncated | ✅ |
| IV — derived data not stored | The scene is the domain document only; worktops and BOM are never in it | ✅ |
| VI/X — authorization in the backend | Roles come from `private.can_edit_org`/`can_admin_org` in RLS and the functions; the UI only hides | ✅ |
| VII — tenant isolation, audit | `org_id` on every row; RLS by membership; the studio is taken from the project row on save; append-only `audit_log` (`versions` family) | ✅ |
| VIII — migrations immutable, stable ids | A new migration only; the old function is dropped there, and no old file is edited. Project and element ids are unchanged on save; a cloud document's id is its row id | ✅ |
| IX — tests | pgTAP, Vitest, RTL and Playwright listed above; scenarios added to `docs/ACCEPTANCE_TESTS.md` | ✅ |
| XI — the database is the boundary | RLS on every public table (no new public tables). Definer bodies use `search_path = ''`, qualified names, and execute revoked from `public`/`anon`, granted only to `authenticated` on the wrappers. No actor id. pgTAP covers own studio, other studio and anonymous | ✅ |
| XII — official clients | `supabase.rpc` and `.from` through the 042 client, passed in as a parameter. Keys come from `crypto.randomUUID()`; hashing is done in Postgres. No JWT or crypto code, no new server or package | ✅ |
| No default ids | The studio comes from the route's membership; the user from the session | ✅ |
| Done = evidence | The gate is on the Vercel preview; CI runs pgTAP and the concurrency script; links go in each PR | ✅ |
| Branches ≤ 3 days, about 400 lines per PR | Split into 043a/b/c (R11) | ✅ |
| VIII — rollback runbook | `docs/operations/rollback-043.md` ships in PR 043a (task T008a) | ✅ |

Post-design re-check (after `research.md`, `data-model.md` and `contracts/`): all ✅. The risks the
design closes:
- an editor setting `current_version_no` directly, which would defeat compare-and-swap (closed by
  column grants, R2);
- a retried save after a lost response reporting a false conflict (closed by checking the key
  before the head, R3);
- saving one project's scene into another (closed by the `scene.id` check).

## Project Structure

### Documentation (this feature)

```text
specs/043-cloud-projects/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
└── contracts/
    ├── project-rpc.md     # create_project, save_project_version, table access, pgTAP list
    └── client-sync.md     # status states, autosave, conflict, offline, routes, read-only
```

### Source Code (repository root)

```text
# 043a — database
supabase/migrations/<ts>_cloud_projects.sql      # doc_type, restore kind, keys, audit, functions, grants, triggers
supabase/tests/08_cloud_projects.test.sql        # NEW (contracts/project-rpc.md § pgTAP)
supabase/tests/01_anon · 02_cross_tenant · 03_roles.test.sql   # direct insert now revoked
supabase/seed.sql                                # versions get doc_type 'legacy_v1'; one real kitchen per studio
scripts/test-project-concurrency.mjs             # NEW; package.json db:test:project-concurrency; ci.yml db job
src/infrastructure/supabase/database.types.ts    # regenerated
docs/operations/rollback-043.md                  # NEW rollback runbook (constitution VIII)

# 043b — studio projects
src/infrastructure/projects/cloudProjects.ts     # NEW adapter (client passed in), typed errors
src/persistence/cloudCache.ts                    # NEW cloud_docs / cloud_lists / cloud_queue; projectDb version bump
src/features/projects/cloud/sync.ts              # NEW controller: debounce, queue drain, status
src/features/projects/cloud/SaveStatus.tsx       # NEW indicator
src/features/projects/cloud/useCloudDocument.ts  # NEW open by route (online → head; offline → cache)
src/features/projects/ProjectsHome.tsx           # studio list + "On this device"; row menu
src/features/projects/projectActions.ts          # save → cloud for cloud documents; create/import → studio
src/app/router.ts · App.tsx                      # /s/<slug>/p|h routes
src/state/editorStore.ts · homeStore.ts          # readOnly
src/components/layout/TopBar.tsx                 # indicator, Save version…, View only
src/features/auth/SessionProvider.tsx            # sign-out clears the cloud cache
DELETE src/domain/project/cloud{Types,Persistence,Errors,PersistencePort}.ts (+ tests, index re-exports)
DELETE src/state/cloudProjectStore.ts (+ test), src/infrastructure/persistence/* , bootstrapPersistence in main.tsx
e2e/cloud-projects.spec.ts (US1, US2) · e2e/fixtures helper · URL updates in existing specs

# 043c — conflicts, offline, history
src/features/projects/cloud/ConflictDialog.tsx   # NEW
src/features/projects/cloud/HistoryPanel.tsx     # NEW; read-only version banner; restore
src/features/projects/cloud/sync.ts              # offline chaining, re-base, membership-revoked stop
e2e/cloud-projects.spec.ts (US3, US4, US5) · docs/ACCEPTANCE_TESTS.md · docs/ARCHITECTURE.md (Persistence)
```

**Structure Decision**:
- the adapter is the only project code that talks to Supabase (`src/infrastructure`, FR-015);
- the IndexedDB code stays in `src/persistence` beside `projectDb.ts`, so it shares one database
  and one upgrade path;
- the controller is in `src/features/projects/cloud` because it depends on infrastructure, which
  `src/state` must not;
- `src/domain` and `src/engine` are untouched apart from deletions.

## Complexity Tracking

No constitution violations. Two deliberate choices:
- **audit by trigger**: rename, archive, unarchive and delete are audited by triggers rather than
  four extra RPCs (R2);
- **three PRs**: delivery is split to keep each branch under 3 days (R11).
