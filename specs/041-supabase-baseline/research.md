# Research: 041 — Supabase Baseline and Local Stack

**Date**: 2026-11-05 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Facts below were checked on 2026-11-05 against the live project (`pkbctmaiawztzmwqkpgw`) through the
linked Supabase CLI and the Phase 0 schema backup (`~/backups/interior-studio/2026-11-05-schema.sql`).
No live data was modified.

## R1 — How to bring the live migration history into the repo

- **Decision**: Move `00001`–`00012` out first, then run `npx supabase migration fetch --remote`.
  Confirm with `npx supabase migration list --remote` that all 17 versions show in both columns.
- **Rationale**: `migration fetch` (present in CLI 3.0.0, "Fetch migration files from history
  table") writes each migration with the exact live version stamp, so no `migration repair` is
  needed. The local `00001`–`00012` must leave first: `migration list` today shows them as
  local-only, and leaving them would make `db reset` apply 034.x SQL that never ran in production.
- **Alternatives considered**: `db pull` into one baseline file plus `migration repair` (fallback
  only, per the spec's edge case; it loses per-migration history); restoring files from git at
  `eaf7d0f` (rejected by the spec: version stamps differ from live).
- **Verified live history**: 17 versions, `20261024082809` … `20261024193725`.

## R2 — Pinning the CLI

- **Decision**: `npm install --save-dev --save-exact supabase@3.0.0`; every script calls
  `npx supabase …`, which resolves the local binary.
- **Rationale**: It is the version already used for the Phase 0 backup and link. Today the CLI runs
  from npx's cache and is not in `package.json`, so CI and other developers could get a different
  version.
- **Note**: CLI 3.0 deprecates `--linked`; use `--remote` everywhere (already applied in the spec).
  `db dump` defaults to the *local* database; always pass `--remote` for production dumps.

## R3 — Local stack configuration

- **Decision**: `npx supabase init` creates `supabase/config.toml`. Set `project_id =
  "interior-studio"`, `[db] major_version = 17` (live is Postgres 17), keep default ports
  (54321–54327). Enable email sign-in locally for tests (`[auth.email] enable_signup = true`),
  keep `[auth.external.google]` disabled locally. Seed file path `./seed.sql`.
- **Rationale**: Matching the major version avoids dump/restore and planner differences. Email
  sign-in is local-only per spec 042's clarify answers.
- **Runtime**: Docker via Colima (started during Phase 0). `db:start` documents that Docker must be
  running.

## R4 — Live schema facts that shape the tests

From the backup schema:

- 16 tables in `public`, all with RLS enabled (count of `ENABLE ROW LEVEL SECURITY` = 16).
- 14 tables carry `org_id uuid NOT NULL`: `projects`, `project_versions`, `org_members`,
  `org_invites`, `ai_credit_ledger`, `ai_jobs`, `ai_settings`, `catalog_models`, `comments`,
  `price_lists`, `quotes`, `renders`, `room_templates`, `share_links`.
- `organizations` is the studio itself (keyed by `id`); `profiles` is per user (keyed by `id` =
  `auth.users.id`). No table is a shared reference (no nullable `org_id`).
- Policies use three helpers: `private.is_org_member(org)`, `private.can_edit_org(org)`,
  `private.can_admin_org(org)`, plus `private.project_in_org(project, org)` on inserts that name a
  project.
- Several tables have no client write policy by design: `project_versions` (writes only through
  `save_project_version`), `ai_jobs` (read only), `org_members` insert (only through
  `accept_pending_invites`), `organizations` insert/delete, `profiles` insert/delete (trigger only).
  Tests must assert these writes are **denied**, not skip them.
- Enums: `org_role` (owner, admin, designer, viewer), `project_status`, `version_kind`.
- Known non-test advisor items (deferred to 046 unless a test exposes them): helpers use
  `SET search_path TO 'public'` (not `''`); `accept_pending_invites`, `ai_credit_balance`,
  `save_project_version` are `SECURITY DEFINER` and granted to `authenticated`.
- Storage policies are not in the `public` dump; storage is tested in 047.

## R5 — Impersonating users in pgTAP

- **Decision**: In each test, `set local role authenticated;` and
  `select set_config('request.jwt.claims', json_build_object('sub', <uuid>, 'role',
  'authenticated')::text, true);`. For anonymous, `set local role anon;` with claims cleared.
  Each test file runs inside `begin; … rollback;` (the `supabase test db` default via pg_prove).
- **Rationale**: `auth.uid()` reads `request.jwt.claims ->> 'sub'`; this is the documented
  approach and needs no extension beyond pgTAP (spec FR-007).
- **Alternatives considered**: `basejump-supabase_test_helpers` (adds an extension; rejected unless a
  test cannot be written without it).

## R6 — A reusable cross-tenant test pattern

- **Decision**: One test file defines, inside the test transaction, a small PL/pgSQL helper that
  takes a table name and runs, as a studio A user against studio B rows:
  - `select count(*) … where org_id = B` → 0;
  - `update … set org_id = org_id where org_id = B returning 1` → 0 rows;
  - `delete … where org_id = B returning 1` → 0 rows;
  then, as `postgres`, confirms studio B's rows still exist (so a silent no-op is distinguished from
  a real delete). Inserts differ per table (column sets differ), so each table has one explicit
  insert attempt with `org_id = B`, expected to raise `42501` (insufficient privilege / RLS).
- **Positive controls**: for each table, the same user sees at least one studio A row. This is why
  the seed must place rows in **every** studio-owned table for **both** studios; otherwise a
  "zero rows" result proves nothing.
- **Coverage test**: compares the classification list (data-model.md) with
  `pg_tables where schemaname = 'public'`; fails on an unclassified table, and fails if any table has
  `relrowsecurity = false`.

## R7 — Generated types and the stale check

- **Decision**: `db:types` = `npx supabase gen types typescript --local --schema public >
  src/infrastructure/supabase/database.types.ts`. `db:types:check` regenerates to a temp file and
  `diff`s; non-zero exit with the file name on mismatch.
- **Lint**: add the generated file to `ignores` in `eslint.config.js` (generated code is not
  hand-maintained). TypeScript still compiles it (`tsconfig.app.json` includes `src`), so a broken
  generation fails `npm run typecheck`.
- **Rationale**: generated against the local stack, which must equal production (R8), so CI does not
  need production credentials.

## R8 — Proving local equals production, and pushing fixes

- **Decision**: After `db reset`, run `npx supabase db diff --remote` (needs Docker for the shadow
  database). Empty output is the gate. If the suite exposes gaps (FR-011), the fix migrations are
  pushed by the founder following FR-012: tests green → fresh backup → `db push --dry-run --remote`
  lists only the fix files → `db push --remote` → `migration list --remote` identical → `db diff
  --remote` empty.
- **Dashboard-made objects**: if `db diff --remote` shows objects that exist live but not in any
  migration, capture them in a new migration and mark it applied with `migration repair --status
  applied <version> --remote` (the object already exists live, so it must not be pushed).

## R9 — Rules already in place

- FR-009 (new migrations only; never edit one on `main`) is already in `AGENTS.md` since PR #11
  (constitution 2.3.0). This spec only verifies it is present.
- Archive references: no file in `src`, `e2e`, `scripts`, `apps` or `packages` reads
  `supabase/migrations` or the `000NN_` files, so moving them breaks nothing.
