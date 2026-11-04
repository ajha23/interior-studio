# Feature 034.2.2 — Implementation Tasks

**Execution rule:** inspect the current `integration` HEAD before implementation. Tasks are ordered by dependency. Do not modify application code as part of specification preparation; implementation begins only on the feature branch/approved PR.

## Phase 0 — Baseline and threat-model confirmation

- [x] T001 Record current `integration` HEAD SHA and compare it with the Feature 034.2.1 merge.
- [x] T002 Inspect actual app entry point, Vite environment handling, deployment config and Supabase client construction.
- [x] T003 Trace every call to `initializePersistence`, `setPersistenceAdapter`, `setActiveActor` and `setOrgId`.
- [x] T004 Trace all imports/usages of `InMemoryPersistenceAdapter` and identify production-reachable paths.
- [x] T005 Inspect Supabase project signing configuration and identify actual JWT algorithm, issuer, audience, key rotation and SDK version.
- [x] T006 Inspect migrations 00001–00011, RLS policies, grants, `authorize`, idempotency unique constraints and RPC definitions.
- [x] T007 Produce a concise threat-model/data-flow note identifying browser, Supabase API, database and any trusted server boundary.
- [x] T008 Reconcile findings with this spec; update design/tasks before implementation if repository state differs materially.

## Phase 1 — Runtime composition and readiness (P0)

- [x] T101 Define a typed runtime configuration schema and validate mode/environment at startup.
- [x] T102 Create or extend one application composition root; initialize Supabase client and persistence adapter exactly once.
- [x] T103 Wire `persistenceFactory.ts` into the actual startup path; do not initialize from React component render or modal lifecycle.
- [x] T104 Remove the cloud store's implicit `new InMemoryPersistenceAdapter()` default.
- [x] T105 Permit in-memory mode only through explicit local-development/test configuration or test injection.
- [x] T106 Make production/cloud mode fail closed when Supabase URL, anon/publishable key, client or required configuration is missing.
- [x] T107 Add typed cloud runtime readiness state and gate cloud actions until ready.
- [x] T108 Handle StrictMode/repeated bootstrap idempotently; avoid duplicate auth subscriptions and adapter replacement.
- [x] T109 On auth/session transition, update readiness and clear tenant-sensitive remote caches without deleting local drafts.
- [x] T110 Add startup and runtime tests for each mode, missing configuration, invalid mode and initialization race.

## Phase 2 — Identity and tenant context (P0)

- [x] T201 Remove `handleConnectSession` and all hardcoded demo actor/role creation from production UI.
- [x] T202 Remove `DEFAULT_ORG_ID` as an operational tenant default; initialize organization context as unresolved.
- [x] T203 Derive actor ID from authenticated Supabase session; reject caller-provided actor identity as an authority source.
- [x] T204 Make active membership resolution mandatory for every cloud-ready tenant context.
- [x] T205 Validate membership active status and selected organization; fail closed for revoked/inactive/ambiguous membership.
- [x] T206 On organization switch, re-resolve membership/permissions and clear previous tenant's project/space/revision caches.
- [x] T207 Ensure sign-out clears actor, organization, permissions and remote cache while preserving unsynced IndexedDB drafts.
- [x] T208 Audit all cloud store actions for readiness, actor and organization preconditions.
- [x] T209 Add tests proving missing session, missing org, inactive membership and cross-tenant context cannot reach persistence calls.

## Phase 3 — JWT and trusted service boundary (P0)

- [x] T301 Determine whether a custom server JWT verifier is required; prefer the supported Supabase SDK/API trust boundary when appropriate.
- [x] T302 If custom verification remains, implement the actual configured signing algorithm/key source, explicit issuer/audience, exp/nbf/sub validation, bounded clock skew and key rotation.
- [x] T303 Remove any decode-only fallback and reject unsupported algorithms, unknown `kid`, invalid issuer/audience and malformed claims.
- [x] T304 Ensure signing secrets and service-role keys are server-only; inspect Vite `VITE_*` exposure and built assets/source maps.
- [x] T305 Inventory every service-role client construction and ensure none is reachable from browser code.
- [x] T306 For trusted server operations, authenticate the end user independently, resolve actor/org from trusted context and authorize before using service role.
- [x] T307 Ensure SQL RPC service-role bypass is narrow, auditable and cannot be selected by a browser caller.
- [x] T308 Add negative tests for impersonation, missing actor context, service-role misuse and browser secret leakage.

