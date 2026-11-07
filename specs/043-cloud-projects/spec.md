# Feature Specification: 043 — Cloud Projects on the Live Schema

**Feature Branch**: `043-cloud-projects`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 1 — Identity and one database (estimate 5–6 days)
**Depends on**: 042
**Blocks**: 044, 046, 047
**Source**: Architecture Review (Database; Frontend: local-first without server; UI/UX: saving is a modal) and Playbook (043)

## Context

Projects are stored only in the browser's IndexedDB (`src/persistence/projectDb.ts`). The 034.x cloud adapter targets tables (`spaces`, `design_revisions`) that do not exist in the live schema, and its `from()` throws. The live schema has `projects` and `project_versions` and a `save_project_version` function. Measured scene sizes are small (kitchen 14 KB / 1.8 KB gzipped; 2BHK home 125 KB / 5 KB gzipped), so full snapshots in Postgres are the right choice at launch.

This spec saves both current document types to the live tables with compare-and-swap and idempotency, keeps IndexedDB as an offline cache and queue, and replaces the "Cloud Sync" modal with autosave and a quiet status.

## Clarifications

### Session 2026-11-07

- Q: Before spec 044 (import) ships, what should the Projects list do with projects that exist only in this browser? → A: Show cloud projects, plus a separate "On this device" section; those open and save locally as today and are not uploaded until 044.
- Q: Should designers be able to create, rename or archive a cloud project while offline, or should only edits to an open project queue up offline? → A: Only version saves queue offline; create, rename and archive need a connection and are disabled offline with a clear "You're offline" message.
- Q: When a designer opens a cloud project while offline, should it open from this device's copy? → A: Yes. Every cloud project opened or saved on this device is cached (keyed by user and studio, cleared on sign-out) and opens offline with the banner "Offline — showing the copy on this device"; the Projects list shows the last known list.
- Q: Should a cloud project's client packages and site photos stay on this device for now, or move to the studio in 043? → A: Stay on this device, linked to the cloud project id, with the note "Packages and photos are on this device only" until a later spec (047 storage) moves them.
- Q: Besides archiving, should cloud projects be restorable from the archive and permanently deletable, and by whom? → A: Owner, admin and designer can archive and unarchive; only owner and admin can permanently delete, only an archived project, after typing its name to confirm; every action is audited.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — My projects are in my studio (Priority: P1)

As a designer, I want my projects saved to my studio and openable on any device, so that I never lose work and my colleagues see the same design.

**Why this priority**: The core promise of the cloud foundation.

**Independent Test**: Create a project in browser A; open it in browser B signed into the same studio; the design is identical.

**Acceptance Scenarios**:

1. **Given** I am in studio A, **When** I open Projects, **Then** I see studio A's projects from `public.projects` with name, client, status, last updated and owner.
2. **Given** I create a kitchen project or a whole home, rename it, or archive it, **When** I reload, **Then** the change persists and archived projects are hidden by default with a filter to show them.
3. **Given** I edited a project in browser A and autosave completed, **When** I open it in browser B, **Then** the scene is identical (same entities, dimensions and materials).

---

### User Story 2 — Autosave with a clear status (Priority: P1)

As a designer, I want my work saved automatically and a quiet indicator that tells me the state, so that saving is never a task.

**Independent Test**: Make an edit; within ~2 s the indicator shows Saving then Saved and a new autosave version exists.

**Acceptance Scenarios**:

1. **Given** I make an edit, **When** 2 s pass with no further command, **Then** an `autosave` version is saved and the indicator reads Saved.
2. **Given** I choose Save version with an optional message, **When** it completes, **Then** a `manual` version with that message exists.
3. **Given** a save is in flight, **When** I look at the indicator, **Then** it reads Saving; on failure it reads the error state with a retry action.
4. **Given** I am a viewer, **When** I open a project, **Then** it opens read-only, editing commands are disabled, and no save is attempted.

---

### User Story 3 — Never lose a concurrent edit (Priority: P1)

As a designer working with colleagues, I want conflicting saves detected and resolved explicitly, so that nobody's work is silently overwritten.

**Independent Test**: Two tabs edit one project; the second save shows the conflict dialog; after resolving, every saved version still exists.

**Acceptance Scenarios**:

1. **Given** tabs 1 and 2 both opened version N, **When** tab 1 saves N+1 and tab 2 then saves, **Then** the database rejects tab 2 with a conflict, the indicator reads Conflict, and a dialog opens.
2. **Given** the conflict dialog, **When** I choose "Load theirs", **Then** the editor loads the latest version and my unsaved change is discarded only after I confirm.
3. **Given** the conflict dialog, **When** I choose "Save mine on top", **Then** my scene is saved as version N+2 with expected head N+1, and versions N+1 and N+2 both exist.

