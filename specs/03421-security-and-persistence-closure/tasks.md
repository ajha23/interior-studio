# Feature 034.2.1 — Implementation Tasks

## Phase 1 — Cryptographic JWT Verifier & Actor Resolver Hardening
- [x] T101 Require mandatory numeric `exp` in `src/server/auth/jwtVerifier.ts` and reject tokens without valid expiration.
- [x] T102 Support `aud: string | string[]` in `src/server/auth/jwtVerifier.ts` for single string and array audience claims.
- [x] T103 Fail closed in `src/server/auth/actorResolver.ts`: if `secret` is missing, throw `CloudPersistenceError.unauthenticated()` without unverified decoding.
- [x] T104 Require active organization membership verification (`membershipLookup`) for multi-tenant cloud actor resolution.
- [x] T105 Add unit tests in `jwtVerifier.test.ts` and `actorResolver.test.ts` covering missing `exp`, array `aud`, missing secret, and inactive membership.

## Phase 2 — Database Migration 00011 (RPC Security & Concurrency)
- [x] T201 Create forward migration `supabase/migrations/00011_final_security_and_persistence_closure.sql`.
- [x] T202 Replace `current_user != 'service_role'` with `auth.role() != 'service_role'` inside `SECURITY DEFINER` RPCs (`commit_design_revision`, `import_kitchen_project`, `import_home_project`).
- [x] T203 Add `public.authorize(p_org_id, 'projects:create')` check in `import_kitchen_project` and `import_home_project`.
- [x] T204 Add transaction-scoped advisory locks (`pg_advisory_xact_lock`) on idempotency keys to serialize concurrent requests.
- [x] T205 Ensure execute privileges are granted exclusively to `authenticated` and `service_role`.

## Phase 3 — Supabase Persistence Adapter Atomic RPC Wiring
- [x] T301 Wire `SupabasePersistenceAdapter.importKitchen()` to invoke `this.client.rpc('import_kitchen_project', ...)`.
- [x] T302 Map the authoritative kitchen RPC JSON response to `{ project: SaaSProject, space: Space, revision: DesignRevision }`.
- [x] T303 Wire `SupabasePersistenceAdapter.importHome()` to invoke `this.client.rpc('import_home_project', ...)`.
- [x] T304 Map the authoritative home RPC JSON response to `{ project: SaaSProject, spaces: Space[], revisions: DesignRevision[] }`.
- [x] T305 Add unit tests in `supabasePersistenceAdapter.test.ts` asserting atomic RPC invocation, parameter shapes, and domain object mapping.

## Phase 4 — Explicit Runtime Persistence Factory & Startup Wiring
- [x] T401 Create `src/infrastructure/persistence/persistenceFactory.ts` with explicit `initializePersistence(config)`.
- [x] T402 Provide fail-closed validation when cloud mode is activated without required credentials.
- [x] T403 Add unit tests in `src/infrastructure/persistence/persistenceFactory.test.ts`.

## Phase 5 — Concurrency, Idempotency & RBAC Integration Tests
- [x] T501 Add comprehensive integration tests for concurrent idempotency handling, cross-tenant rejection, unauthenticated rejection, and assigned-project RBAC.

## Phase 6 — Verification & Quality Gate
- [x] T601 Run `npm run lint` and verify zero errors.
- [x] T602 Run `npm run typecheck` and verify zero errors.
- [x] T603 Run full test suite `npm test`.
- [x] T604 Run production build `npm run build`.
- [x] T605 Run Playwright E2E suite `npm run e2e`.
