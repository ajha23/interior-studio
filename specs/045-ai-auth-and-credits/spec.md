# Feature Specification: 045 — Signed-in, Credit-Metered AI Endpoints

**Feature Branch**: `045-ai-auth-and-credits`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 2 — Lock down (estimate 3 days)
**Depends on**: 042
**Blocks**: 046, 051
**Source**: Architecture Review (Security: five anonymous paid endpoints — Critical) and Playbook (045)

## Context

Five Vercel functions — `/api/assistant`, `/api/speech`, `/api/live-token`, `/api/render`, `/api/reference` — spend the studio's provider keys and accept anonymous calls. Their only control is an in-process `RateLimiter` (`src/server/assistantHandler.ts`) that lives in one function instance's memory, and the same-origin check is skipped when no `Origin` header is sent.

The live database already has an AI credit ledger (`ai_credit_ledger`, 12 rows), `ai_jobs` (16 rows), `ai_credit_balance`, `ai_debit` and `private.ensure_monthly_grant`. Commit `eaf7d0f` had credit-metered AI as Supabase Edge Functions (`supabase/functions/_shared/ai.ts`) whose debit logic can be reused. This spec is the only one in Phase 2 that protects money.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Only studio members can call AI (Priority: P1)

As the founder, I want every AI endpoint to reject callers who are not signed-in members of a studio, so that strangers cannot spend our provider budget.

**Why this priority**: Live financial exposure.

**Independent Test**: `curl -X POST https://<production>/api/assistant` returns 401.

**Acceptance Scenarios**:

1. **Given** no `Authorization` header, **When** any of the five endpoints is called, **Then** it returns 401 and the provider is not called.
2. **Given** an expired, malformed or wrongly-signed token, **When** called, **Then** 401.
3. **Given** a valid token but an `x-studio-id` the user is not a member of, **When** called, **Then** 403.
4. **Given** a viewer of the studio, **When** they call any AI endpoint, **Then** 403.
5. **Given** an owner, admin or designer with credits, **When** they call, **Then** the request succeeds.

---

### User Story 2 — Every call is paid for from studio credits (Priority: P1)

As the founder, I want each AI call to debit the studio's credits before the provider is called, so that cost is bounded per studio.

**Independent Test**: With a mocked provider, a call with zero credits returns 402 and the mock receives nothing; a call with credits reduces the balance by the configured cost.

**Acceptance Scenarios**:

1. **Given** a studio with zero credits, **When** a designer calls `/api/assistant`, **Then** 402 and the provider is never called.
2. **Given** a studio with credits, **When** a call succeeds, **Then** exactly one negative ledger row for the configured cost and one `ai_jobs` row exist.
3. **Given** credit for five calls, **When** ten calls arrive concurrently, **Then** exactly five succeed, five get 402, and the balance never goes negative.
4. **Given** the provider call fails after debit, **When** the handler finishes, **Then** a positive refund ledger row for the same job exists and the job is marked failed.
5. **Given** a live voice token request, **When** it is issued, **Then** one session-sized debit is made at issue time.

---

### User Story 3 — Designers see their credits (Priority: P2)

As a designer, I want to see remaining studio credits in the assistant and a clear message when they run out, so that a refusal is not a mystery.

**Acceptance Scenarios**:

1. **Given** the assistant panel is open, **When** it loads, **Then** it shows the studio's remaining credits from `ai_credit_balance`.
2. **Given** a 402 response, **When** it arrives, **Then** the panel says credits are used up; owners also see a link to Settings.
3. **Given** a successful call, **When** it completes, **Then** the displayed balance updates.

### Edge Cases

