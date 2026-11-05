---
description: "Task list for 041 — Supabase Baseline and Local Stack"
---

# Tasks: 041 — Supabase Baseline and Local Stack

**Input**: Design documents from `specs/041-supabase-baseline/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/](contracts/), [quickstart.md](quickstart.md)

**Tests**: Requested by the spec (User Story 2, FR-006, FR-013). pgTAP tests are written before any fix migration; a failing test is a real gap (FR-011).

**Organization**: Tasks are grouped by user story. US1 and US2 are P1; US3 and US4 are P2.

**Evidence rule (constitution 2.3.0)**: a task is checked only when its command was run and its output is pasted into the session or PR. No `todo`, `skip` or commented-out assertions.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Pin the CLI and create the local Supabase project files.

- [X] T001 Confirm prerequisites and record output: `docker info` succeeds (start with `colima start` if not), `npx supabase --version` prints `3.0.0`, and `git status` is clean on branch `041-supabase-baseline`
- [X] T002 Add the CLI as an exact devDependency: `npm install --save-dev --save-exact supabase@3.0.0`; verify `package.json` lists `"supabase": "3.0.0"` and `package-lock.json` is updated
- [X] T003 Run `npx supabase init` in the repo root (keep existing `supabase/migrations/`); answer no to editor settings so only `supabase/config.toml` and `supabase/.gitignore` are created
- [X] T004 Edit `supabase/config.toml` per research R3: `project_id = "interior-studio"`; `[db] major_version = 17`; default ports 54321–54327; `[db.seed] enabled = true` with `sql_paths = ["./seed.sql"]`; `[auth.email] enable_signup = true`; `[auth.external.google] enabled = false`
- [X] T005 Add npm scripts to `package.json` exactly as in [contracts/npm-scripts.md](contracts/npm-scripts.md): `db:start` (`npx supabase start`), `db:reset` (`npx supabase db reset`), `db:test` (`npx supabase test db`), `db:types` (`npx supabase gen types typescript --local --schema public > src/infrastructure/supabase/database.types.ts`), `db:types:check` (script in T006)
- [X] T006 Create `scripts/db-types-check.mjs`: regenerate types to a temp file with the same command as `db:types`, compare with `src/infrastructure/supabase/database.types.ts`, exit 0 when identical, otherwise exit 1 and print `Stale generated types: src/infrastructure/supabase/database.types.ts — run npm run db:types`; wire it as `"db:types:check": "node scripts/db-types-check.mjs"` in `package.json`

**Checkpoint**: `npx supabase --version` resolves to the local `3.0.0`; `npm run db:start` brings the stack up.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Replace the unapplied migrations with the live history. Every story depends on this.

**⚠️ CRITICAL**: The archive move (T007) must happen before the fetch (T008), or `db reset` would apply 034.x SQL that production never ran.

- [X] T007 Move the 12 unapplied migrations with history kept: `mkdir -p docs/archive/migrations-034 && git mv supabase/migrations/000*.sql docs/archive/migrations-034/`; verify `ls supabase/migrations` is empty
- [X] T008 Fetch the live history: `npx supabase migration fetch --remote`; verify `supabase/migrations/` holds exactly 17 files whose versions run from `20261024082809` to `20261024193725` (research R1). If `fetch` fails, stop and use the spec's fallback (`db pull` + `migration repair`), recording which path was used
- [X] T009 Run `npx supabase migration list --remote` and paste the output: all 17 versions appear in both the local and remote columns, and no `000NN` row remains
- [X] T010 Run `npm run db:start` then `npm run db:reset` with no `supabase/seed.sql` yet; paste output showing every migration applied with zero errors

**Checkpoint**: The local database is built from production's exact history.

---

## Phase 3: User Story 1 — Reproducible local database (Priority: P1) 🎯 MVP

**Goal**: One command builds a local Supabase identical to production, with synthetic data for two studios.

**Independent Test**: On a clean checkout with Docker running, `npm run db:start && npm run db:reset` finishes with zero errors in under 2 minutes, and `npx supabase db diff --remote` prints no SQL.

### Implementation for User Story 1

- [X] T011 [US1] Run `npx supabase db diff --remote` and paste the output. If it is empty, go to T013. If it shows objects that exist live but in no migration (dashboard edits), continue with T012
- [X] T012 [US1] Only if T011 found drift: **Not needed: T011 `db diff --remote` (public, private, storage) was empty on 2026-11-05.** `npx supabase migration new capture_dashboard_objects`, put the exact SQL from the diff in `supabase/migrations/<timestamp>_capture_dashboard_objects.sql`, rerun `npm run db:reset`, then mark it applied on production without running it: `npx supabase migration repair --status applied <timestamp> --remote` (the founder runs this command, since it writes to production's history table); rerun `db diff --remote` until empty
- [X] T013 [US1] Write `supabase/seed.sql` per [data-model.md](data-model.md): studios `Alpha Studio` (slug `alpha`) and `Beta Studio` (slug `beta`) with fixed UUIDs; per studio four users `owner.<x>@example.test`, `admin.<x>@example.test`, `designer.<x>@example.test`, `viewer.<x>@example.test` inserted into `auth.users` and `auth.identities` (provider `email`), plus `stranger@example.test` in no studio; `org_members` rows with role values from the live `org_role` enum ('owner', 'admin', 'designer', 'viewer'); "every email ends in `@example.test`"
- [X] T014 [US1] Extend `supabase/seed.sql` with tenant data for both studios: 2 `projects` per studio, 2 `project_versions` per project (one 'autosave', one 'manual', using live `version_kind` values), and at least one row in each of `org_invites`, `ai_credit_ledger`, `ai_jobs`, `ai_settings`, `catalog_models`, `comments`, `price_lists`, `quotes`, `renders`, `room_templates`, `share_links` per studio, satisfying each table's NOT NULL and check constraints in the fetched migrations; `profiles` rows come from the `handle_new_user` trigger, not direct inserts. Check what the live triggers `private.comments_guard`, `private.share_links_freeze_token` and `private.renders_engine_default` do to inserted rows before writing those three tables' seed rows
- [X] T015 [US1] Run `npm run db:reset` and paste output; then as `postgres` run a row count per table (`select 'projects', count(*) from public.projects union all …`) and confirm every studio-owned table has rows for both studios, `profiles` has 9 rows, and `organizations` has 3 (Alpha, Beta, plus `Interior Studio` created by the live migration `20261024082852_phase0_invites_fix_and_seed`)
- [X] T016 [US1] Time a full rebuild (`time npm run db:reset`) and record that it is under 2 minutes (SC-001), noting that Docker images were already cached; the clean-machine number comes from the CI `db` job in T036

**Checkpoint**: US1 independent test passes; `db diff --remote` is empty.

---

## Phase 4: User Story 2 — Tenant isolation proven by tests (Priority: P1)

**Goal**: Automated proof that no studio can touch another studio's data in any table, anonymous callers read nothing, and roles hold.

**Independent Test**: `npm run db:test` passes; dropping one policy on any studio-owned table turns it red.

### Tests for User Story 2 (write first; every failure is a gap for T024)

- [X] T017 [P] [US2] Write `supabase/tests/00_classification.test.sql` per [contracts/pgtap-suite.md](contracts/pgtap-suite.md): a literal list of the 16 classified tables from [data-model.md](data-model.md) (14 studio-owned, `organizations` as studio self, `profiles` as user-owned); assert `pg_tables where schemaname = 'public'` equals that list exactly (fails on any unclassified table); assert `relrowsecurity` is true for every `public` table
- [X] T018 [P] [US2] Write `supabase/tests/01_anon.test.sql`: `set local role anon` with `request.jwt.claims` cleared; for every `public` table assert `select count(*)` = 0; assert an insert into `projects` and `org_members` raises `42501` or affects zero rows
- [X] T019 [P] [US2] Write `supabase/tests/02_cross_tenant.test.sql`: inside the test transaction define a PL/pgSQL helper that, for a given table name and studio B id, runs as the impersonated studio A user (research R5) `select count(*) … where org_id = B` = 0, `update … set org_id = org_id where org_id = B returning 1` = 0 rows, `delete … where org_id = B returning 1` = 0 rows; then, as `postgres`, asserts studio B's row count is unchanged; run it for all 14 studio-owned tables for each of owner.a, admin.a, designer.a and viewer.a; add a positive control per table that the same user sees at least one studio A row
- [X] T020 [US2] Extend `supabase/tests/02_cross_tenant.test.sql` with one explicit insert per studio-owned table using `org_id = B` (and a studio B `project_id` where the table has one), as designer.a and owner.a, each expected to raise `42501` with `throws_ok`; add one insert of a studio A `quotes`, `renders`, `share_links` and `comments` row pointing at a studio B `project_id`, expected to fail (`project_in_org`); also `organizations`: studio A user cannot select or update studio B's row
- [X] T021 [P] [US2] Write `supabase/tests/03_roles.test.sql` asserting the live rules in [data-model.md](data-model.md): viewer.a cannot insert or update `projects` in studio A; designer.a cannot insert `org_invites` nor update `org_members`; admin.a cannot update or delete an owner's `org_members` row; nobody (owner.a included) can insert, update or delete `project_versions` or `ai_jobs` directly; viewer.a cannot insert into `project_versions` (FR-011 RBAC test)
- [X] T022 [P] [US2] Write `supabase/tests/04_profiles.test.sql`: designer.a updates own profile (1 row); designer.a cannot update owner.a's profile (0 rows); designer.a sees owner.a's profile (co-member) and does not see `stranger@example.test`'s or any studio B member's profile
- [X] T023 [US2] Run `npm run db:test` and paste the full output. List every failing assertion with the table, role and operation; each one is a gap for T024. If all pass, record "no gaps found" and skip T024–T025

### Implementation for User Story 2

- [X] T024 [US2] For each gap from T023, create one migration with `npx supabase migration new fix_<table>_<gap>` and write the smallest policy change that closes it, using the existing `private.is_org_member` / `can_edit_org` / `can_admin_org` helpers and schema-qualified names; never edit a fetched migration (FR-009, FR-011)
- [X] T025 [US2] Rerun `npm run db:reset && npm run db:test` until all tests pass; write in the PR description a table of each fix migration and the test that exposed it
- [X] T026 [US2] Mutation check (not committed): `npx supabase migration new tmp_drop_projects_select` containing `drop policy "projects_select" on public.projects;`, run `npm run db:reset && npm run db:test`, paste the failing assertions from `02_cross_tenant`, then delete the file and run `npm run db:reset && npm run db:test` again to green
- [X] T027 [US2] Confirm `npm run db:test` passes twice in a row without a reset in between (tests roll back, per [contracts/npm-scripts.md](contracts/npm-scripts.md)) and record the duration (target under 60 s)

**Checkpoint**: US2 independent test passes; every gap found is fixed locally.

---

## Phase 5: User Story 3 — Generated, checked types (Priority: P2)

**Goal**: Database types committed under `src/` with a check that fails when stale.

**Independent Test**: `npm run db:types:check` passes on a clean tree and fails after a migration is added without regenerating.

- [X] T028 [US3] Run `npm run db:types`; verify `src/infrastructure/supabase/database.types.ts` exists and defines the 16 `public` tables and the `org_role`, `project_status` and `version_kind` enums
- [X] T029 [US3] Add `'src/infrastructure/supabase/database.types.ts'` to the `ignores` array in `eslint.config.js` (generated code; research R7)
- [X] T030 [US3] Run `npm run db:types:check` (exit 0) and `npm run typecheck` (passes); paste both outputs
- [X] T031 [US3] Prove the check fails: add a throwaway migration adding a column (`alter table public.price_lists add column tmp_check int;`), `npm run db:reset`, run `npm run db:types:check` and paste the non-zero exit and message; delete the migration and `npm run db:reset` again

**Checkpoint**: Types are current, linted out, type-checked, and the stale check is proven.

---

## Phase 6: User Story 4 — Archive the unapplied 034.x migrations (Priority: P2)

**Goal**: The 12 never-applied files are preserved with context and can't be applied by mistake.

**Independent Test**: `supabase/migrations` contains only timestamped live (and fix) migrations; `docs/archive/migrations-034/README.md` explains the archive.

- [X] T032 [P] [US4] Write `docs/archive/migrations-034/README.md`: these 12 files (list them) were written for Features 034 to 034.2.2 and never applied to any database (verified 2026-11-05 with `supabase migration list --remote`); do not apply them; ideas to port as new migrations: revision compare-and-swap (spec 043), idempotency keys (spec 043), one append-only audit table (spec 043); link `docs/DECISIONS.md` D-034 and `specs/041-supabase-baseline/spec.md`
- [X] T033 [US4] Verify `ls supabase/migrations` lists only `2026…`-prefixed files, and `git log --follow docs/archive/migrations-034/00012_runtime_integration_and_security_verification.sql` shows the history kept through the move
- [X] T034 [P] [US4] Verify `AGENTS.md` contains the rule "every change is a new file from `supabase migration new`. Never edit a migration that is on `main`" (added in PR #11); if missing, add it under "Security and database rules" (FR-009)

**Checkpoint**: Archive documented; migration rule present in AGENTS.md.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Whole-repo checks, the production step (if needed), and the gate.

- [ ] T035 Verify `git diff --stat main -- src` lists only `src/infrastructure/supabase/database.types.ts` (FR-010)
- [ ] T036 Add a `db` job to `.github/workflows/ci.yml` (FR-014), alongside the existing `check` and `e2e` jobs: `runs-on: ubuntu-latest`, `timeout-minutes: 15`, steps `actions/checkout@v4`, `actions/setup-node@v4` (node 22, npm cache), `npm ci`, `npm run db:start`, `npm run db:reset`, `npm run db:test`, `npm run db:types:check`; no secrets, no `--remote` commands. Push the branch and paste the green `db` job link and its `db:reset` duration (clean-runner SC-001 number)
- [ ] T037 Run the five-stage gate and paste the result: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
- [ ] T038 Only if T024 added fix migrations, hand over to the founder for FR-012, in order, pasting each output: (1) `npm run db:reset && npm run db:test` green; (2) `npx supabase db dump --remote -f ~/backups/interior-studio/<date>-schema.sql` and `npx supabase db dump --remote --data-only -f ~/backups/interior-studio/<date>-data.sql`, with row counts rechecked (8 projects, 129 versions unless changed); (3) `npx supabase db push --remote --dry-run` lists only the fix migrations; (4) **founder runs** `npx supabase db push --remote`; (5) `npx supabase migration list --remote` identical columns. An agent never runs step 4
- [ ] T039 Run `npx supabase db diff --remote` and paste the output: empty (SC-002, gate)
- [ ] T040 Walk [quickstart.md](quickstart.md) steps 1–5 end to end and paste the outputs; tick SC-001 to SC-004 in the PR description
- [ ] T041 Update `specs/FOUNDATION-PLAN.md` to mark 041 done with the date, and open the PR to `main` with: the CI run link showing the `check`, `e2e` and `db` jobs green, the mutation-check output (T026), the stale-types output (T031), the fix-migration table (T025, or "none"), and the `db diff --remote` output (T039)

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (Phase 1)**: no dependencies.
- **Foundational (Phase 2)**: depends on Setup. T007 → T008 → T009 → T010, strictly in order.
- **US1 (Phase 3)**: depends on Foundational. T011 → (T012 if drift) → T013 → T014 → T015 → T016.
- **US2 (Phase 4)**: depends on US1's seed (T014–T015), because cross-tenant tests need rows in every table for both studios.
- **US3 (Phase 5)**: depends on Foundational only, but types must be regenerated after any US2 fix migration, so run it after US2.
- **US4 (Phase 6)**: depends on T007 only; can run any time after Phase 2.
- **Polish (Phase 7)**: depends on all stories. T036 (CI `db` job) after US3, because it runs `db:types:check`. T038 only if T024 ran; T039 after T038.

### User story dependencies

- US1 → US2 (seed needed). US3 after US2 (schema final). US4 independent.

### Within US2

- T017, T018, T019, T021, T022 are separate files → parallel. T020 extends T019's file → after T019.
- T023 needs all five test files. T024–T025 only if T023 finds gaps. T026–T027 after green.

## Parallel Examples

```text
# After T015, write the independent test files together:
T017 supabase/tests/00_classification.test.sql
T018 supabase/tests/01_anon.test.sql
T019 supabase/tests/02_cross_tenant.test.sql
T021 supabase/tests/03_roles.test.sql
T022 supabase/tests/04_profiles.test.sql

# US4 alongside any phase after Phase 2:
T032 docs/archive/migrations-034/README.md
T034 AGENTS.md check
```

## Implementation Strategy

### MVP (US1)

Phases 1–3: a local database built from production's exact history, with seed data, and `db diff
--remote` empty. That alone ends the "two schemas" problem.

### Incremental delivery

1. MVP (US1) → 2. US2 isolation suite and any fixes → 3. US3 types → 4. US4 archive README →
5. Polish: gate, production push if needed, PR.

All of it lands in one PR (constitution branching rule); the phases are checkpoints, not separate
merges.

### Stop conditions

- T008 fetch fails: stop, use the fallback, record it.
- T011 drift found: T012 needs the founder for `migration repair --remote`.
- T023 finds a cross-tenant gap: fix in T024 and tell the founder at once (production exposure).
- Any production-writing command (`migration repair --remote`, `db push --remote`): founder only.
