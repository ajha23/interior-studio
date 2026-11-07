---
description: "Task list for 043 — Cloud Projects on the Live Schema"
---

# Tasks: 043 — Cloud Projects on the Live Schema

**Input**: Design documents from `specs/043-cloud-projects/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/project-rpc.md](contracts/project-rpc.md), [contracts/client-sync.md](contracts/client-sync.md), [quickstart.md](quickstart.md)

**Tests**: Requested (spec SaaS §8, SC-002, SC-003). Database first: pgTAP and the concurrency
script are written and seen failing before the migration. Unit, RTL and Playwright tests come
before the code they cover.

**Organization**: three PRs (research R11), each mergeable to `main` on its own:
- **043a**: Phases 1–2 (database);
- **043b**: Phase 3 (shared browser foundation), US1 and US2;
- **043c**: US3, US4, US5 and Polish.

**Evidence rule (constitution 2.3.0)**: a task is checked only when its command was run and its
output recorded next to it. **Founder-only**: the production `db push` and the preview gate sign-in.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup (PR 043a)

- [ ] T001 Baseline on `043-cloud-projects`: run `npm run db:reset && npm run db:test` and `npm test`, and record the counts here. Also run a read-only live check: `select doc_count, count(*) from (select count(*) doc_count from public.project_versions group by project_id) x group by 1` and `select count(*) from public.project_versions`, through the Supabase MCP `execute_sql` on production (expect about 129 versions; research "Open risks").
- [ ] T002 Create the migration file with `npx supabase migration new cloud_projects`, giving `supabase/migrations/<ts>_cloud_projects.sql` (empty for now).

---

## Phase 2: Foundational — database (PR 043a; blocks every story)

### Tests first

- [ ] T003 Write `supabase/tests/08_cloud_projects.test.sql` (helper schema `t043`, the impersonation pattern from `03_roles.test.sql`, seeded Alpha/Beta users). Cover every bullet of contracts/project-rpc.md § pgTAP:
  - **grants**: `public.create_project` and `public.save_project_version` (the new 8-argument signature) are executable by `authenticated`, not by `anon` or `public`. The old 6-argument `save_project_version(uuid, jsonb, int, text, version_kind, text)` does not exist. Both private bodies have `proconfig` containing `search_path=""`. `private.audit_log` and `private.idempotency_keys` are not selectable by `authenticated`;
  - **anonymous**: create → `42501`; save → `42501` or `PT404`; `select count(*) from public.projects` = 0;
  - **own studio**:
    - a designer (a3) creates a kitchen (version 1, `doc_type` `kitchen`, the scene's `id` equals the new project id, hash = `encode(extensions.digest(scene::text,'sha256'),'hex')`);
    - a designer saves with expected 1 → version 2;
    - a viewer (a4) save → `42501`;
    - a viewer `update projects set name` affects 0 rows;
  - **other studio**:
    - Beta's designer (b3) creating with `p_org` = Alpha → `42501`;
    - saving to an Alpha project → `PT404`;
    - rename, archive and delete of an Alpha project affect 0 rows;
    - Alpha's rows are intact;
  - **CAS**: expected = head−1 → `PT409`, with the detail JSON `current_version_no` = head; expected = head → head+1;
  - **idempotency**:
    - the same key twice gives one new version and identical `id` and `version_no`, including after another save moved the head in between;
    - the same key by another user is independent;
    - `create_project` with a repeated key returns the same project;
  - **size**: a scene of 2 000 001 bytes → `PT413`, with no new version and no new audit row;
  - **scene id**: `p_scene->>'id'` ≠ project id → `22023`; `p_doc_type 'legacy_v1'` → `22023`; `p_kind 'revision'` → `22023`;
  - **archived**:
    - a designer sets `archived_at` → the trigger stamps `now()`;
    - a save → `PT423`;
    - unarchive (`archived_at = null`) works for a designer;
    - a designer delete affects 0 rows;
    - an admin (a2) delete of an active project affects 0 rows;
    - an admin delete of an archived project affects 1 row, and its `project.delete` audit row still exists;
  - **audit**:
    - exactly one row each for `project.create`, `version.save`, `project.rename`, `project.archive`, `project.unarchive` and `project.delete`, with the right `actor_id`, `org_id` and `family = 'versions'`;
    - as `postgres`, `update`, `delete` and `truncate private.audit_log` all raise;
  - **column grants**: a designer `update projects set current_version_no = 99` → `42501`; so do `set org_id` and `set created_by`;
  - **backfill**: no `project_versions` row created by the seed has a `doc_type` other than `legacy_v1`, except the T008 kitchens; `doc_type` has no column default;
  - **restore kind**: a save with `p_kind 'restore'` works.

  Run `npm run db:test` and record that 08 fails before the migration.
- [ ] T004 [P] Update `supabase/tests/01_anon.test.sql`, `02_cross_tenant.test.sql` and `03_roles.test.sql` for the revoked direct insert and update on `projects`:
  - the "designer can create a project" positive control becomes `create_project`;
  - the denied direct inserts still count as denied (42501);
  - adjust `plan(n)`.

  The other assertions are unchanged.
- [ ] T005 [P] Write `scripts/test-project-concurrency.mjs`, modelled on `scripts/test-ai-concurrency.mjs` (local URL only, the service key only for setup and cleanup):
  - create a throwaway studio, a designer, and a project through `create_project` as that designer;
  - (a) two clients call `save_project_version` with expected 1 at the same time: exactly one returns version 2 and the other `PT409`;
  - (b) two clients call it with the **same** key and expected 2 at the same time: exactly one version 3 exists, and both responses have the same `id`;
  - print `OK` and exit 0, or the failure and exit 1;
  - clean up.

  Add `"db:test:project-concurrency": "node scripts/test-project-concurrency.mjs"` to `package.json`, and a step after `db:test:concurrency` in the `db` job of `.github/workflows/ci.yml`.

### Implementation

- [ ] T006 Write the migration `supabase/migrations/<ts>_cloud_projects.sql` (data-model.md, contracts/project-rpc.md):
  1. `create type public.doc_type as enum ('kitchen','home','legacy_v1')`, then `alter type public.version_kind add value 'restore'`;
  2. `alter table public.project_versions add column doc_type public.doc_type`, then `update … set doc_type = 'legacy_v1'`, then `alter column doc_type set not null` (**no default**);
  3. `private.idempotency_keys` (PK `(org_id, actor_id, op, key)`, `op` check in `('save_version','create_project')`, `project_id`, `version_id`, `created_at default now()`, FK `org_id` → organizations on delete cascade), with `revoke all … from public, anon, authenticated`;
  4. `private.audit_log`:
     - `id bigint generated always as identity`, `org_id uuid not null` (no FK), `actor_id uuid`, `family text not null check (family in ('auth','members','clients','quotes','versions','production','commercial','share_links'))`, `action text not null`, `target_id uuid`, `detail jsonb not null default '{}'`, `at timestamptz not null default now()`;
     - `revoke all`;
     - a `before update or delete` row trigger and a `before truncate` statement trigger that `raise exception using errcode = 'PT403', message = 'audit_log is append-only'`;
  5. `private.audit(p_org, p_action, p_target, p_detail)`, an internal helper with `search_path = ''`;
  6. `private.create_project` and `private.save_project_version` (definer, `search_path = ''`, every name qualified), with steps exactly as in contracts/project-rpc.md:
     - the error codes from research R5;
     - the hash via `extensions.digest`;
     - the size limit `octet_length(p_scene::text) > 2000000`;
     - the message trimmed with `left(btrim(p_message), 500)`;
     - the idempotency `insert … on conflict do nothing`, then a lookup;
  7. the `public` invoker wrappers with the same signatures;
  8. `drop function public.save_project_version(uuid, jsonb, int, text, public.version_kind, text)`;
  9. revoke and grant execute: revoke from `public, anon` on all four functions; grant to `authenticated` on all four (as in 045);
  10. `revoke insert, update on public.projects from authenticated`, then `grant update (name, client_name, site_address, status, archived_at) on public.projects to authenticated`;
  11. recreate `projects_update` with `with check (private.can_edit_org(org_id))`, and `projects_delete` as `using (private.can_admin_org(org_id) and archived_at is not null)`;
  12. triggers:
      - `private.projects_stamp()` (before update): set `updated_at`, `updated_by = auth.uid()`; set `archived_at` to `now()` when it goes from null to not null; keep the old value when it moves from one non-null value to another;
      - `private.projects_audit()` (definer, after update or delete): the action is `project.rename` if the name changed, else `project.archive` or `project.unarchive` on an `archived_at` change, else `project.update`, or `project.delete`; the detail has the old and new names; it skips updates made inside the save function (only `current_version_*`/`updated_*` changed);
  13. `private.purge_idempotency_keys()`: delete rows older than 7 days; not scheduled.

  Run `npm run db:reset && npm run db:test` and record 08 and 01–07 passing.
- [ ] T007 Run `npm run db:test:project-concurrency` and record `OK`.
- [ ] T008 Update `supabase/seed.sql`:
  - set `doc_type 'legacy_v1'` explicitly on the existing seeded versions (they are fake scenes);
  - add one real kitchen per studio, `Alpha Cloud Kitchen` / `Beta Cloud Kitchen`, created with `private.create_project` as that studio's designer and `set_config('request.jwt.claims', …)`, using the scene from `createProject(DEFAULT_ROOM, 'straight')` stored as a JSON fixture `supabase/fixtures/kitchen-v2.json`, generated by a one-off script and committed.

  Run `npm run db:reset && npm run db:test` and record the result.
- [ ] T009 Regenerate the types with `npm run db:types && npm run db:types:check`, and record a clean check (`src/infrastructure/supabase/database.types.ts`).
- [ ] T010 Run the full check from AGENTS.md, plus `db:reset`, `db:test` and `db:test:project-concurrency`. Open **PR 043a** (spec, plan, migration and tests). After CI is green and the PR has merged, the **founder** runs `npx supabase db push` to production, and we record `select doc_type, count(*) from project_versions group by 1` (all `legacy_v1`).

**Checkpoint**: the database contract is proven. The app still uses local storage only.

---

## Phase 3: Foundational — browser (PR 043b; blocks US1–US5)

- [ ] T011 [P] Unit tests first in `src/infrastructure/projects/cloudProjects.test.ts`, with a fake client that records calls. They cover:
  - `listProjects(client, orgId)`, using the select string from contracts/project-rpc.md;
  - `openHead`, `createProject`, `saveVersion`, `renameProject`, `setArchived` and `deleteProject`;
  - error mapping: `PT409` → `{kind:'conflict', currentVersionNo}`, `PT413` → `too_large`, `PT423` → `archived`, `PT404` → `not_found`, `42501` → `forbidden`, a fetch `TypeError` → `offline`, and anything else → `server`;
  - 0 rows from update or delete → `forbidden`, never success;
  - the absence of any module-level client.
- [ ] T012 Implement `src/infrastructure/projects/cloudProjects.ts`:
  - every function takes `client: AppSupabaseClient` as its first argument;
  - the scene is rebuilt as an envelope and parsed with `parseProjectFile` or `parseHomeFile` (research R6);
  - a `legacy_v1` head returns `{kind:'legacy'}`.

  Make T011 pass.
- [ ] T013 [P] Tests first in `src/persistence/cloudCache.test.ts` (fake-indexeddb):
  - put and get on `cloud_docs` and `cloud_lists`;
  - `cloud_queue` enqueues, lists in order per `[userId, orgId, projectId]`, removes and re-bases;
  - `clearUser(userId)` removes everything for that user only;
  - upgrading from the current database version keeps the existing `projects`, `homes`, `packages` and `assets` data (extend `projectDbUpgrade.test.ts`).
- [ ] T014 Implement `src/persistence/cloudCache.ts` and bump the `projectDb.ts` database version, adding the three stores in `upgrade` (data-model.md § Browser). Make T013 pass.
- [ ] T015 [P] Read-only in the stores, tests first in `src/state/editorStore.test.ts` and `homeStore.test.ts`:
  - with `readOnly = true`, `dispatch`, `applyTransaction`, `undo` and `redo` change nothing, and `dispatch` returns the error `View only: ask a studio owner for edit access.`;
  - the home store's `updateRoom`, `restyle` and `rename` do nothing.

  Implement `readOnly` and `setReadOnly` in `src/state/editorStore.ts` and the guard in `src/state/homeStore.ts`.
- [ ] T016 Delete the 034.x cloud code (FR-016):
  - `src/domain/project/cloudTypes.ts`, `cloudPersistence.ts`, `cloudPersistence.test.ts`, `cloudErrors.ts` and `cloudPersistencePort.ts`, and their 4 re-exports in `src/domain/index.ts`;
  - `src/state/cloudProjectStore.ts` and its test;
  - all of `src/infrastructure/persistence/`;
  - `bootstrapPersistence` in `src/main.tsx`;
  - the two assertions in `src/test/monorepoPackages.test.ts` (`SaaSProjectSchema`, `commitSpaceRevision`).

  Record that `grep -rnE "cloudTypes|spaces|design_revisions|SupabaseClientLike|createBrowserSupabaseClient|InMemoryPersistenceAdapter|persistenceFactory" src` finds nothing outside archives (SC-004), and that `npm run lint && npm run typecheck && npm test` passes.
- [ ] T017 Routes, tests first in `src/app/router.test.ts`, then `src/app/router.ts`. Add these, and keep every existing route:
  - `cloud-kitchen {slug, projectId}` → `#/s/<slug>/p/<uuid>`;
  - `cloud-home {slug, homeId}` → `#/s/<slug>/h/<uuid>`;
  - `cloud-room {slug, homeId, roomId}` → `#/s/<slug>/h/<uuid>/room/<roomId>`.
