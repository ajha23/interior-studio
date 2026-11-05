# Contract: pgTAP isolation suite

The suite in `supabase/tests/` is what spec 048 makes a required CI check. Later specs add tables;
this contract says what each table must come with.

## Files

| File | Proves |
| --- | --- |
| `00_classification.test.sql` | Every `public` table has RLS enabled and appears in the classification list ([data-model.md](../data-model.md)) |
| `01_anon.test.sql` | `anon` reads zero rows from every `public` table and cannot write to any |
| `02_cross_tenant.test.sql` | For every studio-owned table: studio A users (owner, admin, designer, viewer) cannot select, insert, update or delete studio B rows; studio B rows still exist afterwards; positive control shows own rows |
| `03_roles.test.sql` | Role rules on the core tables: viewer cannot write `projects`; designer cannot invite or change roles; nobody can write `project_versions` or `ai_jobs` directly |
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
