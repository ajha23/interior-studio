# 034 — Project Foundation and Cloud Persistence: Tasks

Tasks are ordered. Keep each task independently reviewable and preserve a runnable application after each increment. Do not implement later lifecycle features in this feature.

## T0 — Baseline and contracts
- [ ] T001 Record current `refactorV2` commit SHA and existing check results.
- [ ] T002 Read and reconcile `AGENTS.md`, `docs/PRD.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN_MODEL.md` and relevant specs.
- [ ] T003 Define canonical identifier mapping between current string IDs and database UUIDs.
- [ ] T004 Define repository interfaces for Client, Project, Space and DesignRevision.
- [ ] T005 Define canonical permission keys and resource context contract.

## T1 — Database foundation
- [ ] T101 Design additive migrations for project/client/space/revision relationships.
- [ ] T102 Add tenant-consistent unique constraints and foreign keys.
- [ ] T103 Add RLS to every new tenant-owned table.
- [ ] T104 Add explicit SELECT/INSERT/UPDATE/DELETE policies.
- [ ] T105 Add same-tenant relationship constraints.
- [ ] T106 Add revision and project lookup indexes.
- [ ] T107 Add migration tests against clean database and representative existing data.

## T2 — Authentication and authorization
- [ ] T201 Implement verified Supabase actor resolver.
- [ ] T202 Remove production reliance on caller-controlled identity/role headers.
- [ ] T203 Consolidate resource-scope evaluation.
- [ ] T204 Fail closed when required project context is missing.
- [ ] T205 Add direct API and direct database negative authorization tests.
- [ ] T206 Add tenant-isolation tests for clients, projects, spaces and revisions.

## T3 — Project and space use cases
- [ ] T301 Implement create/list/open client use cases.
- [ ] T302 Implement create/list/open project use cases.
- [ ] T303 Implement add/list/update space use cases.
- [ ] T304 Enforce client/project organization consistency.
- [ ] T305 Add project-member assignment and scope validation.
- [ ] T306 Add audit/outbox events for sensitive mutations.

## T4 — Revision persistence
- [ ] T401 Implement immutable design revision repository.
- [ ] T402 Implement expected-revision commit contract.
- [ ] T403 Implement idempotency key handling.
- [ ] T404 Validate snapshot with existing Zod schema and domain invariants.
- [ ] T405 Calculate canonical revision hash.
- [ ] T406 Atomically insert revision and update current revision pointer.
- [ ] T407 Return conflict on stale expected revision.
- [ ] T408 Add revision history query.

## T5 — Web integration
- [ ] T501 Add project/client creation UI.
- [ ] T502 Add project overview and space list.
- [ ] T503 Add space creation/edit UI.
- [ ] T504 Open existing editor for selected Kitchen space.
- [ ] T505 Add cloud save/sync status.
- [ ] T506 Add stale revision conflict UI.
- [ ] T507 Preserve existing IndexedDB import/export and local draft support.

## T6 — Migration and compatibility
- [ ] T601 Add explicit import flow for existing IndexedDB projects.
- [ ] T602 Require authorized target organization/project/space selection.
- [ ] T603 Validate imported scene before creating cloud revision.
- [ ] T604 Preserve stable element IDs and schema version.
- [ ] T605 Add migration and round-trip tests.

## T7 — Verification and release
- [ ] T701 Unit tests for project/space invariants.
- [ ] T702 Integration tests for transaction and revision concurrency.
- [ ] T703 RLS tests for every tenant-owned table.
- [ ] T704 Cross-tenant negative API tests.
- [ ] T705 E2E: create client → project → space → edit → commit → reopen.
- [ ] T706 E2E: stale revision conflict preserves local draft.
- [ ] T707 Run lint, typecheck, unit tests, build and E2E.
- [ ] T708 Document unresolved requirements and operational setup.
