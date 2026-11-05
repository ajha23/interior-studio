# Feature Specification: 041 — Supabase Baseline and Local Stack

**Feature Branch**: `041-supabase-baseline`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 1 — Identity and one database (estimate 2–3 days)
**Depends on**: 040
**Blocks**: 042, 043, 044, 045, 048
**Source**: Architecture Review (Database: schema drift; Phase 1) and Playbook (041)

## Context

The repo's `supabase/migrations` holds `00001`–`00012` (2,922 lines) that were never applied to any database. The live project `interior-studio` (ref `pkbctmaiawztzmwqkpgw`, Mumbai, Postgres 17) holds 17 applied migrations from Oct 24 (`phase0_core_schema` to `quotes`), 16 tables with RLS, and the team's data. Every review of 034.x checked SQL that never ran.

The live schema is stronger than the repo's: private helpers `is_org_member`, `can_edit_org`, `can_admin_org`; an `org_role` enum (owner, admin, designer, viewer); five private storage buckets; an AI credit ledger with `ai_debit`; and `save_project_version`. This spec makes that schema the single source of truth and gives every developer and CI run a reproducible local copy with tenant-isolation tests.

## Clarifications

### Session 2026-11-05

- Q: When a new isolation test shows the live database already allows something it shouldn't, should spec 041 fix the policy or only record the problem? → A: Fix every gap found, as new forward migrations in 041 (Option A).
- Q: Should spec 041's fix migrations be applied to the live production database in this spec, or wait for spec 048's deploy pipeline? → A: Apply in 041. After the suite passes locally, take a fresh backup, then the founder runs `supabase db push` to production; `db diff` is then checked against live and must be empty (Option A).
- Q: Should the cross-tenant tests cover every studio-owned table, or only `projects` and `project_versions`? → A: Every table with an `org_id`, or linked to a studio through a parent row, gets cross-tenant select/insert/update/delete tests; anonymous denial on all `public` tables (Option B).

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Reproducible local database (Priority: P1)

As a developer, I want one command to build a local Supabase identical to production, so that I can develop and test against the real schema.

**Why this priority**: Nothing in Phases 1–5 can be tested without it.

**Independent Test**: On a clean machine with Docker, `npm run db:start && npm run db:reset` completes with zero errors and the 16 live tables exist locally.

**Acceptance Scenarios**:

1. **Given** a fresh clone with Docker running, **When** I run `npm run db:start` then `npm run db:reset`, **Then** all 17 migrations apply in order with zero errors and the seed loads.
2. **Given** the CLI linked to the live project, **When** I run `npx supabase db diff --remote`, **Then** it reports no differences.
3. **Given** `supabase migration list --remote`, **When** I compare local and remote columns, **Then** every version matches.

---

### User Story 2 — Tenant isolation proven by tests (Priority: P1)

As the founder, I want automated proof that one studio cannot touch another studio's data in any table, so that isolation is a test result, not a claim.

**Why this priority**: Constitution 2.3.0 item 8 — never optional.

**Independent Test**: `npm run db:test` passes; dropping one policy on any studio-owned table makes a cross-tenant test fail.

**Acceptance Scenarios**:

1. **Given** the seeded studios A and B, **When** a studio A user (any role) selects from any studio-owned table, **Then** only studio A rows are returned.
2. **Given** a studio A user, **When** they try to insert, update or delete a studio B row in any studio-owned table, **Then** the statement affects zero rows or raises a policy violation.
3. **Given** the table classification (FR-013), **When** the coverage test runs, **Then** it fails if any `public` table is unclassified or a studio-owned table has no cross-tenant test.
4. **Given** the `anon` role, **When** it selects from any `public` table, **Then** it reads zero rows.
5. **Given** the catalog, **When** the RLS-coverage test runs, **Then** it fails if any table in `public` has RLS disabled.
6. **Given** a throwaway local migration that drops the select policy on `projects`, **When** `npm run db:test` runs, **Then** at least one cross-tenant test fails (demonstrated once and noted in the PR).

---

### User Story 3 — Generated, checked types (Priority: P2)

As a developer, I want TypeScript types generated from the database and a check that fails when they are stale, so that app code never drifts from the schema.

**Why this priority**: Specs 042–045 consume these types.

