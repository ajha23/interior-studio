# Feature Specification: 048 — CI Database Gate and Gated Deploys

**Feature Branch**: `048-ci-db-gate`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 3 — CI/CD gate (estimate 4–5 days, runs alongside Phase 2)
**Depends on**: 041
**Blocks**: 046 (staging project), 049, 051, 052; lifts the feature freeze
**Source**: Architecture Review (CI/CD: no database in CI; no gated migration deploy; no supply-chain checks) and Playbook (048)

## Context

`.github/workflows/ci.yml` runs lint, typecheck, unit tests, build and Playwright, and never starts Postgres. Merging to `main` deploys the app through Vercel's Git integration, but nothing deploys the schema. That is how 12 migrations were written, reviewed and "completed" without ever being applied.

This spec turns the constitution 2.3.0 rules into CI checks that cannot be argued with, adds a staging environment, and makes production deploys migrate the database before promoting the app, with a human approval step. When it merges, the feature freeze lifts.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Broken isolation cannot merge (Priority: P1)

As the founder, I want any PR that weakens tenant isolation to fail CI, so that security does not depend on reviewers noticing.

**Why this priority**: The foundation's single most important guarantee.

**Independent Test**: A throwaway PR that disables RLS on one table fails the `db` job.

**Acceptance Scenarios**:

1. **Given** a PR with a migration that disables RLS on any `public` table, **When** CI runs, **Then** the `db` job fails.
2. **Given** a PR changing a policy so studio B can read studio A, **When** CI runs, **Then** the `db` job fails.
3. **Given** a PR that adds a migration without regenerating types, **When** CI runs, **Then** the `db` job fails at `db:types:check`.
4. **Given** branch protection on `main`, **When** any required job fails, **Then** the PR cannot merge.

---

### User Story 2 — Secrets and vulnerable dependencies are caught (Priority: P1)

As the founder, I want committed secrets and known-vulnerable production dependencies to fail CI, so that leaks and supply-chain issues are caught before merge.

**Acceptance Scenarios**:

1. **Given** a PR containing a fake secret (e.g. a string matching a provider key pattern), **When** CI runs, **Then** the `security` job fails (gitleaks).
2. **Given** a production dependency with a known high or critical advisory, **When** CI runs, **Then** the `security` job fails (osv-scanner or `npm audit --omit=dev`), with an allowlist file for accepted exceptions that require a reason and expiry.
3. **Given** Renovate is configured, **When** a week passes, **Then** dependency updates arrive as grouped weekly PRs that run the full pipeline.

---

### User Story 3 — Schema and app deploy together, safely (Priority: P1)

As the founder, I want merges to `main` to migrate staging, test it, wait for my approval, migrate production and then deploy the app, so that production code never runs against a schema it does not expect.

**Independent Test**: A merge to `main` shows the deploy workflow: staging migrate → staging smoke → approval → production migrate → Vercel production deploy.

**Acceptance Scenarios**:

1. **Given** a merge to `main`, **When** the deploy workflow runs, **Then** it runs `supabase db push` to staging, then Playwright smoke tests against staging.
2. **Given** staging smoke passed, **When** the workflow reaches the `production` GitHub environment, **Then** it waits for the founder's approval.
3. **Given** approval, **When** it continues, **Then** it runs `supabase db push` to production, then deploys the Vercel production build with the Vercel CLI.
4. **Given** Vercel's Git integration, **When** I check settings, **Then** automatic production deploys from `main` are off and preview deploys stay automatic.
5. **Given** a failure at any step, **When** it occurs, **Then** later steps do not run and the workflow reports which step failed.

---

### User Story 4 — Three environments (Priority: P2)

As a developer, I want local, staging and production environments with clear wiring, so that previews never touch production data.

**Acceptance Scenarios**:

1. **Given** a Vercel preview, **When** it loads, **Then** it talks to the staging Supabase project.
2. **Given** production, **When** it loads, **Then** it talks to the production project.
3. **Given** a developer machine, **When** `npm run db:start` runs, **Then** the app uses the local stack.

---

### User Story 5 — Recover from a bad deploy (Priority: P2)

As the founder, I want a written rollback procedure, so that a bad release is undone in minutes, not hours.

**Acceptance Scenarios**:

1. **Given** `docs/runbooks/rollback.md`, **When** I follow it, **Then** I can redeploy the previous Vercel build and write a forward-fix migration.
2. **Given** `docs/`, **When** I read the migration rules, **Then** they state expand-then-contract: migrations must be backward compatible with the previous app version because the database migrates before the app deploys.

