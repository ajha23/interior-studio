# Feature Specification: 034.2.2 Runtime Integration & Database Security Verification

**Feature Branch**: `spec/0341-cloud-hardening`
**Created**: 2026-11-04
**Status**: Ready for Implementation
**Input**: Review findings on Feature 034.2.1 covering application startup persistence wiring, removal of demo UI identity, elimination of default organization fallback, production JWT verification configuration enforcement, full-request import idempotency hashing, and database-level concurrency & service-role test verification.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Explicit Application Startup Persistence Wiring & Fail-Closed Cloud Mode (Priority: P0)
As a platform operator deploying to production, I require the application's runtime composition root (`src/main.tsx` / `persistenceFactory.ts`) to explicitly initialize the persistence adapter during startup. If cloud persistence mode is requested, the application must wire `SupabasePersistenceAdapter` and fail closed immediately if required Supabase credentials or environment configurations are missing, never silently defaulting to in-memory persistence.

**Why this priority**: Eliminates silent data loss and ensures production cloud deployments strictly write to authoritative Supabase PostgreSQL storage.

**Independent Test**: Configure `VITE_CLOUD_PERSISTENCE=true` with missing Supabase URL/keys. Verify that application startup throws an explicit configuration error and halts rather than operating on ephemeral in-memory storage.

**Acceptance Scenarios**:
1. **Given** `VITE_CLOUD_PERSISTENCE=true` with valid `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`, **When** the application bootstraps in `src/main.tsx`, **Then** `initializePersistence()` configures `SupabasePersistenceAdapter` as the store's active persistence adapter.
2. **Given** cloud mode with missing credentials, **When** bootstrap occurs, **Then** initialization throws a descriptive fatal error and prevents unauthenticated or mock cloud writes.
3. **Given** local/dev mode without cloud persistence flags, **When** bootstrap occurs, **Then** `InMemoryPersistenceAdapter` is explicitly configured.

---

### User Story 2 - Removal of Hardcoded Demo Identity & Production Session Binding (Priority: P0)
As an enterprise user opening the Cloud Project Modal, I require the UI to strictly bind to verified session identities provided by the authentication store/provider, with no hardcoded test UUIDs (`00000000-0000-4000-8000-000000000002`) accessible in production.

**Why this priority**: Prevents identity spoofing, demo credential leakage, and multi-tenant data corruption in production environments.

**Independent Test**: Inspect `CloudProjectModal.tsx`. Verify that hardcoded actor UUIDs are eliminated from production paths and that the unauthenticated state directs users to authentic sign-in rather than granting an instant mock session.

**Acceptance Scenarios**:
1. **Given** an unauthenticated user opening `CloudProjectModal`, **When** they view the active session banner, **Then** the UI prompts them to sign in via the authoritative authentication provider without offering a hardcoded mock session.
2. **Given** a production build (`import.meta.env.PROD`), **When** the cloud modal renders, **Then** no mock or demo identity connection shortcuts are displayed.

---

### User Story 3 - Elimination of Default Organization Fallback (Priority: P0)
As a multi-tenant SaaS security administrator, I require the application to have no default fallback organization UUID (`DEFAULT_ORG_ID`). The active organization must strictly originate from verified session claims or explicit user organization selection. Any cloud operation attempted without an active organization context must fail closed.

**Why this priority**: A default tenant fallback risks committing revisions or creating projects under an arbitrary organization if tenant resolution fails.

**Independent Test**: Attempt to call `createProject`, `createSpace`, `commitCurrentDesign`, or `importKitchen` when `currentOrgId` is `null`. The store must throw `CloudPersistenceError.orgMembershipRequired('Active organization context is required.')`.

**Acceptance Scenarios**:
1. **Given** `currentOrgId` is `null`, **When** `store.createProject()` is invoked, **Then** it throws `CloudPersistenceError.orgMembershipRequired()`.
2. **Given** an authenticated user switching organizations, **When** `store.setOrgId(verifiedOrgId)` is called, **Then** the store updates the active tenant context and refreshes project lists for that tenant.

---

### User Story 4 - Production JWT Signing Configuration & Claim Enforcement (Priority: P0)
As a platform security architect, I require JWT verification in production to strictly validate the expected issuer, audience (`authenticated`), and configured signing algorithms (`HS256`), failing closed during startup or request evaluation if verification settings are missing or mismatched.

**Why this priority**: Guarantees cryptographic compatibility with deployed Supabase Auth projects and prevents tokens issued by other entities or with invalid audiences from passing verification.

