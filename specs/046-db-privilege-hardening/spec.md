# Feature Specification: 046 — Database Privilege Hardening

**Feature Branch**: `046-db-privilege-hardening`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 2 — Lock down (estimate 2 days)
**Depends on**: 043, 045, staging project from 048
**Blocks**: Phase 2 completion
**Source**: Architecture Review (Security: function grants, `search_path`, legacy keys, live advisor warnings) and Playbook (046)

## Context

The live Supabase security advisor reports three `SECURITY DEFINER` functions callable by any signed-in user (`accept_pending_invites`, `ai_credit_balance`, `save_project_version`) and leaked-password protection off. Supabase grants `EXECUTE` on new functions to `anon` and `authenticated` by default, so revoking only from `PUBLIC` is not enough. The project still uses the legacy anon key and HS256 signing.

This spec brings the database to constitution Principle XI and clears the advisor, then moves to publishable/secret API keys and asymmetric JWT signing keys in a safe, staged order.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — No function is callable by a role that should not call it (Priority: P1)

As the founder, I want every function's `EXECUTE` grant to be explicit, so that no future function is accidentally exposed to anonymous callers.

**Why this priority**: Default grants are the most common Supabase exposure.

**Independent Test**: A pgTAP test lists every function in `public` with its grants and fails on any unexpected grant to `anon`.

**Acceptance Scenarios**:

1. **Given** the migrated database, **When** the grant test runs, **Then** no function in `public` is executable by `anon` unless it is on an explicit allowlist (expected: empty).
2. **Given** a new migration creates a function without a grant, **When** the test runs, **Then** the function is not executable by `public`, `anon` or `authenticated` (default privileges revoked).
3. **Given** the `private` schema, **When** I check the API's exposed schemas, **Then** `private` is not exposed.

---

### User Story 2 — Definer functions are safe and narrow (Priority: P1)

As a reviewer, I want every privileged function to have a fixed `search_path` and to derive the user itself, so that it cannot be hijacked or tricked into acting for someone else.

**Independent Test**: A catalog query finds zero `SECURITY DEFINER` functions without `search_path = ''`; API-callable functions in `public` are all `SECURITY INVOKER`.

**Acceptance Scenarios**:

1. **Given** all functions in `public` and `private`, **When** I query `pg_proc` for definer functions, **Then** every one has `proconfig` containing `search_path=` (empty) and uses schema-qualified names.
2. **Given** `accept_pending_invites`, `ai_credit_balance`, `save_project_version`, `ai_debit` and the functions added in 043 and 045, **When** I inspect them, **Then** each public entry point is `SECURITY INVOKER` and calls a `private` definer function that uses `auth.uid()` and accepts no user id.
3. **Given** all earlier pgTAP and Playwright suites, **When** they run after the change, **Then** they pass unchanged.

---

### User Story 3 — Modern API keys and signing keys (Priority: P2)

As the founder, I want to move off the legacy anon key and shared JWT secret, so that keys can rotate and tokens are verified with public keys.

**Independent Test**: After revocation, a request using the old anon JWT key is rejected; the app still signs in, saves and calls AI.

**Acceptance Scenarios**:

1. **Given** staging, **When** the app and functions are switched to the publishable and secret keys and deployed, **Then** sign-in, save and AI work.
2. **Given** staging works, **When** the project is rotated to asymmetric JWT signing keys, **Then** tokens verify via JWKS in the 045 wrapper and everything still works.
3. **Given** both environments work, **When** the legacy JWT secret is revoked, **Then** a request signed with the old key is rejected.
4. **Given** production, **When** the same sequence is repeated, **Then** the outcomes match staging.

---

### User Story 4 — Advisor is clean (Priority: P1)

As the founder, I want the Supabase security advisor to show zero findings on production, so that there is one simple signal that the database is in order.

**Acceptance Scenarios**:

