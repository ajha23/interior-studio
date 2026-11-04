# Feature 034.2.2 — Implementation Tasks

## Phase 1 — Application Composition Root & Persistence Factory Wiring (Blocker 1)
- [x] T101 Implement `bootstrapPersistence()` in `src/infrastructure/persistence/persistenceFactory.ts`.
- [x] T102 Wire `bootstrapPersistence()` into `src/main.tsx` during application startup.
- [x] T103 Provide fail-closed validation when `VITE_CLOUD_PERSISTENCE=true` with missing credentials.
- [x] T104 Add unit tests for `bootstrapPersistence()` in `src/infrastructure/persistence/persistenceFactory.test.ts`.

## Phase 2 — UI Demo Identity Removal & Organization Context Hardening (Blockers 2, 4)
- [x] T201 Remove hardcoded `DEFAULT_ORG_ID` in `src/state/cloudProjectStore.ts` (initialize to `null`).
- [x] T202 Require non-null `currentOrgId` for all cloud store actions; throw `CloudPersistenceError.orgMembershipRequired()` if missing.
- [x] T203 Remove hardcoded demo actor ID in `src/features/projects/CloudProjectModal.tsx`.
- [x] T204 Update store and modal tests for nullable organization context and session binding.

## Phase 3 — Production JWT Configuration & Alg Verification (Blocker 3)
- [x] T301 Add `validateJwtAuthConfig()` and environment configuration checks in `src/server/auth/jwtVerifier.ts`.
- [x] T302 Enforce mandatory issuer and audience in `src/server/auth/jwtVerifier.ts`.
- [x] T303 Add unit tests in `src/server/auth/jwtVerifier.test.ts` for config validation and strict claim checks.

## Phase 4 — Full-Request Import Idempotency Hashing & Migration 00012 (Follow-ups 6, 7)
- [x] T401 Compute full-request normalized hashes for `importKitchen` and `importHome` in `supabasePersistenceAdapter.ts`.
- [x] T402 Create migration `supabase/migrations/00012_runtime_integration_and_security_verification.sql`.
- [x] T403 Enforce `p_request_hash` and service-role restrictions in migration 00012 RPCs.

## Phase 5 — Database Concurrency & Service-Role Security Tests (Follow-up 5)
- [x] T501 Create `src/infrastructure/persistence/databaseIntegration.test.ts` verifying concurrent CAS conflict, full-request idempotency hash mismatch rejection, and service-role spoofing rejection.

## Phase 6 — Verification & Quality Gate
- [x] T601 Run `npm run lint` and verify zero errors.
- [x] T602 Run `npm run typecheck` and verify zero errors.
- [x] T603 Run full test suite `npm test`.
- [x] T604 Run production build `npm run build`.
- [x] T605 Run Playwright E2E suite `npm run e2e`.
