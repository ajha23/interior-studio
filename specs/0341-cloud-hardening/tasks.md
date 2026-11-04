# Feature 034.1 — Implementation Tasks

## Phase 0 — Baseline and threat model
- [ ] T001 Record exact Feature 034 branch head and migration state in target environments.
- [ ] T002 Inventory every project/space/revision write path, API route, RPC, policy, grant and trigger.
- [ ] T003 Trace browser-to-server identity and tenant context; identify all trusted-header fallbacks.
- [ ] T004 Create threat model covering cross-tenant access, IDOR, forged headers, stale writes, duplicate requests, service-role leakage and import abuse.
- [ ] T005 Establish clean-install and upgrade test databases.

## Phase 1 — Identity and authorization
- [ ] T101 Implement verified session resolver; actor comes only from verified auth subject.
- [ ] T102 Resolve active organization membership from database and reject inactive/revoked membership.
- [ ] T103 Remove trusted x-user-id/x-org-id/x-user-roles and equivalent body/query fallbacks.
- [ ] T104 Implement explicit assigned_projects and all_projects evaluation.
- [ ] T105 Require active org membership plus active project_members assignment for assigned scope.
- [ ] T106 Reject unsupported scopes and missing project context.
- [ ] T107 Separate read/write/archive/member-management/revision-commit permissions.
- [ ] T108 Add API tests for forged identity, inactive membership, role escalation and cross-tenant IDs.

## Phase 2 — Database hardening
- [ ] T201 Review all RLS-enabled tables and table grants.
- [ ] T202 Fix fail-open/null tenant predicates; prove missing context denies.
- [ ] T203 Add same-org composite constraints/FKs for project, client, space, membership, revision, mappings, idempotency, audit and outbox relationships.
- [ ] T204 Review composite FK ON DELETE behavior, especially nullable client association.
- [ ] T205 Harden immutable revision and append-only audit triggers/privileges.
- [ ] T206 Review SECURITY DEFINER ownership, fixed search_path and EXECUTE grants.
- [ ] T207 Ensure service-role credentials are server-only and absent from browser bundle.
- [ ] T208 Add policy matrix tests for every tenant table and CRUD operation.
- [ ] T209 Add forward-only migration and clean/upgrade migration tests.

## Phase 3 — Persistence application boundary
- [ ] T301 Define persistence ports and typed application use cases.
- [ ] T302 Implement Supabase adapter/repositories using user-scoped identity or trusted server mediation.
- [ ] T303 Implement durable project create/list/get/update/archive.
- [ ] T304 Implement durable space create/list/update.
- [ ] T305 Make Zustand store orchestrate use cases; remove local-only success semantics for cloud actions.
- [ ] T306 Ensure UI shows synced/committed only after server acknowledgement.
- [ ] T307 Add persistence integration tests across reload and separate sessions.

## Phase 4 — Atomic revision commit and idempotency
- [ ] T401 Implement one transactional commit RPC/use case.
- [ ] T402 Enforce server-side authorization, snapshot validation and canonical hash contract.
- [ ] T403 Implement expected-revision CAS with row lock/conditional update.
- [ ] T404 Insert immutable revision and update Space pointer in one transaction.
- [ ] T405 Persist idempotency request hash and replay response in same transaction.
- [ ] T406 Reject same key with changed request hash.
- [ ] T407 Insert audit and outbox rows in the same transaction.
- [ ] T408 Map conflicts and validation failures to stable typed errors.
- [ ] T409 Add concurrent duplicate and concurrent stale-commit integration tests.

## Phase 5 — Import durability
- [ ] T501 Validate Kitchen/Home envelope and supported schema before writes.
- [ ] T502 Implement atomic Kitchen import with mapping.
- [ ] T503 Implement atomic or staged/resumable Home import.
- [ ] T504 Ensure import idempotency and deterministic retry behavior.
- [ ] T505 Verify legacy IDs, room order, level, plan position and geometry round-trip.
- [ ] T506 Add import failure-injection and partial-import recovery tests.

## Phase 6 — Local-first sync and conflict UX
- [ ] T601 Persist local draft, base revision, local hash and server hash.
- [ ] T602 Fetch authoritative server pointer before each commit/reconnect.
- [ ] T603 Preserve stale draft on CAS conflict.
- [ ] T604 Implement reload-remote, keep-local-draft and compare/resolve actions.
- [ ] T605 Reuse idempotency key only for exact retry of same request.
- [ ] T606 Add offline/reconnect, timeout-after-commit and two-session E2E tests.

## Phase 7 — Audit, outbox and operations
- [ ] T701 Implement outbox worker with safe claiming, retry/backoff and dead-letter state.
- [ ] T702 Make consumers idempotent using stable event IDs.
- [ ] T703 Add structured logs, correlation IDs, metrics and alerts.
- [ ] T704 Add backup/restore verification and operational runbook.
- [ ] T705 Document retention, deletion, snapshot size and asset storage policy.

## Phase 8 — Release gate
- [ ] T801 Run unit, integration, RLS, API, E2E and migration suites in CI.
- [ ] T802 Perform independent security review of RLS, RPC and service-role boundary.
- [ ] T803 Verify no false success state or data loss on all failure paths.
- [ ] T804 Reconcile feature checklist with test evidence and deployed migration state.
- [ ] T805 Obtain product/security sign-off before enabling cloud writes for users.

## Dependency order

Phase 0 -> Phase 1 and 2 -> Phase 3 -> Phase 4 -> Phase 5 and 6 -> Phase 7 -> Phase 8.

Do not enable production cloud writes before Phases 1–4 and their integration/security tests are complete.
