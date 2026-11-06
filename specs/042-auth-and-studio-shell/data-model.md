# Data Model: 042 — Google Sign-in and Studio Shell

No new tables. One migration changes invite behaviour (FR-015). Everything else uses the live schema
as baselined in spec 041.

## Tables used

| Table | Columns used | Read by | Written by |
| --- | --- | --- | --- |
| `organizations` | `id`, `name`, `slug` | members (`org_select`) | — (no studio creation in 042) |
| `org_members` | `org_id`, `user_id`, `role`, `created_at` | members (`members_select`) | `accept_pending_invites`; role changes by admin+ (`members_update`: never owners) |
| `org_invites` | `id`, `org_id`, `email`, `role`, `invited_by`, `created_at`, `accepted_at` | admin+ (`invites_select`) | admin+ (`invites_insert`: role ≠ owner); delete by admin+ |
| `profiles` | `id`, `email`, `full_name`, `avatar_url` | self and co-members (`profiles_select`) | `handle_new_user` trigger; self (`profiles_update`) |

`org_role`: owner, admin, designer, viewer.

## Client-side shapes (not persisted)

- **Session state**: `status` (`loading` | `signed-out` | `signed-in`), `session` (supabase-js), `user`
  (`id`, `email`, `name`, `avatarUrl`), `memberships`, `error`.
- **Membership**: `orgId`, `orgName`, `orgSlug`, `role`.
- **Member row** (Settings → Members): `userId`, `name`, `email`, `avatarUrl`, `role`, `isYou`.
- **Pending invite**: `id`, `email`, `role`, `invitedAt`.

## Role → visible actions (FR-010)

Visibility only; the database decides.

| Action | owner | admin | designer | viewer |
| --- | --- | --- | --- | --- |
| See members and their roles | ✓ | ✓ | ✓ | ✓ |
| See pending invites | ✓ | ✓ | — | — |
| Invite (designer, viewer, admin) | ✓ | ✓ | — | — |
| Change a non-owner's role | ✓ | ✓ | — | — |

Owners never appear as a choice in the invite or role selectors.

## Invite lifecycle (FR-015)

```text
invite created ──(email already a member?)── yes ──> rejected: "already a member" (23505)
      │ no
      ▼
pending ──(that address signs in; accept_pending_invites)──> accepted
                                   │
                                   ├─ not yet a member → membership created with the invited role
                                   └─ already a member → membership unchanged (never re-roled)
```

## Migration: `<timestamp>_invites_never_change_existing_members.sql`

1. `private.reject_invite_for_member()` trigger function, security invoker, `search_path = ''`:
   raises `already a member` (errcode `23505`) when `public.org_members` joined to `public.profiles`
   has a row for `new.org_id` whose `profiles.email` equals `new.email` (citext, case-insensitive).
   Trigger `org_invites_reject_member` `BEFORE INSERT` on `public.org_invites`.
2. `public.accept_pending_invites()` replaced with the same behaviour except
   `on conflict (org_id, user_id) do nothing`, and returns 0 without accepting anything unless
   `auth.users.email_confirmed_at is not null` for the caller; `security definer`, `search_path = ''`,
   schema-qualified names; `revoke execute on function public.accept_pending_invites() from public,
   anon`; `grant execute … to authenticated`.

## Tests: `supabase/tests/05_invites.test.sql`

- admin.a invites `designer.a@example.test` → throws `23505` "already a member".
- admin.a invites `owner.a@example.test` as viewer → throws `23505` (the demotion path is closed).
- A stale invite (written as `postgres` before the membership existed) for owner.a as viewer, then
  owner.a calls `accept_pending_invites()` → owner.a is still owner; the invite is marked accepted.
- A new address invited as designer; that user (created in the test) calls `accept_pending_invites()`
  → membership created with role designer.
- designer.a cannot insert an invite (already covered in 03; asserted again here for the flow).
- A user whose email is not confirmed (`email_confirmed_at` null), with a pending invite for their
  address, calls `accept_pending_invites()` → returns 0, no membership, invite still pending.
- `anon` cannot execute `accept_pending_invites`.
