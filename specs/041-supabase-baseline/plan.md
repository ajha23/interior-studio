# Implementation Plan: 041 — Supabase Baseline and Local Stack

**Branch**: `041-supabase-baseline` | **Date**: 2026-11-05 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/041-supabase-baseline/spec.md`

## Summary

Make the live Supabase project the single source of truth for the schema, and give every developer
and CI run a reproducible local copy. The repo's unapplied `00001`–`00012` migrations move to
`docs/archive/migrations-034/`. The live project's 17 migrations are fetched with their exact version
stamps (`supabase migration fetch --remote`). A synthetic seed puts rows for two studios in every
studio-owned table. A pgTAP suite proves RLS coverage, anonymous denial and cross-tenant isolation
on all 14 studio-owned tables, plus role and profile rules. Generated TypeScript types are committed
with a staleness check. Any policy gap the suite exposes is fixed in this spec as a new migration and
pushed to production by the founder after a fresh backup (FR-011, FR-012).

## Technical Context

**Language/Version**: SQL (PostgreSQL 17, matching live `17.11.0.003`); TypeScript 5 for the generated types only

**Primary Dependencies**: Supabase CLI `3.0.0` (npm devDependency, exact pin); pgTAP (bundled with the Supabase local stack); Docker via Colima

**Storage**: Supabase Postgres: live project `pkbctmaiawztzmwqkpgw` (Mumbai) and the local stack

**Testing**: pgTAP through `supabase test db`; existing Vitest and Playwright suites must stay green

**Target Platform**: Developer macOS machines and GitHub Actions Linux runners (048)

**Project Type**: Database baseline and tooling for the existing single Vite web app

**Performance Goals**: `db:reset` under 2 minutes on a clean machine (SC-001, measured in the CI `db` job); `db:test` under 60 seconds

**Constraints**: No change under `src/` except the generated types file; never edit a fetched migration; an agent never runs `db push` against production; dumps never committed

**Scale/Scope**: 17 baseline migrations, 16 tables, 14 studio-owned; seed of 2 studios × 4 roles + 1 stranger; about 5 pgTAP files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Status | How this plan complies |
| --- | --- | --- |
| I. Framework-free domain | Pass | `src/domain` and `src/engine` untouched |
| II. Single mutation path | N/A | No editor state changes |
| III. Integer numbers, no coercion | N/A | No dimensions or money handled |
| IV. Derived artifacts | N/A | — |
| V. Manufacturing traceability | N/A | — |
| VI. Configurable authorization | Pass | Enforcement stays in the database; no client-side gate added |
| VII. Tenant isolation, DPDP | Pass | Cross-tenant tests on every studio-owned table; seed is synthetic (`@example.test`); dumps never committed |
| VIII. Migration immutability | Pass, with note | Fetched migrations are never edited; fixes are new files. Archiving `00001`–`00012` moves files that were never applied anywhere (see Complexity Tracking) |
| IX. Test-first, five-stage gate | Pass | pgTAP suite written before any fix migration; five-stage gate run before the PR |
| X. SaaS entitlements | N/A | Foundation spec; SaaS items answered in spec |
| XI. Database is the boundary | Pass, with known exception | Proves RLS on every table with tests; pre-existing definer functions with `search_path TO 'public'` are left for 046 unless a test exposes them (see Complexity Tracking) |
| XII. Official clients | Pass | Only the official Supabase CLI and generated types; no client or auth code |
| Definition of Done | Pass | A minimal CI `db` job (FR-014) applies every migration to a fresh local Supabase and runs the pgTAP suite on the PR, so the CI run link is real evidence. 048 makes it a required check and adds deploys |
| Branching rule | Pass | One short branch from `main`; target 2–3 days |

Rejected per the playbook's constraints: no new server, no new package, no hand-written auth code.

## Project Structure

### Documentation (this feature)

```text
specs/041-supabase-baseline/
├── spec.md
├── plan.md              # this file
├── research.md          # Phase 0
├── data-model.md        # Phase 1: table classification and seed
├── quickstart.md        # Phase 1: gate walkthrough
├── contracts/
│   ├── npm-scripts.md   # db:* script contract (consumed by 048)
│   └── pgtap-suite.md   # test suite contract (rule for later specs)
└── tasks.md             # Phase 2 (/speckit-tasks)
```

### Source Code (repository root)

```text
supabase/
├── config.toml                      # new (supabase init)
├── seed.sql                         # new: synthetic two-studio seed
├── migrations/
│   ├── 20261024082809_*.sql … 20261024193725_*.sql   # fetched from live (17)
│   └── <timestamp>_*.sql            # only if FR-011 fixes are needed
└── tests/
    ├── 00_classification.test.sql
    ├── 01_anon.test.sql
    ├── 02_cross_tenant.test.sql
    ├── 03_roles.test.sql
    └── 04_profiles.test.sql

