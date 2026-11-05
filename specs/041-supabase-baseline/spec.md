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

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Reproducible local database (Priority: P1)

As a developer, I want one command to build a local Supabase identical to production, so that I can develop and test against the real schema.

**Why this priority**: Nothing in Phases 1–5 can be tested without it.

**Independent Test**: On a clean machine with Docker, `npm run db:start && npm run db:reset` completes with zero errors and the 16 live tables exist locally.

**Acceptance Scenarios**:

1. **Given** a fresh clone with Docker running, **When** I run `npm run db:start` then `npm run db:reset`, **Then** all 17 migrations apply in order with zero errors and the seed loads.
2. **Given** the CLI linked to the live project, **When** I run `npx supabase db diff --linked`, **Then** it reports no differences.
3. **Given** `supabase migration list --linked`, **When** I compare local and remote columns, **Then** every version matches.

---

### User Story 2 — Tenant isolation proven by tests (Priority: P1)

As the founder, I want automated proof that one studio cannot touch another's projects, so that isolation is a test result, not a claim.

**Why this priority**: Constitution 2.3.0 item 8 — never optional.

**Independent Test**: `npm run db:test` passes; dropping one policy on `projects` makes a cross-tenant test fail.

**Acceptance Scenarios**:

1. **Given** the seeded studios A and B, **When** a studio A user (any role) selects from `projects` or `project_versions`, **Then** only studio A rows are returned.
2. **Given** a studio A user, **When** they try to insert, update or delete a studio B row in `projects` or `project_versions`, **Then** the statement affects zero rows or raises a policy violation.
3. **Given** the `anon` role, **When** it selects from any `public` table, **Then** it reads zero rows.
4. **Given** the catalog, **When** the RLS-coverage test runs, **Then** it fails if any table in `public` has RLS disabled.
5. **Given** a throwaway local migration that drops the select policy on `projects`, **When** `npm run db:test` runs, **Then** at least one cross-tenant test fails (demonstrated once and noted in the PR).

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

1. **Given** the repo after this spec, **When** I list `supabase/migrations`, **Then** it holds exactly the 17 live migrations (and nothing numbered `000NN_`).
2. **Given** `docs/archive/migrations-034/`, **When** I read its README, **Then** it says the files were never applied and names the ideas to port: revision compare-and-swap, idempotency keys, an append-only audit table.

### Edge Cases

- `supabase migration fetch` is unavailable in the pinned CLI: fall back to `supabase db pull` into one baseline file and `supabase migration repair` so the remote history table matches; record which path was used.
- Live migrations reference extensions or roles absent locally (e.g. `pg_graphql`, `supabase_vault`): the local `config.toml` enables them; never edit a fetched migration to work around it.
- The live schema contains objects created outside migrations (dashboard edits): `db diff --linked` surfaces them; they become a new migration in this spec, applied to live with `migration repair` only after review.
- Seed users must never use real emails; the seed uses `@example.test` addresses.
- Restoring files from git history at `eaf7d0f` is forbidden: their version stamps differ from the live history.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The Supabase CLI MUST be a pinned devDependency and invoked via `npx`; `supabase/config.toml` MUST be committed.
- **FR-002**: `supabase/migrations` MUST contain the live project's 17 migrations with version stamps identical to the remote history.
- **FR-003**: `00001`–`00012` MUST move to `docs/archive/migrations-034/` with a README (User Story 4).
- **FR-004**: `supabase/seed.sql` MUST create synthetic data only: two studios; in each, users with roles owner, designer and viewer (rows in `auth.users` and `auth.identities`); two projects per studio with at least two versions each.
- **FR-005**: Types MUST be generated into `src/infrastructure/supabase/database.types.ts`; `db:types:check` MUST regenerate to a temp file and diff.
- **FR-006**: `supabase/tests/*.test.sql` MUST contain pgTAP tests for: RLS enabled on every `public` table; cross-tenant select/insert/update/delete denial on `projects` and `project_versions`; `anon` reads nothing.
- **FR-007**: Tests MUST impersonate users with `set local role authenticated` and `set local request.jwt.claims`; no extra test-helper extension unless a test cannot be written without one.
- **FR-008**: `package.json` MUST add scripts `db:start`, `db:reset`, `db:test`, `db:types`, `db:types:check`.
- **FR-009**: From this spec on, every schema change MUST be a new file from `supabase migration new`; migrations on `main` MUST never be edited. This rule MUST be written into `AGENTS.md`.
- **FR-010**: No file under `src/` other than the generated types file may change.

### Key Entities (existing live schema, unchanged)

- **organizations / org_members**: studio and membership with `org_role`.
- **org_invites**: pending email invites.
- **profiles**: one per auth user, created by `private.handle_new_user`.
- **projects / project_versions**: project metadata and full scene snapshots.
- **ai_credit_ledger / ai_jobs / renders**: metering and job records.
- **Storage buckets**: `models`, `renders`, `ai`, `plans`, `render-jobs` (private).

## Success Criteria *(mandatory)*

- **SC-001**: `db:reset` on a clean machine finishes with zero errors in under 2 minutes.
- **SC-002**: `db diff --linked` output is empty.
- **SC-003**: `db:test` passes; the deliberate policy drop makes it fail.
- **SC-004**: `db:types:check` passes on `main` after merge.

## Assumptions

- Docker Desktop is available to developers and CI runners.
- The live project's migration history is authoritative even where it is imperfect; fixes are forward migrations (046).
- Advisor warnings on the live database (3 definer functions, leaked-password protection) are known and deferred to 046.

## Out of Scope

Sign-in UI, any app code, new tables, fixing advisor warnings (046), CI wiring (048).

## Gate

All four acceptance commands pass on the founder's machine; `db diff --linked` is empty.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: foundation spec — infrastructure only, no product module.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec — no capability gated.

### 3. Usage and Commercial Limits
Not applicable: foundation spec — no quotas added.

### 4. RBAC Requirements
Not applicable: foundation spec — uses the existing `org_role` enum unchanged; seed covers owner, designer and viewer.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: `projects`, `project_versions` and every org-scoped live table.
- **Tenant Isolation Requirements**: boundary is `org_id`, checked through `private.is_org_member`; RLS on every `public` table.
- **Storage and Cache Isolation**: unchanged here; storage policies are tested in 047.
- **Background Worker Tenant Context**: none in this spec.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
Not applicable: foundation spec — enforcement remains the live RLS; this spec only tests it.

### 8. Acceptance Criteria and Security Tests
- **Tenant Isolation Tests**: pgTAP cross-tenant select/insert/update/delete on `projects` and `project_versions` for owner, designer and viewer of studio A against studio B.
- **RBAC Permission Tests**: viewer cannot insert into `project_versions` in its own studio (if the live policy says so; recorded either way).
- **Anonymous Tests**: `anon` reads zero rows from every `public` table.
- **Coverage Test**: fails when any `public` table lacks RLS.
- **Mutation Test**: dropping one policy turns the suite red (shown once).