1. **Given** production after this spec, **When** I open the security advisor, **Then** it reports zero findings.
2. **Given** Auth settings, **When** I check password protection, **Then** leaked-password protection is enabled.

### Edge Cases

- A function used by a trigger (e.g. `private.handle_new_user`) loses `EXECUTE` for `authenticated`: triggers run as the owner, so it still fires; a pgTAP test proves sign-up still creates a profile.
- Changing `search_path` breaks unqualified references inside an existing body: each function is rewritten with qualified names in its own migration; the suite catches misses.
- Key switch done in one step locks everyone out: forbidden; the staged order (FR-007) is mandatory.
- A cron or worker uses the legacy service key: inventory all key consumers before revocation and list them in the PR.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Default privileges MUST revoke `EXECUTE` on functions in schema `public` from `public`, `anon` and `authenticated`, for existing and future functions; each function MUST then be granted only to the role that needs it.
- **FR-002**: Every `SECURITY DEFINER` function in `public` and `private` MUST set `search_path = ''` and use schema-qualified names.
- **FR-003**: API-callable functions MUST be `SECURITY INVOKER` wrappers in `public` calling `private` `SECURITY DEFINER` functions that derive the user from `auth.uid()`.
- **FR-004**: The `private` schema MUST NOT be in the API's exposed schemas.
- **FR-005**: A pgTAP test MUST enumerate every function in `public` with its grants and fail on any unexpected grant to `anon` (and on any definer function lacking `search_path = ''`).
- **FR-006**: Leaked-password protection MUST be enabled.
- **FR-007**: The key switch MUST follow this order, each step verified before the next, staging first then production: (1) add publishable and secret keys to Vercel and local env and deploy; (2) rotate to asymmetric JWT signing keys; (3) revoke the legacy JWT secret.
- **FR-008**: `VITE_SUPABASE_ANON_KEY` MUST be renamed to the publishable key variable throughout code, docs and Vercel.
- **FR-009**: Changes MUST be one migration per concern (grants; `search_path`; invoker wrappers) so failures are easy to locate.
- **FR-010**: CI SHOULD run `supabase db lint` and, where possible, the Management API advisor.

### Key Entities

- **Function grant inventory**: function, security type, `search_path`, roles with `EXECUTE`.
- **API keys**: publishable (browser), secret (server-only, unused by user-facing endpoints).
- **JWT signing keys**: asymmetric key pair exposed via JWKS.

## Success Criteria *(mandatory)*

- **SC-001**: Security advisor on production: zero findings.
- **SC-002**: Grant test passes; it fails on a throwaway migration that grants a function to `anon`.
- **SC-003**: Legacy-key request rejected after revocation.
- **SC-004**: No regression in any earlier test suite.

## Assumptions

- The staging project created in 048 exists before this spec's key rotation; grant and `search_path` migrations can be developed locally first.
- No external service other than Vercel functions uses the database keys (verified in the inventory).

## Out of Scope

Storage policies and HTTP headers (047); new features.

## Gate

The production advisor page shows no findings, and the app still signs in, saves and calls AI.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: foundation spec — database privileges only.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec.

### 3. Usage and Commercial Limits
Not applicable: foundation spec.

### 4. RBAC Requirements
Not applicable: foundation spec — roles unchanged; only Postgres role grants change.

### 5. Multi-Tenant Requirements
- **Tenant Isolation Requirements**: definer functions derive the user from `auth.uid()` and never accept an actor id; isolation tests from 041–045 must still pass.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Backend**: enforcement is in the database: explicit grants, invoker wrappers, fixed `search_path`.
- **Audit**: unchanged.

### 8. Acceptance Criteria and Security Tests
- **Grant Tests**: no unexpected `anon` grants; no definer function without `search_path = ''`.
- **Tenant Isolation Tests**: all 041–045 isolation tests re-run green.
- **Key Tests**: legacy JWT rejected after revocation; JWKS-verified tokens accepted.
- **Regression Tests**: full pgTAP and Playwright suites green.
