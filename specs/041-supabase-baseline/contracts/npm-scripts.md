# Contract: database npm scripts

These scripts are the interface every developer, agent and CI job (spec 048) uses. Their names and
exit behaviour are a contract: 048 calls them unchanged.

| Script | Command | Succeeds when | Fails when |
| --- | --- | --- | --- |
| `db:start` | `npx supabase start` | Local stack is up (API 54321, DB 54322) | Docker is not running |
| `db:reset` | `npx supabase db reset` | Every migration applies and `seed.sql` loads with zero errors | Any migration or seed statement errors |
| `db:test` | `npx supabase test db` | Every pgTAP file in `supabase/tests/` passes | Any assertion fails, or a test file errors |
| `db:types` | `npx supabase gen types typescript --local --schema public > src/infrastructure/supabase/database.types.ts` | File written | Local stack not running |
| `db:types:check` | regenerate to a temp file, `diff` against the committed file | Files identical (exit 0) | Files differ: exit 1, prints the stale file name |

Rules:

- All scripts use the CLI pinned in `devDependencies` (`supabase@3.0.0`), never a global install.
- No script targets production. Commands that touch production (`db diff --remote`, `migration list
  --remote`, `db push --remote`) are run by hand, and `db push --remote` only by the founder (FR-012).
- `db:test` must be runnable repeatedly without `db:reset` in between (tests roll back).
