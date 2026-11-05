# Feature Specification: 053 — Resume Features Behind the Gate (Phase 6)

**Feature Branch**: `053-feature-reentry-gate`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 6 — Resume features behind the gate
**Depends on**: 048 (freeze lifted), 052 (ops readiness); all Phase 1–5 gates passed on production
**Source**: Architecture Review (Phase 6; Keep, change, delete; How to work with coding agents) and Playbook (closing section)

## Context

Specs 020–033 built billing, manufacturing, MEP, client portal, roles and more on persistence that never reached a server. After Phases 1–5 there is a real foundation: signed-in users, one database, RLS proven by CI, metered AI, gated deploys and observability. Phase 6 brings the parked domains back **one at a time**, each re-entering through the same loop and the CI gate, starting with 035 (lifecycle and approvals).

This spec does not build a feature. It defines the re-entry contract every parked domain must satisfy, the order they return in, and the evidence that counts as done, so the 034.x pattern cannot recur.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — A parked domain returns safely (Priority: P1)

As the founder, I want each parked domain to come back only with its migration, policy tests and a preview a real user signed into, so that new features cannot weaken the foundation.

**Why this priority**: It is the whole point of Phases 0–5.

**Independent Test**: The first re-entered domain (035 lifecycle) merges only after its re-entry checklist is fully evidenced.

**Acceptance Scenarios**:

1. **Given** a parked domain spec, **When** it is re-opened, **Then** it is re-specified against the live schema (not the 034.x tables) with a new spec number and the constitution 2.3.0 SaaS section.
2. **Given** its PR, **When** CI runs, **Then** its migrations apply to a fresh local Supabase and its pgTAP policy tests (own studio allowed, other studio denied, anon denied, role checks) pass.
3. **Given** the PR, **When** it is reviewed, **Then** its description links the green CI run and the Vercel preview URL, and states that a person signed in and used the feature.
4. **Given** a domain needs a server secret (e.g. a payment provider), **When** it is designed, **Then** the secret lives only in a Vercel function that verifies the user's token (045 wrapper) or in a narrowly-granted webhook handler.

---

### User Story 2 — A known order of return (Priority: P1)

As the founder, I want a fixed order for bringing domains back, so that each builds on what came before and scope stays small.

**Acceptance Scenarios**:

1. **Given** the tracker in `docs/ROADMAP.md`, **When** I read it, **Then** the order is: (1) 035 lifecycle and approvals; (2) billing with a server-side Razorpay webhook; (3) client portal on signed share links; (4) manufacturing exports (cut lists, nesting, part labels); (5) MEP and DXF; (6) remaining domains by customer demand.
2. **Given** a domain is in progress, **When** another is proposed, **Then** it waits unless it has no shared tables and the founder approves in writing.

---

### User Story 3 — Old 034.x and pre-foundation code is reconciled (Priority: P2)

As a reviewer, I want each returning domain to either reuse, rewrite or delete the code from specs 020–033, so that dead code does not accumulate.

**Acceptance Scenarios**:

1. **Given** a returning domain, **When** its plan is written, **Then** it lists the existing `src/` modules for that domain and marks each Keep, Change or Delete (as in the review's Keep/Change/Delete table).
2. **Given** the PR, **When** it merges, **Then** every module marked Delete is gone in the same PR.
3. **Given** pure domain/engine logic (geometry, BOM, nesting, drawings), **When** it is kept, **Then** it stays framework-free and gains server persistence only through the 043 adapter pattern.

### Edge Cases

- A domain needs a table the live schema lacks: new forward migration with RLS and pgTAP in the same PR; never restore an archived 034.x migration.
- A domain needs background work (e.g. video walkthrough from 027): it reuses the 051 job queue and worker pattern, not a new outbox.
- A domain needs plan gating: billing must have returned first; until then, the capability is available to all studios or hidden behind a studio-level flag in the database.
- An agent marks tasks done without evidence: rejected per constitution 2.3.0 Definition of Done.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Each returning domain MUST be a new spec (054 onward) re-specified against the live schema and constitution 2.3.0.
- **FR-002**: Each MUST ship its migrations and pgTAP policy tests in the same PR; CI MUST apply and run them.
- **FR-003**: Each PR MUST link a green CI run and a Vercel preview URL that a person signed into and used.
- **FR-004**: Each PR SHOULD be one user-visible change under ~400 changed lines; larger domains split into slices, each with its own gate written first.
- **FR-005**: Each plan MUST include a Keep/Change/Delete inventory of existing code for that domain; deletions land in the same PR.
- **FR-006**: Secrets MUST live only in Vercel functions that verify the user token, or in webhook handlers with signature verification by the provider's official SDK and a narrowly-granted database function.
- **FR-007**: Background work MUST use the 051 job pattern.
- **FR-008**: Billing MUST process Razorpay events only from a server-side webhook with signature verification; entitlement changes MUST be written by a private database function, never by the browser.
- **FR-009**: Client portal access MUST use expiring signed share links (047), never public buckets or unauthenticated table reads.
- **FR-010**: The order in User Story 2 MUST be recorded in `docs/ROADMAP.md` and changed only by a dated decision.

### Key Entities

- **Re-entry checklist**: spec link, migration list, pgTAP files, CI run link, preview URL, sign-in confirmation, Keep/Change/Delete inventory.
- **Domain tracker**: ordered list with status per domain.

## Success Criteria *(mandatory)*

- **SC-001**: 035 lifecycle and approvals merges with a complete re-entry checklist.
- **SC-002**: Zero PRs merged in Phase 6 without pgTAP tests for new tables.
- **SC-003**: Supabase security advisor stays at zero findings after each domain merges.
- **SC-004**: Dead-code inventory for specs 020–033 shrinks with each returning domain.

## Assumptions

- Customer demand may reorder items (4)–(6), but never ahead of (1)–(3).
- Each domain is one founder-plus-agents effort of 1–2 weeks.

## Out of Scope

Building any specific domain in this spec; enterprise SSO; data residency.

## Gate

The first returning domain (035 lifecycle and approvals) is merged with its re-entry checklist complete, and the advisor still shows zero findings.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: process spec — each returning domain registers its own module in its own spec.

### 2. Subscription Entitlement Requirements
Each returning domain MUST declare its entitlements; plan gating becomes enforceable only after billing returns (order item 2).

### 3. Usage and Commercial Limits
Each returning domain MUST declare quotas; metered usage reuses the 045 credit pattern or a billing-backed equivalent.

### 4. RBAC Requirements
Each returning domain MUST map its actions to `org_role` (or a database-backed permission model if custom roles return) enforced by RLS.

### 5. Multi-Tenant Requirements
Every new table carries `org_id` with RLS via `private.is_org_member`; storage under `<org_id>/` prefixes; workers take tenant context from the job row.

### 6. Subscription Lifecycle Behavior
Defined per domain once billing has returned.

### 7. Enforcement Requirements
Enforcement is in Postgres (RLS, RPCs) and in token-verifying functions; browser checks only affect visibility.

### 8. Acceptance Criteria and Security Tests
Never optional: every returning domain ships tenant-isolation, RBAC and anonymous-denial pgTAP tests, run by the CI `db` job, plus Playwright on a seeded, signed-in user.
