# 034 — Project Foundation and Cloud Persistence: Repository-Reviewed Tasks

Tasks are ordered and independently reviewable. No task may change the existing scene model or remove local persistence without explicit compatibility evidence.

## T0 — Baseline and decisions
- [ ] T001 Pin exact `refactorV2` commit SHA used for implementation.
- [ ] T002 Record existing lint, typecheck, unit, build and E2E baseline; do not assume tests pass.
- [ ] T003 Confirm Supabase project/environment and auth boundary.
- [ ] T004 Confirm client-required fields/cardinality and consent policy with product owner/legal reviewer.
- [ ] T005 Confirm project archive/delete and PII retention policy.
- [ ] T006 Define permission-key mapping to existing permission registry; no parallel key vocabulary.
- [ ] T007 Confirm whether only all_projects/assigned_projects scopes are needed in this feature.
- [ ] T008 Document current IndexedDB fixtures and Home/kitchen file formats.
- [ ] T009 Approve UUID relational IDs + legacy editor ID mapping decision.

## T1 — Schema and migration design
- [ ] T101 Inspect all existing migrations and deployed schema before allocating new migration numbers.
- [ ] T102 Create canonical projects table with UUID PK and org_id.
- [ ] T103 Add optional client_id according to approved policy and composite same-tenant FK.
- [ ] T104 Create spaces table with UUID PK, project/org FK, type, level and plan coordinates.
- [ ] T105 Create design_revisions table with UUID PK, same-space parent relation, snapshot wrapper and immutable metadata.
- [ ] T106 Add spaces.current_revision_id same-space FK with valid transactional insertion strategy.
- [ ] T107 Repair project_members with project/org/member FKs; detect and reconcile orphan rows before constraints.
- [ ] T108 Add legacy_import_mappings with scoped unique key and explicit import-as-copy behavior.
- [ ] T109 Add idempotency_records with unique org/actor/operation/key and request hash.
- [ ] T110 Add transactional outbox table or document reuse of an existing tested outbox.
- [ ] T111 Add indexes for org/project/space/revision and idempotency lookup.
- [ ] T112 Add additive migration comments, preconditions, verification queries and forward-recovery notes.
- [ ] T113 Do not modify already-applied migrations.

## T2 — Client and consent relationship
- [ ] T201 Confirm whether a project can exist without a client.
- [ ] T202 Confirm whether a client can have multiple consent events and contacts.
- [ ] T203 Add client/consent same-tenant relationship and RLS.
- [ ] T204 Preserve historical consent events; model withdrawal and notice version.
- [ ] T205 Avoid mandatory mobile/PII assumptions until approved.
- [ ] T206 Add direct-table and view tests for PII access/masking.
- [ ] T207 Define data retention, export and deletion/anonymization behavior.

## T3 — Authentication and authorization
- [ ] T301 Implement verified Supabase session/JWT actor resolver.
- [ ] T302 Remove default production reliance on x-user-id/x-org-id/x-user-roles/x-team-id/x-client-id.
- [ ] T303 Resolve active org membership from database for selected org.
- [ ] T304 Consolidate project/space authorization at one application boundary.
- [ ] T305 Deny scoped permission when project context is absent.
- [ ] T306 Implement all_projects and assigned_projects correctly or reject unsupported scope types.
- [ ] T307 Ensure SQL authorize RPC cannot allow assigned_projects when project_id is NULL.
- [ ] T308 Do not use service-role bypass for user-facing writes.
- [ ] T309 Add RLS for projects, spaces, revisions, mappings, idempotency and outbox as appropriate.
- [ ] T310 Add explicit INSERT WITH CHECK / UPDATE WITH CHECK or make writes RPC-only with grants revoked.
- [ ] T311 Harden SECURITY DEFINER search_path, execute grants and actor checks.
- [ ] T312 Add object-storage bucket policies if assets are included.

