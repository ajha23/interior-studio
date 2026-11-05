# Data Model: 041 — Supabase Baseline

This spec adds no tables. It documents the live schema the tests protect, the classification the
coverage test enforces (FR-013), and the synthetic seed the tests rely on (FR-004).

## Table classification (FR-013)

This list is the source of truth for the coverage test. It is mirrored in
`supabase/tests/00_classification.test.sql`; adding a `public` table without adding it here fails
the suite.

| Table | Class | Tenant key | Client writes allowed by live policy |
| --- | --- | --- | --- |
| `organizations` | studio (self) | `id` | update: admin+ |
| `org_members` | studio-owned | `org_id` | update/delete: admin+, not owners; insert: none (invite RPC) |
| `org_invites` | studio-owned | `org_id` | insert/delete: admin+ (role ≠ owner); select: admin+ only |
| `projects` | studio-owned | `org_id` | insert/update: editor+; delete: admin+ |
| `project_versions` | studio-owned | `org_id` (+ `project_id`) | none (save RPC only) |
| `ai_credit_ledger` | studio-owned | `org_id` | insert: admin+, top-ups only (0 < delta ≤ limit) |
| `ai_jobs` | studio-owned | `org_id` | none |
| `ai_settings` | studio-owned | `org_id` | insert/update: admin+ |
| `catalog_models` | studio-owned | `org_id` | insert/update: editor+; delete: admin+ or creator |
| `comments` | studio-owned | `org_id` (+ `project_id`) | insert: member, own author, team source; update: author or editor+; delete: author or admin+ |
| `price_lists` | studio-owned | `org_id` | insert/update: admin+ |
| `quotes` | studio-owned | `org_id` (+ `project_id`) | insert/update: editor+; delete: admin+ |
| `renders` | studio-owned | `org_id` (+ `project_id`) | insert/update: editor+; delete: admin+ or creator |
| `room_templates` | studio-owned | `org_id` | insert/update: editor+; delete: admin+ or creator |
| `share_links` | studio-owned | `org_id` (+ `project_id`) | insert/update: editor+; delete: admin+ or creator |
| `profiles` | user-owned | `id` = `auth.uid()` | update: own row only; select: own row and co-members |

Roles: **admin+** = owner, admin (`private.can_admin_org`); **editor+** = owner, admin, designer
(`private.can_edit_org`); **member** = any role (`private.is_org_member`).

## Isolation rules each class must satisfy

- **Studio-owned**: a member of studio A, in any role, MUST NOT select, insert, update or delete any
  studio B row. `anon` reads nothing. Where a project is referenced, `project_in_org` MUST prevent
  attaching studio A rows to a studio B project.
- **Studio (self)**: a user sees and updates only studios they belong to.
- **User-owned**: a user updates only their own profile; sees only their own profile and profiles of
  people who share a studio with them; never a stranger's.
- **Writes with no client policy**: MUST be denied to `authenticated` and `anon` (they happen only
  through definer functions or triggers).

## Synthetic seed (`supabase/seed.sql`)

Synthetic data only; every email ends in `@example.test`.

| Entity | Studio A ("Alpha Studio", slug `alpha`) | Studio B ("Beta Studio", slug `beta`) |
| --- | --- | --- |
| Users (`auth.users` + `auth.identities`, email provider) | `owner.a@`, `admin.a@`, `designer.a@`, `viewer.a@` | `owner.b@`, `admin.b@`, `designer.b@`, `viewer.b@` |
| `profiles` | created by the `handle_new_user` trigger | same |
| `org_members` | one row per user with that role | same |
| `projects` | 2 | 2 |
| `project_versions` | 2 per project (autosave + manual) | same |
| One row in every other studio-owned table | yes | yes |

- Admin is seeded alongside owner, designer and viewer so admin-only policies can be tested
  positively; this extends FR-004 without changing its intent.
- One extra user, `stranger@example.test`, belongs to no studio (profile-visibility test).
- Fixed UUIDs are used so tests can name rows. They live only in `seed.sql` and `supabase/tests/`,
  which are test fixtures (constitution XII allows ids there).
- **Why every table gets a row**: a cross-tenant "0 rows" result is only meaningful if studio B has
  rows to hide (research R6, positive controls).

## Live enums (unchanged)

- `org_role`: owner, admin, designer, viewer.
- `project_status`, `version_kind`: values as in the live migrations; the seed uses existing values
  only.
