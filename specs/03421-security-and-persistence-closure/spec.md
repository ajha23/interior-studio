# Feature Specification: 034.2.1 Security & Cloud Persistence Closure

**Feature Branch**: `spec/0341-cloud-hardening`
**Created**: 2026-11-04
**Status**: Ready for Implementation
**Input**: Comprehensive review feedback on Feature 034.2 addressing unverified JWT fallback, optional membership lookup, atomic import adapter wiring, import RPC authorization, idempotency race condition protection, and explicit production persistence initialization.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Fail-Closed Cryptographic JWT Verification (Priority: P0)
As a platform security operator, I need incoming bearer tokens to be strictly and cryptographically verified using HMAC-SHA256 with mandatory expiration (`exp`) and support for both single string and array audience claims (`aud: string | string[]`), failing closed if verification secrets are missing or claims are invalid.

**Why this priority**: Eliminates any possibility of unverified or forged JWT tokens being accepted for authorization decisions.

**Independent Test**: Provide tokens without `exp`, with expired `exp`, with tampered payloads, with array audience claims, or when secret is missing. The system must reject unverified tokens with `CloudPersistenceError.unauthenticated()` without decoding unverified claims.

**Acceptance Scenarios**:
1. **Given** a JWT with no `exp` claim, **When** `verifyJwtSignature()` is called, **Then** verification fails with error `MALFORMED_TOKEN` / `MISSING_EXPIRATION`.
2. **Given** a JWT with `aud: ["interior-studio", "cloud-storage"]`, **When** `verifyJwtSignature(token, { expectedAudience: "interior-studio" })` is evaluated, **Then** the array audience is matched and verified successfully.
3. **Given** a request with a bearer token and no configured `jwtSecret`, **When** `resolveVerifiedActor()` executes, **Then** it throws `CloudPersistenceError.unauthenticated()` rather than falling back to unverified Base64 decoding.

---

### User Story 2 - Mandatory Active Organization Membership (Priority: P0)
As a multi-tenant SaaS administrator, I require all cloud operations to enforce active organization membership verified against the database or directory, rather than trusting unverified client claims.

**Why this priority**: In multi-tenant environments, a valid user identity must not grant access to an organization unless active membership is explicitly confirmed.

**Independent Test**: Pass a valid user token for an organization where the user has no active membership record. The request must be rejected with `CloudPersistenceError.orgMembershipRequired()` or `CloudPersistenceError.forbidden()`.

**Acceptance Scenarios**:
1. **Given** a verified user whose membership status is `inactive` or `suspended`, **When** `resolveVerifiedActor()` executes with `membershipLookup`, **Then** the request is rejected with `CloudPersistenceError.orgMembershipRequired()`.
2. **Given** a cloud persistence request without a membership verification mechanism, **When** actor resolution occurs, **Then** it fails closed with an authentication/authorization error.

---

### User Story 3 - Atomic Import Database RPC Execution in Persistence Adapter (Priority: P0)
As an interior designer importing standalone kitchen (`.kitchen.json`) or multi-room home (`.home.json`) designs into the cloud workspace, I need the persistence adapter to execute the single-transaction `import_kitchen_project` and `import_home_project` database RPCs so that import operations are truly atomic and never leave orphan projects or spaces.

**Why this priority**: Prevents partial imports and data corruption when network or database failures occur during multi-entity project creation.

**Independent Test**: Call `SupabasePersistenceAdapter.importKitchen()` and `importHome()`. Verify that the adapter calls `this.client.rpc('import_kitchen_project', ...)` and `this.client.rpc('import_home_project', ...)` directly and maps the returned database snapshot into complete domain objects.

**Acceptance Scenarios**:
1. **Given** a valid kitchen file, **When** `SupabasePersistenceAdapter.importKitchen()` is invoked, **Then** it invokes `this.client.rpc('import_kitchen_project')` and returns `{ project, space, revision }` mapped from the database response.
2. **Given** an RPC failure (e.g. invalid document or duplicate key mismatch), **When** import executes, **Then** the transaction is rolled back cleanly without creating dangling projects.

---

### User Story 4 - Trusted Database Role & Project Creation Authorization in Import RPCs (Priority: P0)
As a platform security architect, I need the database import RPCs to enforce caller identity (`auth.uid()`), verify caller role via `auth.role()` (avoiding the `current_user` flaw in `SECURITY DEFINER` functions), and check `public.authorize(p_org_id, 'projects:create')` before creating projects, spaces, and revisions.

**Why this priority**: Closes privilege escalation and identity spoofing vulnerabilities in `SECURITY DEFINER` import functions.

