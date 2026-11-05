# Contract: pgTAP isolation suite

The suite in `supabase/tests/` is what spec 048 makes a required CI check. Later specs add tables;
this contract says what each table must come with.

## Files

| File | Proves |
| --- | --- |
| `00_classification.test.sql` | Every `public` table has RLS enabled and appears in the classification list ([data-model.md](../data-model.md)) |
| `01_anon.test.sql` | `anon` reads zero rows from every `public` table and cannot write to any |
| `02_cross_tenant.test.sql` | For every studio-owned table: studio A users (owner, admin, designer, viewer) cannot select, insert, update or delete studio B rows; studio B rows still exist afterwards; positive control shows own rows |
| `03_roles.test.sql` | No API role holds `TRUNCATE` (which bypasses RLS) on any public table, now or on tables created later; role rules on the core tables: viewer cannot write `projects`; designer cannot invite or change roles; admin cannot touch owners; nobody can write `project_versions`, `ai_jobs` or the credit ledger directly |
| `04_profiles.test.sql` | Own profile update allowed; stranger's profile invisible; co-member profile visible |

## Conventions

- Each file: `begin; select plan(N); … select * from finish(); rollback;`
- Impersonation: `set local role authenticated` + `request.jwt.claims` with the seeded user's id
  (research R5). Return to `postgres` only for the "rows still exist" checks.
- Expected RLS insert failure: `throws_ok(…, '42501')`. Expected silent filter: `is(count, 0)`.
- No `todo`, `skip` or commented-out assertions (FR-011).

## Rule for every later spec

A migration that adds a `public` table MUST, in the same PR, add the table to the classification
list and to the matching tests. The coverage test fails otherwise.

## Mutation check (run once, not committed)

Add a throwaway local migration that drops `projects_select`, run `npm run db:test`, confirm at least
one assertion in `02_cross_tenant` fails, then delete the migration. Record the failing output in the
PR description.

## Results log (spec 041, 2026-11-05)

| Run | Result |
| --- | --- |
| First run, no fixes (T023) | 387/419 pass; 32 fail: `anon` and `authenticated` hold `TRUNCATE` on all 16 tables. No cross-tenant, anonymous or role failure |
| Fix | `20261105161230_revoke_truncate_from_api_roles.sql` (revoke, plus default privileges for future tables; +2 tests) |
| After fix (T025) | 421/421 pass |
| Mutation 1: drop `projects_select` | 5 failures: select-policy coverage and 4 positive controls (RLS falls back to deny-all) |
| Mutation 2: `projects_select` using (true) | 5 failures: anon reads projects; owner/admin/designer/viewer of A see B's projects |
| Repeat without reset (T027) | Pass twice, 1.5 s each |