### Edge Cases

- Supabase Docker images make CI slow: cache them; PR pipeline budget under 12 minutes.
- Flaky Playwright tests: retries at most 1 in CI; a flaky test is fixed or quarantined with an issue, never silently skipped.
- A migration succeeds on staging but fails on production (data-dependent): the app deploy does not run; the runbook covers the forward fix.
- Secrets missing in a fork PR: database and e2e jobs run on the local stack and need no secrets; deploy jobs never run on forks.
- The old `ci.yml` must keep working until the new jobs are required, then is deleted in the same PR.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Environments MUST be local (Supabase CLI), staging (a second Supabase project in Mumbai) and production. Vercel previews use staging; production uses production.
- **FR-002**: The PR workflow MUST have four jobs, all required by branch protection on `main`:
  - `check`: lint, typecheck, unit tests, build, bundle-size budget (ratcheted at today's size until 049 lowers it).
  - `db`: `supabase start`, `db reset`, `test db` (pgTAP), `db:types:check`, `db lint`.
  - `e2e`: Playwright against the built app and the local Supabase stack with seeded users.
  - `security`: gitleaks secret scan and dependency audit for production dependencies.
- **FR-003**: The deploy workflow on push to `main` MUST run: staging `db push` → staging Playwright smoke → `production` environment approval (founder as required reviewer) → production `db push` → Vercel production deploy via CLI.
- **FR-004**: Vercel automatic production deploys from `main` MUST be disabled; previews stay automatic.
- **FR-005**: The expand-then-contract migration rule MUST be documented in `docs/`.
- **FR-006**: Renovate MUST be configured with weekly grouped updates.
- **FR-007**: `docs/runbooks/rollback.md` MUST describe redeploying the previous Vercel build and writing a forward-fix migration.
- **FR-008**: Workflows MUST use GitHub Actions only, with every third-party action pinned by commit SHA.
- **FR-009**: CI MUST reuse the npm scripts from 041 so local and CI run the same commands.
- **FR-010**: Required GitHub secrets MUST be: `SUPABASE_ACCESS_TOKEN`, `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD`, `PRODUCTION_PROJECT_REF`, `PRODUCTION_DB_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- **FR-011**: The PR pipeline MUST finish in under 12 minutes, caching Supabase images and Playwright browsers.
- **FR-012**: On merge, the freeze line MUST be removed from `docs/ROADMAP.md`.

### Key Entities

- **Workflow**: PR pipeline (4 jobs); deploy pipeline (5 steps).
- **Environment**: local, staging, production, each with its own Supabase project and env vars.
- **Branch protection rule**: required checks on `main`.

## Success Criteria *(mandatory)*

- **SC-001**: Five throwaway PRs (RLS off, cross-tenant policy, stale types, fake secret, normal merge) behave as specified, each linked in the PR description.
- **SC-002**: Branch protection lists `check`, `db`, `e2e`, `security` as required.
- **SC-003**: PR pipeline median duration under 12 minutes.
- **SC-004**: The first production deploy after merge shows migrate-before-promote with an approval record.

## Assumptions

- Supabase branching is not used yet; a second project is simpler and costs about $10/month.
- The founder is the sole required reviewer for production deploys until a second maintainer exists.

## Out of Scope

Lighthouse CI and per-route bundle budgets (049); Sentry release uploads (052).

## Gate

The five throwaway PRs behave as listed, and branch protection shows the four jobs as required. Then the freeze line is removed from `docs/ROADMAP.md`.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: foundation spec — CI/CD infrastructure.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec.

### 3. Usage and Commercial Limits
Not applicable: foundation spec.

### 4. RBAC Requirements
Not applicable: foundation spec — only GitHub environment reviewers change.

### 5. Multi-Tenant Requirements
- **Tenant Isolation Requirements**: enforced by the `db` job on every PR: RLS coverage and cross-tenant pgTAP tests.
- **Storage and Cache Isolation**: staging and production never share data; previews use staging.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Backend**: enforced by CI — no merge without passing policy tests; no production schema change without staging success and approval.

### 8. Acceptance Criteria and Security Tests
- **Tenant Isolation Tests**: the `db` job runs every pgTAP suite from 041–047 on every PR.
- **Gate Tests**: the five throwaway PRs in SC-001.
- **Supply-chain Tests**: gitleaks and dependency audit on every PR.