**Independent Test**: Call `import_kitchen_project` or `import_home_project` from a user who is not a member of `p_org_id` or lacks `projects:create` permission. The RPC must return `{ "success": false, "reason": "FORBIDDEN" }`.

**Acceptance Scenarios**:
1. **Given** an unauthenticated database connection (`auth.uid() IS NULL` and `auth.role() != 'service_role'`), **When** calling `import_kitchen_project`, **Then** it returns `{ "success": false, "reason": "UNAUTHENTICATED" }`.
2. **Given** an authenticated caller requesting an import for an organization where they lack `projects:create`, **When** the RPC executes, **Then** it checks `public.authorize(p_org_id, 'projects:create')` and returns `FORBIDDEN`.

---

### User Story 5 - Concurrency-Hardened Idempotency (Priority: P1)
As a cloud services engineer, I need revision commit and project import RPCs to protect idempotency records against concurrent duplicate insertion race conditions.

**Why this priority**: Concurrent retries with identical keys must not crash with uncaught database unique constraint violations or produce duplicate outbox/audit records.

**Independent Test**: Execute two simultaneous requests using the exact same idempotency key and payload. Both must resolve consistently without unhandled constraint violations.

**Acceptance Scenarios**:
1. **Given** two concurrent calls with identical idempotency keys and request hashes, **When** both reach the database, **Then** one commits and the second returns the replayed response without error.
2. **Given** a re-used idempotency key with a different request hash, **When** the RPC executes, **Then** it returns `{ "success": false, "reason": "IDEMPOTENCY_KEY_REUSED" }`.

---

### User Story 6 - Explicit Runtime Cloud Persistence Initialization (Priority: P1)
As a frontend architect, I need the application to have an explicit runtime composition root for persistence adapters, ensuring production builds fail loudly if cloud mode is selected without a configured Supabase adapter.

**Why this priority**: Eliminates silent fallback to in-memory persistence in production environments.

**Independent Test**: Start the application with cloud persistence mode configured. Verify that `initializeCloudPersistence()` wires the production Supabase adapter and throws an explanatory error if required environment variables are absent.

**Acceptance Scenarios**:
1. **Given** cloud mode with missing Supabase configuration, **When** `initializeCloudPersistence()` runs, **Then** it throws an explicit configuration error.
2. **Given** valid Supabase credentials, **When** `initializeCloudPersistence()` runs, **Then** `activePersistenceAdapter` in `cloudProjectStore` is set to `SupabasePersistenceAdapter`.

---

## Requirements *(mandatory)*

### Functional Requirements
- **FR-01**: `verifyJwtSignature()` MUST require the `exp` claim to be present and valid, rejecting tokens with missing expiration.
- **FR-02**: `verifyJwtSignature()` MUST support `aud` as either a `string` or `string[]`, matching if `expectedAudience` matches the string or is contained in the array.
- **FR-03**: `resolveVerifiedActor()` MUST fail closed: if `jwtSecret` is not configured, it MUST throw `CloudPersistenceError.unauthenticated()` and NEVER decode unverified tokens.
- **FR-04**: `resolveVerifiedActor()` MUST require active organization membership verification (`membershipLookup`) for multi-tenant cloud operations.
- **FR-05**: `SupabasePersistenceAdapter.importKitchen()` MUST execute `this.client.rpc('import_kitchen_project', ...)` and map the returned result into domain entities.
- **FR-06**: `SupabasePersistenceAdapter.importHome()` MUST execute `this.client.rpc('import_home_project', ...)` and map the returned result into domain entities.
- **FR-07**: Migration `00011_final_security_and_persistence_closure.sql` MUST harden `commit_design_revision`, `import_kitchen_project`, and `import_home_project`:
  - Check `auth.role() != 'service_role'` instead of `current_user != 'service_role'`.
  - Validate `auth.uid() = p_actor_id` to disallow impersonation.
  - Require `public.authorize(p_org_id, 'projects:create')` in both import RPCs.
  - Serialize idempotency execution or handle concurrent conflict gracefully without uncaught unique violations.
- **FR-08**: A dedicated persistence factory `initializeCloudPersistence()` MUST configure the store with `SupabasePersistenceAdapter` in cloud environments and fail closed if unconfigured.
- **FR-09**: All existing 146 unit test suites and 62 Playwright E2E tests MUST continue to pass with 0 regressions.

## Non-Functional & Architecture Requirements
- **NFR-01**: Domain layer isolation (Constitution Principle I) — no React or Zustand imports in `src/domain`.
- **NFR-02**: Forward-only SQL migrations (Constitution Principle VIII) — existing migrations `00008`, `00009`, and `00010` remain untouched; all updates reside in `00011`.
- **NFR-03**: Definition of Done quality gate — `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.
