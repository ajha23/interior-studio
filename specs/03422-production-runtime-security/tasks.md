# Feature 034.2.2 — Implementation Tasks

**Execution rule:** inspect the current `integration` HEAD before implementation. Tasks are ordered by dependency. Do not modify application code as part of specification preparation; implementation begins only on the feature branch/approved PR.

## Phase 0 — Baseline and threat-model confirmation

- [ ] T001 Record current `integration` HEAD SHA and compare it with the Feature 034.2.1 merge.
- [ ] T002 Inspect actual app entry point, Vite environment handling, deployment config and Supabase client construction.
- [ ] T003 Trace every call to `initializePersistence`, `setPersistenceAdapter`, `setActiveActor` and `setOrgId`.
- [ ] T004 Trace all imports/usages of `InMemoryPersistenceAdapter` and identify production-reachable paths.
- [ ] T005 Inspect Supabase project signing configuration and identify actual JWT algorithm, issuer, audience, key rotation and SDK version.
- [ ] T006 Inspect migrations 00001–00011, RLS policies, grants, `authorize`, idempotency unique constraints and RPC definitions.
- [ ] T007 Produce a concise threat-model/data-flow note identifying browser, Supabase API, database and any trusted server boundary.
- [ ] T008 Reconcile findings with this spec; update design/tasks before implementation if repository state differs materially.

## Phase 1 — Runtime composition and readiness (P0)

- [ ] T101 Define a typed runtime configuration schema and validate mode/environment at startup.
- [ ] T102 Create or extend one application composition root; initialize Supabase client and persistence adapter exactly once.
- [ ] T103 Wire `persistenceFactory.ts` into the actual startup path; do not initialize from React component render or modal lifecycle.
- [ ] T104 Remove the cloud store's implicit `new InMemoryPersistenceAdapter()` default.
- [ ] T105 Permit in-memory mode only through explicit local-development/test configuration or test injection.
- [ ] T106 Make production/cloud mode fail closed when Supabase URL, anon/publishable key, client or required configuration is missing.
- [ ] T107 Add typed cloud runtime readiness state and gate cloud actions until ready.
- [ ] T108 Handle StrictMode/repeated bootstrap idempotently; avoid duplicate auth subscriptions and adapter replacement.
- [ ] T109 On auth/session transition, update readiness and clear tenant-sensitive remote caches without deleting local drafts.
- [ ] T110 Add startup and runtime tests for each mode, missing configuration, invalid mode and initialization race.

## Phase 2 — Identity and tenant context (P0)

- [ ] T201 Remove `handleConnectSession` and all hardcoded demo actor/role creation from production UI.
- [ ] T202 Remove `DEFAULT_ORG_ID` as an operational tenant default; initialize organization context as unresolved.
- [ ] T203 Derive actor ID from authenticated Supabase session; reject caller-provided actor identity as an authority source.
- [ ] T204 Make active membership resolution mandatory for every cloud-ready tenant context.
- [ ] T205 Validate membership active status and selected organization; fail closed for revoked/inactive/ambiguous membership.
- [ ] T206 On organization switch, re-resolve membership/permissions and clear previous tenant's project/space/revision caches.
- [ ] T207 Ensure sign-out clears actor, organization, permissions and remote cache while preserving unsynced IndexedDB drafts.
- [ ] T208 Audit all cloud store actions for readiness, actor and organization preconditions.
- [ ] T209 Add tests proving missing session, missing org, inactive membership and cross-tenant context cannot reach persistence calls.

## Phase 3 — JWT and trusted service boundary (P0)

- [ ] T301 Determine whether a custom server JWT verifier is required; prefer the supported Supabase SDK/API trust boundary when appropriate.
- [ ] T302 If custom verification remains, implement the actual configured signing algorithm/key source, explicit issuer/audience, exp/nbf/sub validation, bounded clock skew and key rotation.
- [ ] T303 Remove any decode-only fallback and reject unsupported algorithms, unknown `kid`, invalid issuer/audience and malformed claims.
- [ ] T304 Ensure signing secrets and service-role keys are server-only; inspect Vite `VITE_*` exposure and built assets/source maps.
- [ ] T305 Inventory every service-role client construction and ensure none is reachable from browser code.
- [ ] T306 For trusted server operations, authenticate the end user independently, resolve actor/org from trusted context and authorize before using service role.
- [ ] T307 Ensure SQL RPC service-role bypass is narrow, auditable and cannot be selected by a browser caller.
- [ ] T308 Add negative tests for impersonation, missing actor context, service-role misuse and browser secret leakage.