- Monthly grant not yet applied this month: the debit path calls `private.ensure_monthly_grant` first, inside the same transaction.
- Request body tries to pass a user id, cost or studio in the body: ignored; user from `auth.uid()`, cost from the server table, studio from the header.
- Provider times out after the function's limit: job stays `running`; a cleanup marks jobs older than 15 minutes failed and refunds (scheduled or on next call).
- JWKS endpoint unavailable: fail closed (503), never skip verification.
- Request without `Origin` header: no longer relevant to security; auth decides.
- Streaming responses: debit before the stream opens; refund only if the provider errors before any output.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each of the five endpoints MUST require `Authorization: Bearer <Supabase access token>` and an `x-studio-id` header, through one shared wrapper used by all five handlers.
- **FR-002**: Tokens MUST be verified against the project's JWKS using `supabase.auth.getClaims` or `jose` `createRemoteJWKSet`; no hand-written JWT code. Missing or invalid → 401.
- **FR-003**: The server MUST create a per-request Supabase client carrying the user's token, so every database call runs as that user under RLS. These endpoints MUST NOT use a secret/service key.
- **FR-004**: Before calling a provider, the handler MUST call one RPC that, in one transaction: checks membership (403 if none), rejects viewers (403), ensures the monthly grant, checks balance (402 if insufficient), debits the cost and inserts an `ai_jobs` row; it returns the job id.
- **FR-005**: The public RPC MUST be `SECURITY INVOKER` and call a private `SECURITY DEFINER` function that derives the user from `auth.uid()` and ignores any user id in arguments; `search_path = ''`; `EXECUTE` revoked from `public` and `anon`.
- **FR-006**: Concurrency MUST be safe: the balance check and debit MUST serialize per studio (row lock or advisory lock) so the balance never goes negative.
- **FR-007**: Costs per endpoint and model MUST live in one server-side table or constant, never in the request.
- **FR-008**: On provider failure, the RPC path MUST refund the same job with a positive ledger row and mark the job failed.
- **FR-009**: The in-memory `RateLimiter` MUST NOT be a security control (it may remain as a courtesy limit). A Vercel Firewall rate-limit rule for `/api/*` MUST be configured and documented in `docs/`.
- **FR-010**: The browser MUST send the token and studio id on every AI call, show remaining credits in the assistant panel, and handle 402 as described.
- **FR-011**: Reuse live `ai_credit_ledger`, `ai_jobs`, `ai_credit_balance` and `private.ensure_monthly_grant`; any schema change is a new migration with pgTAP tests.
- **FR-012**: Handlers stay in `src/server` and the Vercel build script is unchanged apart from wiring the wrapper.

### Key Entities

- **Credit ledger entry**: org_id, amount (negative debit / positive grant or refund), reason, job_id, created_at.
- **AI job**: id, org_id, user_id, endpoint, model, cost, status (running, done, failed), created_at.
- **Cost table**: endpoint × model → credits.

## Success Criteria *(mandatory)*

- **SC-001**: Anonymous `curl` to each endpoint on production returns 401.
- **SC-002**: Concurrency test: 10 calls with credit for 5 → exactly 5 succeed, balance ≥ 0.
- **SC-003**: Zero provider calls recorded by the mock when credits are zero.
- **SC-004**: Provider spend per day drops to member-only usage (checked in the Google Cloud console a week after release).

## Assumptions

- Monthly grant size stays whatever `ensure_monthly_grant` grants today; pricing comes with billing.
- The studio is passed as a header so every endpoint parses it the same way.

## Out of Scope

Billing and plan pricing; purchasing credits; per-seat usage pricing; render job queue (051).

## Gate

From a terminal, `curl -X POST https://<production>/api/assistant` returns 401. Signed in, the assistant works and the credit count drops.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-ai`
- **Parent Module**: none
- **Module Capabilities**: assistant, speech, live voice token, render, reference image.
- **Dependencies on Other Modules**: `module-platform-identity` (042).

### 2. Subscription Entitlement Requirements
- **Required Entitlement Identifiers**: none beyond studio membership in this spec; plan gating arrives with billing.
- **Feature Availability Conditions**: signed-in member with role owner, admin or designer and a positive credit balance.

### 3. Usage and Commercial Limits
- **Applicable Quotas**: studio AI credits (monthly grant).
- **Usage Measurement**: debit per call at the server-side cost; one `ai_jobs` row per call.
- **Monthly Reset Rules**: `private.ensure_monthly_grant` applies the grant once per calendar month.
- **Behavior When Limits Are Reached**: 402; provider not called; clear UI message.
- **Overage or Upgrade Behavior**: owners are linked to Settings; purchasing comes with billing.

### 4. RBAC Requirements
- **Required Permissions**: call AI — owner, admin, designer. Viewers cannot spend.
- **Applicable Roles**: existing `org_role`.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: credit ledger rows and AI jobs, per studio.
- **Tenant Isolation Requirements**: the debit RPC checks membership of the header studio via `auth.uid()`; RLS on ledger and jobs.
- **Storage and Cache Isolation**: no cross-request caches keyed without studio.
- **Background Worker Tenant Context**: none (render worker in 051).

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec — no plan states exist yet.

### 7. Enforcement Requirements
- **Frontend**: balance shown; 402 handled.
- **Backend**: shared wrapper (401/403/402) then the debit RPC before any provider call.
- **Quota Reservation & Enforcement**: atomic debit in one transaction with per-studio serialization.
- **Audit**: every job and ledger row is the audit trail.

### 8. Acceptance Criteria and Security Tests
- **RBAC Permission Tests**: viewer → 403; designer → 200.
- **Tenant Isolation Tests**: token of studio B user with `x-studio-id` of studio A → 403.
- **Authentication Tests**: no token, expired token, wrong-issuer token → 401.
- **Quota Boundary Tests**: balance = cost − 1 → 402; balance = cost → success, then 402.
- **Concurrent Usage Tests**: 10 concurrent with credit for 5 → exactly 5 succeed (pgTAP on independent connections and an integration test).
- **Refund Tests**: provider failure → refund row and failed job.