---

### User Story 4 — Keep working offline (Priority: P2)

As a designer on a weak connection, I want edits saved locally and sent in order when I reconnect, so that losing the network never loses work.

**Independent Test**: Playwright `setOffline(true)`, three edits, `setOffline(false)`: three versions saved in order.

**Acceptance Scenarios**:

1. **Given** I am offline, **When** I make edits, **Then** the indicator reads Offline (queued) and each pending save is stored in IndexedDB.
2. **Given** three queued saves, **When** the connection returns, **Then** they are sent in order with their idempotency keys and the indicator returns to Saved.
3. **Given** a queued save conflicts on reconnect, **When** it is rejected, **Then** the conflict dialog opens and remaining queued saves wait.

---

### User Story 5 — Version history (Priority: P2)

As a designer, I want to see who saved what and when, open an old version and restore it, so that I can recover from mistakes.

**Acceptance Scenarios**:

1. **Given** a project, **When** I open History, **Then** I see versions with author, time, kind (autosave/manual/restore) and message, newest first.
2. **Given** a past version, **When** I open it, **Then** it shows read-only with a banner naming the version.
3. **Given** a past version, **When** I choose Restore, **Then** it is saved as a new version on top of the head; nothing is deleted.

### Edge Cases

- Scene larger than 2 MB: the RPC rejects it with a clear message; the editor keeps the local copy and shows the error.
- Retried save after a timeout where the first attempt committed: same idempotency key returns the same version; no duplicate.
- Project archived by someone else while open: next save fails with a clear message; edits stay in the local cache.
- A legacy version (`legacy_v1`) is the head of a project: it is not opened by the current editor (handled in 044).
- Membership revoked mid-session: saves fail under RLS; queued saves remain local and the user is told.
- Clock skew between devices: ordering uses server `version_no`, never client time.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Projects list MUST read `public.projects` for the current studio only and support create, rename, archive and unarchive (owner, admin, designer), and permanent delete (owner and admin only, only for an archived project, after typing the project name to confirm).
- **FR-001a**: Browser-only projects (kitchens and homes already in IndexedDB) MUST appear in a separate "On this device" section of the Projects list, open and save locally exactly as before, and MUST NOT be uploaded until the 044 import flow moves them. Cloud projects are the default list.
- **FR-002**: A migration MUST add `doc_type` (`'kitchen' | 'home' | 'legacy_v1'`) to `project_versions` and backfill existing rows as `legacy_v1`.
- **FR-003**: A migration MUST extend `save_project_version` with `p_expected_version_no` (compare-and-swap: raise a distinct conflict error when `projects.current_version_no` differs) and `p_idempotency_key` (a retried save returns the original version).
- **FR-004**: The scene hash MUST be computed in the database, never accepted from the client.
- **FR-005**: The save function MUST set `search_path = ''`, use schema-qualified names, derive the user from `auth.uid()`, accept no actor id, and have `EXECUTE` revoked from `public` and `anon` and granted only to `authenticated` (constitution XI).
- **FR-006**: The save function MUST reject scenes over 2 MB with a typed error.
- **FR-007**: Idempotency records MUST be unique on `(org_id, actor_id, op, key)` using `insert … on conflict do nothing`; records older than 7 days MAY be purged.
- **FR-008**: Each successful save, rename, archive, unarchive and delete MUST write one row to a single append-only audit table (ported pattern from 034.x); no update or delete on that table is permitted, and audit rows MUST outlive a deleted project (no cascade from `projects`).
- **FR-009**: Autosave MUST fire 2 s after the last editor command with kind `autosave`; explicit save uses kind `manual` with optional message; restore uses kind `restore`.
- **FR-010**: The status indicator MUST show exactly one of: Saved, Saving, Offline (queued), Conflict, Error.
- **FR-011**: Offline saves MUST be queued in IndexedDB and sent in order on reconnect; the queue MUST survive reload. Only version saves are queued: create, rename and archive need a connection and MUST be disabled offline with the message "You're offline — this needs a connection."
- **FR-011a**: Every cloud project opened or saved on this device MUST be cached in IndexedDB (scene and head `version_no`, keyed by user id and studio id). Offline, it MUST open from that cache with the banner "Offline — showing the copy on this device", and the Projects list MUST show the last known list. The cache MUST be cleared on sign-out.
- **FR-012**: The conflict dialog MUST offer "Load theirs" and "Save mine on top"; no silent overwrite.
- **FR-013**: Viewers MUST open projects read-only; `private.can_edit_org` decides in the database; owner, admin and designer may save.
- **FR-014**: Rooms of a home MUST remain inside the home document; no separate rooms table.
- **FR-015**: There MUST be one persistence adapter on `supabase-js` under `src/infrastructure`, with no module-level default instance.
- **FR-016**: Delete: `SupabaseClientLike` and `createBrowserSupabaseClient`; `InMemoryPersistenceAdapter` outside tests; `persistenceFactory`'s environment bootstrapping; `CloudProjectModal.tsx`; `cloudProjectStore` code and `cloudTypes` for `spaces` and `design_revisions`.
- **FR-017**: `src/domain` and `src/engine` MUST stay framework-free; no Supabase import there.