- [ ] T018 Sign-out clears the cloud cache: `src/features/auth/SessionProvider.tsx` calls `clearUser(userId)` (and the sync controller's `reset()`) on sign-out. Add a test in `SessionProvider.test.tsx`.

**Checkpoint**: the adapter, cache, read-only mode and routes exist. Nothing in the UI uses them yet, and the app still runs.

---

## Phase 4: User Story 1 — My projects are in my studio (P1) 🎯 MVP (PR 043b)

**Goal**: the studio's projects are listed, created, opened, renamed, archived, unarchived and
deleted in the database. Browser-only projects stay under "On this device".

**Independent test**: create a project in browser A; open it in browser B, signed in to the same
studio; the design is identical.

- [ ] T019 [P] [US1] Write `e2e/cloud-projects.spec.ts` § US1 (local stack, designer.a), plus a helper `e2e/fixtures/cloud.ts` with `createStudioKitchen(page, name)` and `waitSaved(page)`:
  - create "Cloud kitchen 1" and add a base cabinet; wait for Saved;
  - in a **new browser context** with the same stored session, the project is listed with owner `designer.a` and opens with the same cabinet count and width;
  - rename, then reload: the name persists;
  - archive: hidden; "Show archived": listed; unarchive;
  - as admin.a, archive, then Delete only after typing the name; gone after reload; the Delete control is absent for designer.a;
  - Beta's designer opening Alpha's URL sees "This project isn't in this studio";
  - "On this device": a kitchen saved to IndexedDB before (seeded through `page.evaluate` into the `projects` store) is listed there and opens at `#/project/<id>`;
  - a seeded `legacy_v1` project shows "Older format: opens after the import update" and doesn't open.
- [ ] T020 [P] [US1] RTL tests first, in `src/features/projects/ProjectsHome.test.tsx`, with a fake adapter:
  - the studio list columns (name, client, kitchen/home badge, last updated, owner);
  - the row menu by role (viewer: none; designer: Rename and Archive/Unarchive; admin also Delete on archived only);
  - the "Show archived" toggle (off by default);
  - the "On this device" section;
  - the delete confirmation needs the exact name;
  - offline: create, rename, archive, delete and import are disabled with "You're offline — this needs a connection."
- [ ] T021 [US1] Rewrite `src/features/projects/ProjectsHome.tsx`:
  - it takes the studio membership as a prop;
  - the studio list comes from `listProjects`, and from `cloud_lists` with the offline banner;
  - "New project", "New home" (`NewHomeCard` → `createProject` with `doc_type 'home'`) and "Import" create studio projects through `createProject`, then navigate to the cloud route;
  - the device section keeps today's list, export and delete code;
  - the header subtitle changes from "projects are stored in this browser" to the studio name.

  Make T020 pass.
- [ ] T022 [US1] Open cloud documents in `src/features/projects/cloud/useCloudDocument.ts` and `src/app/App.tsx`:
  - the cloud routes render inside `StudioGate`;
  - online, `openHead` puts the result in the cache, then `editorStore.openProject`, or `homeStore.openDocument(home, {cloud})`;
  - offline, the cache is used with the banner "Offline — showing the copy on this device";
  - `not_found` or `forbidden` → "This project isn't in this studio" with a link back;
  - `legacy` → the older-format message;
  - `readOnly` is set from the membership role (`viewer` → true).

  Add `openDocument` to `src/state/homeStore.ts` (it sets the home without IndexedDB).
- [ ] T023 [US1] Point the save entry points at the cloud for cloud documents: in `src/features/projects/projectActions.ts`, `saveCurrentProject(message?)` checks the open document's origin (cloud → `sync.saveVersion`; device → today's code). The callers stay unchanged: TopBar, `useShortcuts`, the command palette and the command line.
- [ ] T024 [US1] "Packages and photos are on this device only": a note in the deliverables view for cloud projects (`src/features/deliverables/DeliverablesView.tsx`), with an RTL assertion.
- [ ] T025 [US1] Update the existing e2e specs that check `#/project/` URLs or rely on local-only projects (find them with `grep -rn "#/project\|/project/" e2e`; keep `auth.spec.ts`'s deep-link cases). Run `npx playwright test e2e/cloud-projects.spec.ts --grep US1` and the touched specs, and record the result.

**Checkpoint**: US1 works with manual saves (Ctrl+S → `manual`).

---

## Phase 5: User Story 2 — Autosave with a clear status (P1) (PR 043b)

**Goal**: saves happen 2 s after the last change; the status reads Saved, Saving…, Offline, Conflict or Error; viewers are read-only.

**Independent test**: make an edit; within about 2 s the indicator shows Saving… then Saved, and a new autosave version exists.

- [ ] T026 [P] [US2] Unit tests first in `src/features/projects/cloud/sync.test.ts` (fake timers, fake adapter, fake-indexeddb):
  - 3 changes 500 ms apart → exactly 1 `autosave`, 2 s after the last;
  - `saveVersion('client review')` → `manual` at once, cancelling a pending autosave of the same scene;
  - each save writes `cloud_queue` before sending and removes the entry after success;
  - the expected version is the last known head;
  - status transitions `saved → saving → saved`;
  - `too_large`, `archived` or a server error → `error`, and Retry resends the same key;
  - a timeout then a retry with the same key → one version (adapter double);
  - `readOnly` → nothing is queued;
  - a home: a change in a room saves the whole home (`doc_type 'home'`).
- [ ] T027 [US2] Implement `src/features/projects/cloud/sync.ts`, a zustand store per open cloud document (contracts/client-sync.md):
  - `attach({client, userId, orgId, projectId, docType, head})`, `detach()`, `saveVersion(message?)`, `retry()` and `reset()`;
  - it subscribes to `editorStore.revision` and `homeStore.dirty`;
  - on success it calls `markSaved` / sets `dirty false`.

  Make T026 pass.
- [ ] T028 [P] [US2] RTL tests first in `src/features/projects/cloud/SaveStatus.test.tsx`: each of the 5 states renders its exact text from contracts/client-sync.md with `role="status"`; Retry calls `retry`; viewers see "View only".
- [ ] T029 [US2] Implement `src/features/projects/cloud/SaveStatus.tsx`, and place it in `src/components/layout/TopBar.tsx` and the home plan header in `src/features/home/HomeView.tsx`. Add "Save version…" to the TopBar: a small form with an optional message (max 500) that calls `saveVersion(message)`.
- [ ] T030 [US2] Add e2e `e2e/cloud-projects.spec.ts` § US2:
  - an edit → Saving… → Saved within 5 s;
  - reload → the edit is there;
  - a version list query (History arrives in US5; until then, the e2e asserts through `page.evaluate` with the supabase client) shows an `autosave`;
  - Ctrl+S with a message → `manual`;
  - as viewer.a: "View only", the inspector width field is disabled or refused, and **no** request to `/rest/v1/rpc/save_project_version` (record the requests with `page.on('request')`).

  Run it and record the result.
- [ ] T031 Run the full check from AGENTS.md and record it. Open **PR 043b** with the CI link. A person signs in on the preview, creates a project, and opens it on a second device; record the preview URL.

**Checkpoint**: MVP: studio projects with autosave, on any device.

---

## Phase 6: User Story 3 — Never lose a concurrent edit (P1) (PR 043c)

**Goal**: conflicting saves are detected and resolved explicitly.

**Independent test**: two tabs edit one project; the second save shows the conflict dialog; after
resolving, every saved version still exists.

- [ ] T032 [P] [US3] Unit tests first in `sync.test.ts`:
  - a `conflict` stops the drain, sets status `conflict`, keeps the entries and exposes `currentVersionNo`;
  - `saveMineOnTop()` sends the current scene with `expected = currentVersionNo` and a new key, then re-bases the waiting entries;
  - `loadTheirs()` (after confirmation) clears this project's queue, opens the head and resets undo.
- [ ] T033 [P] [US3] RTL tests first in `src/features/projects/cloud/ConflictDialog.test.tsx`:
  - the title "Someone else saved this project", naming who saved the newer version and when;
  - "Load theirs" asks "Discard your unsaved changes?" first;
  - "Save mine on top" calls the controller;
  - closing keeps the state at Conflict, and the indicator reopens the dialog.
- [ ] T034 [US3] Implement `src/features/projects/cloud/ConflictDialog.tsx` and `saveMineOnTop`/`loadTheirs` in `sync.ts`; mount the dialog in `Workspace` and `HomeView`. Make T032 and T033 pass.
- [ ] T035 [US3] Add e2e § US3: two pages (same context) open one project, both edit, page 1 saves, page 2 saves → Conflict dialog. "Save mine on top" → the head is N+2, and both N+1 and N+2 exist. Repeat with "Load theirs" → page 2 shows page 1's width. Run it and record the result.

---

## Phase 7: User Story 4 — Keep working offline (P2) (PR 043c)

**Goal**: edits made offline are queued in IndexedDB and sent in order on reconnect.

**Independent test**: Playwright `setOffline(true)`, three edits, `setOffline(false)`: three versions saved in order.

- [ ] T036 [P] [US4] Unit tests first in `sync.test.ts`:
  - an `offline` error or `navigator.onLine false` → status `offline` with N queued;
  - each debounced snapshot is queued with `expected = previous + 1`;
  - the `online` event drains in order;
  - the queue survives a new controller instance (a reload);
  - a `conflict` mid-drain stops it and the remaining entries wait;
  - `forbidden` or `not_found` on drain → `error` with "You no longer have edit access to this studio. Your changes are kept on this device.", and the entries are kept.
- [ ] T037 [US4] Implement offline chaining, the `online`/`offline` listeners, drain on attach and the stop-on-revoked behaviour in `sync.ts`. Disable create, rename, archive, unarchive, delete, import, Restore and History offline, with "You're offline — this needs a connection." (`ProjectsHome.tsx`, `HistoryPanel.tsx`). Make T036 pass.
- [ ] T038 [US4] Add e2e § US4:
  - `context.setOffline(true)`, then 3 width edits, 3 s apart → "Offline (queued 3)";
  - `setOffline(false)` → Saved; the versions are head+1, +2 and +3 in order, with the expected widths;
  - offline, then reload → the project opens from the cache with the banner (FR-011a);
  - the Projects page offline shows the last list with the banner.

  Run it and record the result.

---

## Phase 8: User Story 5 — Version history (P2) (PR 043c)

**Goal**: see who saved what and when, open an old version, and restore it.

**Independent test**: History lists versions newest first; opening one shows it read-only with a
banner; Restore adds a new version on top.

- [ ] T039 [P] [US5] RTL tests first in `src/features/projects/cloud/HistoryPanel.test.tsx`:
  - rows show number, kind, author, time and message, newest first, 50 at a time with "Show more";
  - **Open** calls `openVersion`;
  - the banner reads "Viewing version N (kind, author, time) · Back to latest · Restore";
  - **Restore** calls `saveVersion` with kind `restore`, message `Restored version N` and `expected = head`.
- [ ] T040 [US5] Implement `listVersions` and `openVersion` in `cloudProjects.ts` (with unit tests in T011's file), and `src/features/projects/cloud/HistoryPanel.tsx`, opened from the TopBar and the home header. Opening a past version sets `readOnly` and pauses `sync`; Back to latest restores both. Make T039 pass.
- [ ] T041 [US5] Add e2e § US5: make 2 saves, open History, Open v1 → the banner and read-only; Restore → the head is a new `restore` version with v1's design; v1, v2 and v3 all still exist. Run it and record the result.

---

## Phase 9: Polish & cross-cutting (PR 043c)

- [ ] T042 [P] `docs/ACCEPTANCE_TESTS.md`: add the 043 scenarios (US1–US5, FR-001a, FR-011a) with their e2e and pgTAP names.
- [ ] T043 [P] `docs/ARCHITECTURE.md` § Persistence: studio documents (functions, `doc_type`, cache and queue, the sync controller); "On this device" until 044. Update `docs/DOMAIN_MODEL.md` only if needed; no schema change is expected.
- [ ] T044 [P] SC-001: run `scripts/measure-save.mjs`, a one-off timing script that is not committed, against **production** with a 125 KB home fixture: 30 saves, then the p95. Record the result in the PR (staging arrives in 048).
- [ ] T045 Update `specs/FOUNDATION-PLAN.md`: 045 merged (PR #17); 043 in review, then done with the PR numbers.
- [ ] T046 Run the full check from AGENTS.md, plus `db:reset`, `db:test` and both concurrency scripts. Record the exact output. Open **PR 043c** with the CI link.
- [ ] T047 **Gate (founder)**: on the Vercel preview, signed in:
  - open one project on a laptop and a phone browser;
  - force a conflict between two tabs;
  - go offline and back.

  Record the preview URL, then archive and delete the gate projects (previews share the production database until 048).
- [ ] T048 Run `/speckit-converge` and record any follow-ups.

---

## Dependencies & execution order

- Phase 1 → Phase 2 (database; **PR 043a** merges and is pushed to production) → Phase 3 → US1 → US2 (**PR 043b**) → US3 → US4 → US5 → Polish (**PR 043c**).
- US3 and US4 both extend `sync.ts`, so do them in order. US5 depends only on Phase 3 and US1, so it can run alongside US3 or US4.
- Tests come before the implementation in every phase.

### Parallel opportunities

- Phase 2: T004 and T005 alongside T003.
- Phase 3: T011, T013 and T015 (different files), then T017.
- US1: T019 and T020 together. US2: T026 and T028 together. US3: T032 and T033. Polish: T042, T043 and T044.

## Implementation strategy

MVP = PRs 043a and 043b (database, plus US1 and US2): studio projects with autosave, usable on two
devices. 043c adds safety (conflicts, offline) and history. 043c's gate (T047) is the spec's gate.