**Independent Test**: Evaluate tokens with wrong issuer, missing audience, or unsupported algorithms against `validateJwtAuthConfig()` and `verifyJwtSignature()`. All must be rejected with explicit error codes.

**Acceptance Scenarios**:
1. **Given** a token whose `iss` does not match the configured `SUPABASE_JWT_ISSUER`, **When** verified, **Then** verification fails with `INVALID_ISSUER`.
2. **Given** a token whose `aud` claim does not include the configured `SUPABASE_JWT_AUDIENCE` (`authenticated`), **When** verified, **Then** verification fails with `INVALID_AUDIENCE`.

---

### User Story 5 - Full-Request Import Idempotency Hashing (Priority: P1)
As a backend data engineer, I require the idempotency request hash for import operations to cover the complete normalized request payload—including project name, source file identity, client ID, and design content—rather than solely the internal snapshot hash.

**Why this priority**: Prevents idempotency collisions when an import key is re-used with identical room geometry but different project names or metadata.

**Independent Test**: Call `importKitchen` with the same idempotency key and design geometry, but a different `projectName`. The system must detect the hash mismatch and reject with `IDEMPOTENCY_KEY_REUSED`.

**Acceptance Scenarios**:
1. **Given** an import request with key `K` and payload `P1`, **When** a retry with key `K` and identical payload `P1` arrives, **Then** the stored response is replayed.
2. **Given** an import request with key `K` and payload `P2` (differing project name), **When** evaluated, **Then** the RPC rejects the request with `IDEMPOTENCY_KEY_REUSED`.

---

### User Story 6 - Database Concurrency & Service-Role Security Verification (Priority: P1)
As a lead QA engineer, I require integration test suites that execute and verify actual PostgreSQL transaction rollback, advisory locking serialization, CAS compare-and-swap conflict detection, and service-role permission boundaries.

**Why this priority**: Proves that database-level concurrency safeguards and RLS security boundaries function under concurrent load and adversarial manipulation.

**Independent Test**: Run `databaseIntegration.test.ts` asserting that concurrent RPC calls serialize on advisory locks, invalid CAS commits return `REVISION_CONFLICT`, and client calls cannot spoof `service_role`.

**Acceptance Scenarios**:
1. **Given** concurrent calls targeting the same space with the same `expected_revision_id`, **When** both invoke `commit_design_revision`, **Then** the first succeeds and the second returns `conflict: true, reason: 'REVISION_CONFLICT'`.
2. **Given** a client connection with `anon` or `authenticated` role, **When** invoking RPCs, **Then** `auth.role()` evaluates to caller's JWT role and cannot bypass security checks.

---

## Requirements *(mandatory)*

### Functional Requirements
- **FR-01**: `src/main.tsx` MUST call `bootstrapPersistence()` during startup, initializing `SupabasePersistenceAdapter` if cloud mode is enabled, or failing closed if credentials are missing.
- **FR-02**: `CloudProjectModal.tsx` MUST NOT contain hardcoded actor IDs or demo session connection shortcuts in production paths.
- **FR-03**: `cloudProjectStore.ts` MUST initialize `currentOrgId: string | null` to `null` and reject all cloud mutations with `CloudPersistenceError.orgMembershipRequired()` when `currentOrgId` is null.
- **FR-04**: `jwtVerifier.ts` and `actorResolver.ts` MUST support environment configuration for `SUPABASE_JWT_ISSUER`, `SUPABASE_JWT_AUDIENCE`, and allowed algorithms, failing closed if configured settings are missing.
- **FR-05**: Import idempotency request hashes MUST be computed over the full normalized request payload (`{ operation, projectName, sourceFileId, snapshotHash }`).
- **FR-06**: Migration `00012_runtime_integration_and_security_verification.sql` MUST verify normalized import request hashes and ensure advisory lock serialization across all RPCs.
- **FR-07**: A database integration test suite (`databaseIntegration.test.ts`) MUST verify concurrency, CAS rollback, idempotency replay, and service-role protection.
- **FR-08**: All 149 existing unit test suites and 62 Playwright E2E tests MUST continue to pass with 0 regressions.

## Non-Functional & Architecture Requirements
- **NFR-01**: Constitution Principle I (Layer Isolation) — no React/Zustand imports in domain/engine.
- **NFR-02**: Constitution Principle VIII (Migration Immutability) — forward-only migrations `00008` to `00012`.
- **NFR-03**: Five-Stage Quality Gate — `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.
