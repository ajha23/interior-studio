# Quickstart: validate spec 041

Runs the spec's gate end to end. Commands are from the repo root.

## Prerequisites

- Docker running (`colima start`; check with `docker info`).
- `npm ci` done (installs the pinned `supabase@3.0.0`).
- CLI logged in and linked: `npx supabase login`, `npx supabase link --project-ref pkbctmaiawztzmwqkpgw`.

## 1. Build the local database

```bash
npm run db:start
npm run db:reset
```

Expected: every migration from `20261024082809` onward applies, then the seed; zero errors.

## 2. Local matches production

```bash
npx supabase migration list --remote
npx supabase db diff --remote
```

Expected: every version appears in both the local and remote columns; `db diff` prints no SQL.

## 3. Isolation tests

```bash
npm run db:test
```

Expected: all files in `supabase/tests/` pass. See [contracts/pgtap-suite.md](contracts/pgtap-suite.md).

Then run the mutation check described in that contract once and confirm a failure.

## 4. Types

```bash
npm run db:types:check
npm run typecheck
```

Expected: no diff; typecheck passes.

## 5. Repository state

```bash
ls supabase/migrations          # only 2026… timestamped files
ls docs/archive/migrations-034  # 00001…00012 + README.md
git diff --stat main -- src     # only src/infrastructure/supabase/database.types.ts
```

## 6. Only if fix migrations were added (FR-011/FR-012)

Founder only, in order:

```bash
npx supabase db dump --remote -f ~/backups/interior-studio/<date>-schema.sql
npx supabase db dump --remote --data-only -f ~/backups/interior-studio/<date>-data.sql
npx supabase db push --remote --dry-run   # must list only the new fix migrations
npx supabase db push --remote
npx supabase migration list --remote      # identical columns
npx supabase db diff --remote             # empty
```

## Gate

Steps 1–5 pass on the founder's machine, step 6 is done if needed, and `db diff --remote` is empty.
