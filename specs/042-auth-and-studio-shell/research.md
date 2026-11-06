# Research: 042 — Google Sign-in and Studio Shell

**Date**: 2026-11-06 · **Spec**: [spec.md](spec.md) · **Plan**: [plan.md](plan.md)

Facts were checked against the repository on `main` (`919db49`), the local stack built from the live
migrations (spec 041), and the pre-rewrite app at commit `eaf7d0f`.

## R1 — Supabase client

- **Decision**: add `@supabase/supabase-js@2.118.0` (exact pin). One module,
  `src/infrastructure/supabase/client.ts`, exports a single `createClient<Database>()` instance typed with
  the generated `database.types.ts` (spec 041). Options: `auth.flowType = 'pkce'`, `persistSession: true`,
  `autoRefreshToken: true`, `detectSessionInUrl: true`.
- **Rationale**: constitution XII (official client only). 2.118.0 was released 2026-10-15; 2.119.0
  (2026-11-04) is too recent for the two-week rule.
- **Config**: `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (renamed to the publishable key in 046).
  If either is missing, the module reports it and the app renders a configuration error screen naming
  the variable (FR-002).
- **Interaction with the old factory**: `persistenceFactory.ts` switches to cloud mode only when
  `VITE_CLOUD_PERSISTENCE` is set; adding the URL and key leaves it in local mode. It is deleted in 043.

## R2 — OAuth callback with a hash router

- **Decision**: `signInWithOAuth({ provider: 'google', options: { redirectTo: <origin>/ } })`. Before
  redirecting, store the current hash in `sessionStorage` (`auth:return-to`). With PKCE the callback
  arrives as `/?code=…`; `detectSessionInUrl` exchanges it during client start-up, before the router
  reads the hash. After the session exists, the app removes `code` from the URL with
  `history.replaceState` and restores the stored hash (FR-006 deep links).
- **Rationale**: matches the clarify answer (keep the hash router; handle the callback before it mounts).
  The query string never reaches the hash router, so routes never see `code`.
- **Alternatives**: a dedicated `/auth/callback` path (needs a Vercel rewrite and is replaced in 049).

## R3 — Session, memberships and the current studio

- **Decision**: `SessionProvider` (React context) holds `status` (`loading` | `signed-out` |
  `signed-in`), `session`, `memberships`, `error`, `signInWithGoogle()`, `signInWithPassword()` (local
  test builds only, R6), `signOut()`, `refreshMemberships()`. On `SIGNED_IN` (and on start-up with a
  session) it calls `accept_pending_invites` once, then loads memberships:
  `org_members.select('role, organizations ( id, name, slug )')`.
- **Current studio** comes from the URL slug only. A slug not in the user's memberships shows "You
  don't have access to this studio" and fetches nothing from it. `#/` redirects to the single studio,
  or to the last-used studio (`localStorage` key `interior-studio:last-studio`, a convenience only), or
  to a studio picker when there are several.
- **Rationale**: the playbook's plan constraint (no new state library; session in a small context,
  studio in the URL). Mirrors `eaf7d0f`'s `AuthProvider`, which worked against this schema.

## R4 — Sign-out clears studio data

- **Decision**: `signOut()` calls `supabase.auth.signOut()`, clears the context's memberships, removes
  `interior-studio:last-studio`, and navigates to `#/`. Projects in IndexedDB stay: they are browser
  projects until 043/044, not studio data.

## R5 — Invites and membership management (FR-009, FR-015)

- **Members list**: `org_members` for the studio, then `profiles` for those user ids (two queries;
  `org_members.user_id` references `auth.users`, not `profiles`, so PostgREST cannot embed it).
  `profiles_select` already lets co-members see each other.
- **Invites**: owner and admin insert into `org_invites` (`email`, `role` ≠ owner, `invited_by`).
  No email is sent; the invite becomes a membership the first time that address signs in with Google.
  The UI says so ("Ask them to sign in with Google using this address").