## T4 — Revision and hash contract
- [ ] T401 Define snapshot wrapper referencing existing inferred KitchenProject/HomeRoom types.
- [ ] T402 Preserve scene document IDs and existing schema/file format.
- [ ] T403 Implement versioned canonicalizer with deterministic key/number/default behavior.
- [ ] T404 Encode canonical bytes as UTF-8 and compute SHA-256.
- [ ] T405 Add golden vectors including non-ASCII strings and half-mm positions.
- [ ] T406 Implement immutable revision insert and same-space parent validation.
- [ ] T407 Implement compare-and-swap update of spaces.current_revision_id.
- [ ] T408 Ensure stale CAS failure rolls back revision, audit and outbox inserts.
- [ ] T409 Implement idempotency replay and same-key/different-payload conflict.
- [ ] T410 Add revision history query and immutable read path.

## T5 — Project/space use cases and UI
- [ ] T501 Implement create/list/open/update/archive Project use cases.
- [ ] T502 Implement create/list/update/archive Space use cases.
- [ ] T503 Implement project member assignment use case with scope validation.
- [ ] T504 Add project list/create UI and project overview.
- [ ] T505 Add multi-space list/create UI.
- [ ] T506 Open existing editor for selected Kitchen Space.
- [ ] T507 Preserve project context while editor remains driven by existing KitchenProject schema/commands.
- [ ] T508 Add cloud sync state: local draft, syncing, synced, conflict, failed.
- [ ] T509 Add explicit permission/entitlement/prerequisite failure messages.
- [ ] T510 Keep client PII out of project/scene snapshot and general activity payload.

## T6 — Import and local compatibility
- [ ] T601 Implement standalone kitchen file import preview and validation.
- [ ] T602 Implement Home import preview with one target project and one target space per HomeRoom.
- [ ] T603 Preserve Home kind/BHK/plot/levels/floorHeight/style and room level/x/z/type/name.
- [ ] T604 Preserve original Home, room and embedded design IDs as source provenance.
- [ ] T605 Create import mappings and first revisions atomically or through resumable idempotent import batches.
- [ ] T606 Preserve local source until cloud commit confirmation.
- [ ] T607 Mark local records with mapped server IDs and synced revision.
- [ ] T608 Implement explicit import-as-copy.
- [ ] T609 Preserve existing file export/round-trip compatibility.
- [ ] T610 Define offline draft conflict UX; do not implement multi-user merge in this feature.

## T7 — Verification and release
- [ ] T701 Unit tests for project/space invariants and schema wrappers.
- [ ] T702 Migration tests against clean database.
- [ ] T703 Migration tests against representative restored database.
- [ ] T704 RLS tests for every new tenant-owned table and operation.
- [ ] T705 Cross-tenant and forged-header API tests.
- [ ] T706 RPC direct-invocation and SECURITY DEFINER tests.
- [ ] T707 Revision atomicity, CAS concurrency and idempotency integration tests.
- [ ] T708 Canonical hash golden vectors across browser/server runtime.
- [ ] T709 Kitchen import/reopen/export round-trip E2E.
- [ ] T710 Home multi-room import/reopen/plan-position round-trip E2E.
- [ ] T711 Two-session cloud reopen and stale conflict E2E.
- [ ] T712 Run lint, typecheck, unit, build and E2E; attach CI evidence.
- [ ] T713 Run backup/restore and migration recovery exercise.
- [ ] T714 Document deployment variables, auth configuration, storage policy and operator runbook.

## Definition of Done

- No unresolved P0 authorization or tenant-isolation defect.
- No production use of unverified identity headers.
- Projects/spaces/revisions have tenant-consistent relational constraints.
- Commit is atomic, immutable, compare-and-swap protected and idempotent.
- Kitchen and Home import preserve existing design data and IDs.
- Existing editor and IndexedDB file compatibility remain functional.
- Clean and representative migration suites pass.
- All P0 acceptance tests pass.
- Security reviewer approves the deployed RLS/auth path before cloud writes are enabled.