docs/archive/migrations-034/
├── README.md                        # never applied; ideas to port
└── 00001_*.sql … 00012_*.sql        # moved with git mv

src/infrastructure/supabase/database.types.ts   # generated, committed
package.json                                     # supabase devDependency + db:* scripts
eslint.config.js                                 # ignore the generated types file
scripts/db-types-check.mjs                       # new: stale-types check used by db:types:check
.github/workflows/ci.yml                         # new `db` job (FR-014)
.gitignore                                       # already ignores supabase/.temp and dumps
```

**Structure Decision**: Everything lives in the existing single app and the standard `supabase/`
folder the CLI expects. No new package or workspace.

## Implementation Approach

Order matters, because each step is the precondition for the next:

1. **Tooling**: pin the CLI, `supabase init`, set `config.toml` (research R3), add npm scripts.
2. **Archive**: `git mv` the 12 files to `docs/archive/migrations-034/` and write the README.
3. **Fetch**: `migration fetch --remote`; verify with `migration list --remote` (R1).
4. **Reset**: `db:start`, `db:reset` with an empty seed; then `db diff --remote` must be empty. If not,
   handle dashboard-made objects per R8 before going on.
5. **Seed**: write `seed.sql` per [data-model.md](data-model.md); `db:reset` again.
6. **Tests first**: write the five pgTAP files per [contracts/pgtap-suite.md](contracts/pgtap-suite.md).
   Run `db:test`. Every failure is a real gap.
7. **Fix gaps** (only if step 6 fails on policy): one new migration per gap from `supabase migration
   new`, rerun until green. List each fix and its exposing test for the PR.
8. **Mutation check**: drop a policy in a throwaway migration, confirm red, delete it.
9. **Types**: `db:types`, add the eslint ignore, `db:types:check`, `npm run typecheck`.
10. **CI `db` job**: add it to `.github/workflows/ci.yml` (FR-014) and confirm it is green on the PR.
11. **Five-stage gate**: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.
12. **Production** (only if step 7 added migrations): hand over to the founder for FR-012 (quickstart §6).
13. **Final gate**: `db diff --remote` empty; quickstart steps 1–5 pass.

## Post-design Constitution Re-check

After Phase 1 the design still passes. Two notes:

- The seed adds an `admin` user per studio and one studio-less `stranger`. That goes beyond FR-004's
  owner, designer and viewer list, but it's needed to test admin-only policies and profile
  visibility. It doesn't conflict with any principle.
- The suite tests what the live policies allow today. Where [data-model.md](data-model.md) records
  a permissive rule (for example, an admin deleting another member's catalog model), the test
  asserts the live rule. Changing that rule is a product decision, not a security gap. Only
  cross-tenant, anonymous or wrong-role writes count as gaps under FR-011.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Moving `00001`–`00012` out of `supabase/migrations` (Principle VIII says existing migrations are immutable) | They were never applied to any database (verified with `migration list --remote`), and leaving them would make `db reset` build a schema production does not have | Keeping them in place would break `db diff` and the single-source-of-truth goal; deleting them would lose the CAS, idempotency and audit ideas to port later |
| Definer helpers keep `search_path TO 'public'` (Principle XI requires `''`) | Pre-existing in the live baseline; changing every function body is spec 046's scope, done on staging first | Fixing now would widen a baseline spec into a hardening spec and push untested function rewrites to production. **Owner**: founder. **Expiry**: spec 046 merge. A test that shows this being exploited makes it an FR-011 fix here |
| Redacting two email literals in fetched migrations `20261024082852_phase0_invites_fix_and_seed` and `20261024083811_phase0_set_owner_email` (FR-009 says never edit a fetched migration) | The repository is public and the literals are real personal emails, one belonging to a third person (constitution VII, DPDP). They only seed and update one invite row, so schema, version stamps and `db diff` are unchanged (verified: reset clean, 17/17 versions match) | Committing verbatim would republish the addresses in the current tree. **Owner**: founder. **Scope**: these two literals only (`founder@example.test`, `studio-owner@example.test`). **Review**: a future `migration fetch` would restore them, so never re-fetch these two versions without redacting again; history scrubbing of old commits is a separate decision |