## Phase 4 — Complete semantic idempotency (P1)

- [ ] T401 Define versioned canonical request-envelope schemas for revision commit, kitchen import and home import.
- [ ] T402 Include all semantic parameters in request hashes; keep snapshot hash as a separately useful field.
- [ ] T403 Normalize names, source identifiers, room ordering and optional fields deterministically.
- [ ] T404 Ensure client and database agree on the exact request hash contract; do not trust a client hash if the database can independently derive/validate it.
- [ ] T405 Retain unique constraints and advisory lock serialization; verify the lock key scope is consistent with the idempotency tuple.
- [ ] T406 Return the original stored response for identical replay; return deterministic key-reuse conflict for changed semantic request.
- [ ] T407 Add tests for same snapshot/different project name, same key/different source identity, room order/metadata changes and canonicalization-version changes.

## Phase 5 — Real PostgreSQL/Supabase integration suite (P0/P1)

- [ ] T501 Reuse or add a documented isolated local Supabase/PostgreSQL integration-test harness.
- [ ] T502 Apply migrations 00001–00011 from a clean database and assert migration completion.
- [ ] T503 Add fixtures for users, active/inactive memberships, organizations, projects and permissions.
- [ ] T504 Test direct table RLS reads/writes for same-tenant, cross-tenant and unauthenticated callers.
- [ ] T505 Test RPC execute grants, caller identity derivation and project/org authorization.
- [ ] T506 Test revision CAS success and stale expected-revision conflict.
- [ ] T507 Run concurrent identical revision commit requests on independent DB connections; assert one revision, one audit/outbox/idempotency record and identical replay response.
- [ ] T508 Run concurrent identical kitchen imports; assert one project/space/revision and one logical audit/outbox event.
- [ ] T509 Run concurrent identical home imports; assert one project and the expected set of spaces/revisions/mappings.
- [ ] T510 Reuse an idempotency key with a changed semantic request; assert conflict and zero additional writes.
- [ ] T511 Inject failures after partial import inserts and before commit; assert all mutation, mapping, audit, outbox and idempotency rows roll back.
- [ ] T512 Test service-role behavior separately from authenticated-user behavior; prove server-side actor validation is required.
- [ ] T513 Verify audit/outbox exactly-once semantics for successful logical operations and no records for rolled-back operations.
- [ ] T514 Make database integration suite a separately named CI job; do not hide it inside unit tests or silently skip when DB unavailable.

## Phase 6 — Regression, documentation and release gate

- [ ] T601 Run lint, typecheck, unit tests, production build and E2E.
- [ ] T602 Run database integration tests from a clean migrated database and capture versions/results.
- [ ] T603 Verify legacy KitchenProject/Home import, local IndexedDB drafts, revision snapshot loading and conflict workflow remain compatible.
- [ ] T604 Verify production bundle/source maps contain no service-role key, JWT signing secret or private key.
- [ ] T605 Document required environment variables by name, source and exposure (public vs server-only); never include values/secrets.
- [ ] T606 Document local development and database integration-test setup.
- [ ] T607 Update acceptance evidence and trace each FR to code/tests.
- [ ] T608 Obtain security review of runtime wiring, SQL functions, RLS/grants and service-role paths.
- [ ] T609 Mark production cloud writes enabled only after all P0 criteria and database integration tests pass.

## Delivery order

P0 release blockers: Phases 0–3 and database proof for identity/RLS/RPC/atomicity.  
P1 correctness: Phase 4 and full concurrency/rollback matrix.  
Release evidence: Phase 6.

A task is not complete because a file exists. It is complete only when the runtime path is exercised and its acceptance evidence is recorded.