**Independent Test**: `npm run db:types:check` passes on a clean tree and fails after a migration is added without regenerating.

**Acceptance Scenarios**:

1. **Given** the local stack, **When** I run `npm run db:types`, **Then** `src/infrastructure/supabase/database.types.ts` is written and committed.
2. **Given** a new migration adding a column, **When** I run `npm run db:types:check` without regenerating, **Then** it exits non-zero with a message naming the stale file.

---

### User Story 4 — Archive the unapplied 034.x migrations (Priority: P2)

As a reviewer, I want `00001`–`00012` out of the active migration path but preserved with context, so that nobody applies or reviews them by mistake and their good ideas are not lost.

**Independent Test**: `supabase/migrations` contains only the live history; `docs/archive/migrations-034/README.md` explains the archive.

**Acceptance Scenarios**:

1. **Given** the repo after this spec, **When** I list `supabase/migrations`, **Then** it holds the 17 live migrations plus any FR-011 fix migrations, every one also applied to production, and nothing numbered `000NN_`.
2. **Given** `docs/archive/migrations-034/`, **When** I read its README, **Then** it says the files were never applied and names the ideas to port: revision compare-and-swap, idempotency keys, an append-only audit table.

### Edge Cases

- `supabase migration fetch` is unavailable in the pinned CLI: fall back to `supabase db pull` into one baseline file and `supabase migration repair` so the remote history table matches; record which path was used.
- Live migrations reference extensions or roles absent locally (e.g. `pg_graphql`, `supabase_vault`): the local `config.toml` enables them; never edit a fetched migration to work around it.
- The live schema contains objects created outside migrations (dashboard edits): `db diff --remote` surfaces them; they become a new migration in this spec, applied to live with `migration repair` only after review.
- Seed users must never use real emails; the seed uses `@example.test` addresses.
- Restoring files from git history at `eaf7d0f` is forbidden: their version stamps differ from the live history.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Supabase CLI MUST be a pinned devDependency and invoked via `npx`; `supabase/config.toml` MUST be committed.
- **FR-002**: `supabase/migrations` MUST contain the live project's 17 migrations (`20261024082809` to `20261024193725`) with version stamps identical to the remote history, followed by any fix migrations from FR-011.
- **FR-003**: `00001`–`00012` MUST move to `docs/archive/migrations-034/` with a README (User Story 4).
- **FR-004**: `supabase/seed.sql` MUST create synthetic data only (every email ends in `@example.test`): two studios; in each, users with roles owner, admin, designer and viewer (rows in `auth.users` and `auth.identities`); one user who belongs to no studio; two projects per studio with at least two versions each; and at least one row in every other studio-owned table for both studios, so cross-tenant "0 rows" results are meaningful (see data-model.md).
- **FR-005**: Types MUST be generated into `src/infrastructure/supabase/database.types.ts`; `db:types:check` MUST regenerate to a temp file and diff.
- **FR-006**: `supabase/tests/*.test.sql` MUST contain pgTAP tests for: RLS enabled on every `public` table; cross-tenant select/insert/update/delete denial on every studio-owned table (FR-013); `anon` reads nothing from any `public` table. Cross-tenant tests SHOULD be one reusable pattern run over the studio-owned table list, not hand-written per table.
- **FR-007**: Tests MUST impersonate users with `set local role authenticated` and `set local request.jwt.claims`; no extra test-helper extension unless a test cannot be written without one.
- **FR-008**: `package.json` MUST add scripts `db:start`, `db:reset`, `db:test`, `db:types`, `db:types:check`.
- **FR-009**: From this spec on, every schema change MUST be a new file from `supabase migration new`; migrations on `main` MUST never be edited. This rule MUST be written into `AGENTS.md`.
- **FR-010**: No file under `src/` other than the generated types file may change.
- **FR-011**: Every policy gap the pgTAP suite exposes on the 17 baseline migrations (cross-tenant access, anonymous access, or a role able to write what it should not) MUST be fixed in this spec by a new forward migration from `supabase migration new`, never by editing a fetched migration. Each fix MUST be listed in the PR with the test that exposed it. No test may be left as `todo` or skipped to hide a gap.
- **FR-012**: Fix migrations MUST reach production within this spec, in this order: (1) `npm run db:reset && npm run db:test` pass locally; (2) a fresh schema + data backup is taken to `~/backups/interior-studio/` and its row counts checked; (3) `supabase db push --dry-run` against production shows only the new fix migrations; (4) the founder runs `supabase db push` (an agent never pushes to production); (5) `supabase migration list` shows local and remote identical and `db diff` against production is empty. If no gap is found, steps 2–4 are skipped. `supabase migration repair --remote` (used only to record dashboard-made objects as applied) also writes to production: it is founder-only and needs a fresh backup first.
- **FR-013**: Every `public` table MUST be classified in one list kept beside the tests: **studio-owned** (has `org_id`, or reaches a studio through a parent row, e.g. `project_versions` → `projects`); **user-owned** (e.g. `profiles`: a user reads and writes only their own row, plus profiles of members of their studios if the live policy allows); or **shared reference** (e.g. a global catalog: read-only to signed-in users, no client writes). Each class has its own isolation test; a new table that is not classified fails the suite.
- **FR-014**: `.github/workflows/ci.yml` MUST gain a `db` job that runs on every pull request and push to `main`: `npm ci`, `npm run db:start`, `npm run db:reset`, `npm run db:test`, `npm run db:types:check`. It needs no secrets and never targets production. Making it a required check, caching and the deploy pipeline stay in spec 048. This satisfies the constitution's Definition of Done item 2 for this spec.