- **FR-015 migration** (`supabase migration new invites_never_change_existing_members`):
  1. A `BEFORE INSERT` trigger on `org_invites` (security invoker) raises
     `already a member` (SQLSTATE `23505`) when a member of that studio has a profile with that email.
     A trigger gives a clear message; a policy would only give a generic RLS error.
  2. `accept_pending_invites` is replaced: it does nothing unless the caller's email is confirmed
     (`email_confirmed_at is not null`; Google sign-ins are), and uses `on conflict (org_id, user_id) do nothing` instead of
     `do update set role = excluded.role`; the invite is still marked accepted. Because the function is
     rewritten anyway, it adopts principle XI now: `set search_path = ''`, schema-qualified names, and
     `revoke execute … from public, anon` then `grant … to authenticated`.
- **Role changes**: owner and admin update `org_members.role` under the live `members_update` policy
  (cannot touch or create owners; spec 041 tests already prove this).

## R6 — End-to-end tests once every route needs sign-in

- **Finding**: all 62 existing Playwright tests start at `#/` and would land on the sign-in screen.
- **Decision**: a Playwright `setup` project signs in once as `designer.a@example.test` (seed from 041,
  local password) and saves `storageState`; the `chromium` project depends on it and reuses the session.
  `#/` then redirects to `#/s/alpha/projects`, where the existing "Project name" form lives, so existing
  tests need no change beyond the shared setup.
- **Email-password sign-in in the UI** appears only when the build sets
  `VITE_AUTH_PASSWORD_SIGN_IN=true` (the Playwright web server and local `.env.local` only). Production
  never sets it, and production Auth allows Google only (clarify answer), so the form cannot be used
  there even if shown.
- **CI**: the `e2e` job starts the local stack (`npm run db:start && npm run db:reset`) and passes
  `VITE_SUPABASE_URL=http://127.0.0.1:54321` and the local anon key to the web server. Developers run
  `npm run db:start` before `npm run e2e`.
- **Dependency**: the e2e CI fix (Chromium new headless, screenshot paths) must merge first; otherwise
  the job is red for unrelated reasons.

## R7 — Deleting the old identity code (FR-012)

| Item | Importers outside tests | Action |
| --- | --- | --- |
| `src/server/auth/actorResolver.ts`, `jwtVerifier.ts` | `authorizationMiddleware.ts`, `policyMiddleware.ts` (themselves imported by no API handler) | Delete both, their tests, and the two middleware files and tests that only exist to use them |
| `CloudProjectModal.tsx` (+ test) | `TopBar.tsx` (Cloud Sync button) | Delete; remove the button |
| `authorizationStore.ts`, `useAuthorize.ts`, `useSubscriptionPolicy.ts` | none | Delete with their tests |
| `cloudProjectStore.test.ts` hard-coded ids | — | Replace with locally generated ids (store itself stays until 043) |
| `src/domain/platform/authorization/evaluator.ts` | only the deleted files | Keep the pure domain module for now (it holds the permission catalogue the role map reads from); it stops being a gate |

## R8 — Deploy configuration (founder)

- Vercel needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for Production and Preview. Until spec
  048 creates staging, previews use the production project; that is acceptable because a preview user
  can only reach their own studio's data under RLS.
- Supabase Auth URL configuration: site URL = production URL; redirect URLs = `http://localhost:5173/**`,
  `http://localhost:5174/**`, the Vercel preview wildcard for this project, and the production URL.
- Google provider: FR-016 (founder checks; sets up the OAuth client if missing).

## R9 — Found during implementation: citext and `search_path = ''` (2026-11-06)

`org_invites.email` and `profiles.email` are `citext`, but citext's case-insensitive `=` operator lives
in schema `extensions`. Inside a function with `set search_path = ''` (constitution XI), Postgres does
not find it and silently uses the case-sensitive text `=`. The first version of the FR-015 trigger
therefore let `OWNER.A@example.test` past `owner.a@example.test`; `05_invites.test.sql` caught it.
The migration compares `lower(email::text)` explicitly. **Spec 046 must check every function it moves
to `search_path = ''` for citext comparisons** (and other operators from `extensions`).
