# Feature 034.2 — Implementation Tasks

## Phase 1 — Cryptographic JWT Verification (Critical Gap 2)
- [x] T101 Implement `verifyJwtSignature` in `src/server/auth/jwtVerifier.ts` using Web Crypto API (`crypto.subtle.verify`).
- [x] T102 Validate expiration (`exp`) with clock skew tolerance and not-before (`nbf`).
- [x] T103 Validate issuer (`iss`) and audience (`aud`).
- [x] T104 Update `src/server/auth/actorResolver.ts` to use cryptographic verification rather than plain Base64 decoding.
- [x] T105 Add unit tests for valid signature, tampered payload, forged signature, expired token, and wrong audience in `jwtVerifier.test.ts`.

## Phase 2 — Database RPC Hardening & Migration 00010 (Critical Gaps 3, 4, 5)
- [x] T201 Create `supabase/migrations/00010_security_and_transactional_remediation.sql`.
- [x] T202 Create `public.audit_events` table with append-only immutable trigger.
- [x] T203 Harden `commit_design_revision` RPC to derive caller from `auth.uid()` and disallow actor spoofing.
- [x] T204 Add `public.authorize(p_org_id, 'revisions:commit', p_project_id)` check inside `commit_design_revision`.
- [x] T205 Add atomic `INSERT INTO public.audit_events` to the revision commit transaction.
- [x] T206 Grant execute privileges to `authenticated` and `service_role` only.

## Phase 3 — Dynamic Actor Identity in Store (Critical Gap 1)
- [x] T301 Remove hardcoded actor ID string from `src/state/cloudProjectStore.ts`.
- [x] T302 Add `activeActorId: string | null` and `setActiveActor` to `cloudProjectStore`.
- [x] T303 Require non-null `activeActorId` for mutating operations; throw `CloudPersistenceError.unauthenticated()` if missing.
- [x] T304 Update store tests to test dynamic actor and unauthenticated rejection.

## Phase 4 — Atomic Database Import RPCs & Port Extension (Critical Gap 6)
- [x] T401 Add `import_kitchen_project` and `import_home_project` RPCs in migration 00010.
- [x] T402 Wrap Project, Space, Revision, Mapping, Outbox, and Audit creations in single PostgreSQL transactions.
- [x] T403 Add `getRevision` to `CloudPersistencePort` in `src/domain/project/cloudPersistencePort.ts`.
- [x] T404 Implement `getRevision` in `InMemoryPersistenceAdapter` and `SupabasePersistenceAdapter`.
- [x] T405 Implement atomic import methods in `InMemoryPersistenceAdapter` with full rollback on partial failure.

## Phase 5 — Authoritative Remote Revision Conflict Reload (Critical Gap 7)
- [x] T501 Update `resolveConflictReloadRemote` in `src/state/cloudProjectStore.ts` to call `adapter.getRevision()`.
- [x] T502 Update local store revision cache with fetched remote revision.
- [x] T503 Add test in `cloudProjectStore.test.ts` verifying remote revision is fetched over wire when missing from local cache.

## Phase 6 — Verification & Quality Gate
- [x] T601 Run unit tests for JWT verification, actor resolution, store persistence, and conflict reload.
- [x] T602 Run `npm run lint` and verify zero errors.
- [x] T603 Run `npm run typecheck` and verify zero errors.
- [x] T604 Run full test suite `npm test`.
- [x] T605 Run production build and E2E: `npm run build && npm run e2e`.