### Key Entities (existing live schema, unchanged)

- **organizations / org_members**: studio and membership with `org_role`.
- **org_invites**: pending email invites.
- **profiles**: one per auth user, created by `private.handle_new_user`.
- **projects / project_versions**: project metadata and full scene snapshots.
- **ai_credit_ledger / ai_jobs / renders**: metering and job records.
- **Storage buckets**: `models`, `renders`, `ai`, `plans`, `render-jobs` (private).

## Success Criteria *(mandatory)*

- **SC-001**: `db:reset` on a clean machine finishes with zero errors in under 2 minutes.
- **SC-002**: `db diff --remote` output is empty.
- **SC-003**: `db:test` passes; the deliberate policy drop makes it fail.
- **SC-004**: `db:types:check` passes in the CI `db` job on the PR and on `main` after merge.

## Assumptions

- Docker Desktop is available to developers and CI runners.
- The live project's migration history is authoritative even where it is imperfect; fixes are forward migrations (046).
- Advisor warnings on the live database (3 definer functions, leaked-password protection) are known and deferred to 046.

## Out of Scope

Sign-in UI, any app code, new tables, making the CI `db` job a required check and the deploy pipeline (048), and advisor warnings that no isolation or role test exposes (definer grants, `search_path`, leaked-password protection: 046). Policy gaps the tests expose are in scope (FR-011).

## Gate

All four acceptance commands pass on the founder's machine; `db diff --remote` is empty.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: foundation spec — infrastructure only, no product module.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec — no capability gated.

### 3. Usage and Commercial Limits
Not applicable: foundation spec — no quotas added.

### 4. RBAC Requirements
Not applicable: foundation spec — uses the existing `org_role` enum unchanged; seed covers owner, admin, designer and viewer, plus one user in no studio.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: every studio-owned table in the FR-013 classification (including `projects`, `project_versions`, `org_members`, `org_invites`, `ai_credit_ledger`, `ai_jobs`, `renders`).
- **Tenant Isolation Requirements**: boundary is `org_id`, checked through `private.is_org_member`; RLS on every `public` table.
- **Storage and Cache Isolation**: unchanged here; storage policies are tested in 047.
- **Background Worker Tenant Context**: none in this spec.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
Not applicable: foundation spec — enforcement remains the live RLS; this spec only tests it.

### 8. Acceptance Criteria and Security Tests
- **Tenant Isolation Tests**: pgTAP cross-tenant select/insert/update/delete on every studio-owned table, as owner, admin, designer and viewer of studio A against studio B; own-row-only tests for user-owned tables; no-write tests for shared reference tables (none exist today; the class is kept for future tables).
- **RBAC Permission Tests**: viewer cannot insert into `project_versions` in its own studio; if the live policy allows it, a fix migration lands in this spec (FR-011).
- **Anonymous Tests**: `anon` reads zero rows from every `public` table.
- **Coverage Test**: fails when any `public` table lacks RLS.
- **Mutation Test**: dropping one policy turns the suite red (shown once).