## Phase 4 — Complete semantic idempotency (P1)

- [x] T401 Define versioned canonical request-envelope schemas for revision commit, kitchen import and home import.
- [x] T402 Include all semantic parameters in request hashes; keep snapshot hash as a separately useful field.
- [x] T403 Normalize names, source identifiers, room ordering and optional fields deterministically.
- [x] T404 Ensure client and database agree on the exact request hash contract; do not trust a client hash if the database can independently derive/validate it.
- [x] T405 Retain unique constraints and advisory lock serialization; verify the lock key scope is consistent with the idempotency tuple.
- [x] T406 Return the original stored response for identical replay; return deterministic key-reuse conflict for changed semantic request.
- [x] T407 Add tests for same snapshot/different project name, same key/different source identity, room order/metadata changes and canonicalization-version changes.

## Phase 5 — Real PostgreSQL/Supabase integration suite (P0/P1)

- [x] T501 Reuse or add a documented isolated local Supabase/PostgreSQL integration-test harness.
- [x] T502 Apply migrations 00001–00011 from a clean database and assert migration completion.
- [x] T503 Add fixtures for users, active/inactive memberships, organizations, projects and permissions.
- [x] T504 Test direct table RLS reads/writes for same-tenant, cross-tenant and unauthenticated callers.
- [x] T505 Test RPC execute grants, caller identity derivation and project/org authorization.
- [x] T506 Test revision CAS success and stale expected-revision conflict.
- [x] T507 Run concurrent identical revision commit requests on independent DB connections; assert one revision, one audit/outbox/idempotency record and identical replay response.
- [x] T508 Run concurrent identical kitchen imports; assert one project/space/revision and one logical audit/outbox event.
- [x] T509 Run concurrent identical home imports; assert one project and the expected set of spaces/revisions/mappings.
- [x] T510 Reuse an idempotency key with a changed semantic request; assert conflict and zero additional writes.
- [x] T511 Inject failures after partial import inserts and before commit; assert all mutation, mapping, audit, outbox and idempotency rows roll back.
- [x] T512 Test service-role behavior separately from authenticated-user behavior; prove server-side actor validation is required.
- [x] T513 Verify audit/outbox exactly-once semantics for successful logical operations and no records for rolled-back operations.
- [ ] T514 Make database integration suite a separately named CI job; do not hide it inside unit tests or silently skip when DB unavailable.

## Phase 6 — Regression, documentation and release gate

- [x] T601 Run lint, typecheck, unit tests, production build and E2E.
- [x] T602 Run database integration tests from a clean migrated database and capture versions/results.
- [x] T603 Verify legacy KitchenProject/Home import, local IndexedDB drafts, revision snapshot loading and conflict workflow remain compatible.
- [x] T604 Verify production bundle/source maps contain no service-role key, JWT signing secret or private key.
- [x] T605 Document required environment variables by name, source and exposure (public vs server-only); never include values/secrets.
- [x] T606 Document local development and database integration-test setup.
- [x] T607 Update acceptance evidence and trace each FR to code/tests.
- [x] T608 Obtain security review of runtime wiring, SQL functions, RLS/grants and service-role paths.
- [x] T609 Mark production cloud writes enabled only after all P0 criteria and database integration tests pass.

## Delivery order

P0 release blockers: Phases 0–3 and database proof for identity/RLS/RPC/atomicity.  
P1 correctness: Phase 4 and full concurrency/rollback matrix.  
Release evidence: Phase 6.

A task is not complete because a file exists. It is complete only when the runtime path is exercised and its acceptance evidence is recorded.