### Key Entities

- **Project**: id, org_id, name, client, status, owner, current_version_no, archived_at.
- **Project version**: project_id, version_no, doc_type, kind, message, scene (jsonb), scene_hash, created_by, created_at.
- **Idempotency record**: org_id, actor_id, op, key, result version, created_at.
- **Audit event**: org_id, actor_id, action, target, at (append-only).
- **Local queue entry** (IndexedDB): project_id, expected_version_no, idempotency_key, scene, queued_at.

## Success Criteria *(mandatory)*

- **SC-001**: Save p95 under 500 ms for a 125 KB home on staging (re-measured at scale in 052).
- **SC-002**: Zero lost versions across the two-tab conflict test and the offline test.
- **SC-003**: A retried save with the same key creates exactly one version (pgTAP).
- **SC-004**: All `cloudTypes`/`spaces`/`design_revisions` references are gone from `src` outside archives.

## Assumptions

- Every version is kept for now; 052 thins old autosaves.
- Server state stays in the existing store; TanStack Query arrives in 049.
- The 129 existing versions are backfilled as `legacy_v1` and handled in 044.

## Out of Scope

`legacy_v1` projects (044), render storage, AI, real-time co-editing. Client packages and site photos of a cloud project stay in this device's IndexedDB, linked to the cloud project id, and the project shows "Packages and photos are on this device only"; moving them to Storage is a later spec (047).

## Gate

Open the same project on a laptop and a phone browser; force a conflict between two tabs; go offline and back. All three behave as specified.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-projects`
- **Parent Module**: none
- **Module Capabilities**: list, create, rename, archive, save version, view history, restore.
- **Dependencies on Other Modules**: `module-platform-identity` (042).

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec — project storage is available to every studio.

### 3. Usage and Commercial Limits
- **Applicable Quotas**: none yet; per-scene size limit 2 MB is a safety limit, not a commercial quota.
- **Behavior When Limits Are Reached**: typed error, local copy kept.

### 4. RBAC Requirements
- **Required Permissions**: read — any member; save, rename, archive, unarchive — owner, admin, designer (`private.can_edit_org`); permanent delete of an archived project — owner, admin (`private.can_admin_org`).
- **Applicable Roles**: owner, admin, designer, viewer.
- **Resource-Level Permissions**: studio-wide (no per-project assignment yet).

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: `projects`, `project_versions`, idempotency records, audit events.
- **Tenant Isolation Requirements**: `org_id` on every row; RLS via `private.is_org_member` / `can_edit_org`; the save function derives the studio from the project row, never from an argument.
- **Storage and Cache Isolation**: IndexedDB cache and queue keyed by user id and studio id; cleared on sign-out.
- **Background Worker Tenant Context**: none.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Frontend**: viewers get read-only editor; enforcement is in the database.
- **Backend**: RLS and the save function; conflict and size errors are typed.
- **Audit**: one append-only audit row per save, rename, archive, unarchive and delete.

### 8. Acceptance Criteria and Security Tests
- **Tenant Isolation Tests**: studio B user cannot read, save to, rename or archive studio A projects or versions (pgTAP and Playwright).
- **RBAC Permission Tests**: viewer save is rejected (pgTAP); designer save succeeds; designer delete is rejected; admin delete of a non-archived project is rejected; admin delete of an archived project succeeds.
- **Concurrent Usage Tests**: two concurrent saves with the same expected head — exactly one succeeds, the other gets a conflict (pgTAP on independent connections).
- **Idempotency Tests**: same key twice — one version, identical response.
- **Audit Tests**: update/delete on the audit table is rejected.
