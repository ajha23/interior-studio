# Implementation Plan: 042 — Google Sign-in and Studio Shell

**Branch**: `042-auth-and-studio-shell` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/042-auth-and-studio-shell/spec.md`

## Summary

Add real identity: Google sign-in through Supabase Auth using the official client with PKCE, a session
context, and a studio-aware shell. Studio pages carry the studio slug in the URL (`#/s/<slug>/…`);
editor routes keep their form but need a session. Settings → Members lets owners and admins invite by
email and change roles under the existing RLS. One migration closes the invite gap found in clarify:
invites for existing members are refused and accepting an invite never re-roles a member. The fake
identity code goes: server-side actor/JWT code nothing used, the Cloud Sync modal with its dev session
and hard-coded ids, and the unused browser permission store. Because every route now needs a session,
Playwright signs in once against the local Supabase stack and CI's `e2e` job starts that stack.

## Technical Context

**Language/Version**: TypeScript 5 (strict), React 19, Vite; SQL for one migration

**Primary Dependencies**: `@supabase/supabase-js@2.118.0` (new, exact pin); existing UI primitives in `src/components/ui`; Supabase CLI 3.0.0 (041)

**Storage**: Supabase Postgres (live project; local stack for development and tests). Browser: `localStorage` for the Supabase session (supabase-js default) and a last-used-studio convenience key

**Testing**: Vitest + React Testing Library (session context, routing, members screen); pgTAP (`05_invites.test.sql`); Playwright against the local stack with seeded users

**Target Platform**: Browser SPA on Vercel; CI on GitHub Actions

**Project Type**: Single Vite web application

**Performance Goals**: Signed-in reload reaches the studio's project list without a visible sign-in flash (session read from storage before first paint of protected routes)

**Constraints**: No new state library (session in a React context, studio in the URL); editor touched only to remove dead imports; no hand-written auth or JWT code; email-password sign-in only in local and test builds; no client secret ever in the repo or Vercel

**Scale/Scope**: About 10 new UI and infrastructure files, 1 migration, 1 pgTAP file, about 8 Playwright scenarios, removal of about 10 files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design (below).*

| Principle | Status | How this plan complies |
| --- | --- | --- |
| I. Framework-free domain | Pass | Auth lives in `src/infrastructure/supabase` and `src/features/auth`; `src/domain`/`src/engine` untouched |
| II. Single mutation path | Pass | No editor state changes; the editor gains no auth code |
| III–V | N/A | No dimensions, money, derived artifacts or manufacturing |
| VI. Configurable authorization | Pass | Database decides; UI reads `org_role` only for visibility (role → actions map) |
| VII. Tenant isolation, DPDP | Pass | Studio from memberships only; foreign slug fetches nothing; invites hold emails under existing admin-only RLS |
| VIII. Migrations | Pass | One new migration; no edit to an existing migration |
| IX. Test-first, gates | Pass | pgTAP for invites, RTL for context and screens, Playwright for every acceptance scenario |
| X. SaaS | Pass | Spec answers the SaaS section; no plan gating in 042 |
| XI. Database is the boundary | Pass | The rewritten `accept_pending_invites` adopts `search_path = ''`, qualified names and explicit grants, and acts only for confirmed emails; no new definer functions beyond it; the invite check is a security-invoker trigger |
| XII. Official clients | Pass | `@supabase/supabase-js` only; PKCE handled by the library; `actorResolver`, `jwtVerifier` deleted; no default ids outside fixtures |
| Definition of Done | Pass | CI `db` and `e2e` jobs run against a fresh local stack; founder signs in on the Vercel preview (gate) |
| Branching rule | Watch | Estimate 4–5 days; split if the branch passes 3 days (see Complexity Tracking) |

Rejected per the playbook: no new server, no new package beyond supabase-js, no hand-written auth.

## Project Structure

### Documentation (this feature)

```text
specs/042-auth-and-studio-shell/
├── spec.md
├── plan.md                        # this file
├── research.md                    # R1–R8
├── data-model.md                  # tables used, role map, invite lifecycle, migration, tests
├── quickstart.md
├── contracts/
│   └── routes-and-session.md      # routes, useSession(), env vars, Playwright setup
└── tasks.md                       # /speckit-tasks
```

### Source Code (repository root)

```text
src/infrastructure/supabase/
├── client.ts                      # new: single supabase-js client + config check
└── database.types.ts              # from 041 (regenerated if the migration changes types)

src/features/auth/                 # new
├── SessionProvider.tsx            # context: status, user, memberships, sign-in/out, refresh
├── useSession.ts
├── SignInScreen.tsx               # "Continue with Google"; email form only when enabled
├── ConfigErrorScreen.tsx
├── returnTo.ts                    # store/restore the requested hash across the OAuth redirect
└── *.test.tsx

src/features/studio/               # new
├── StudioShell.tsx                # header: studio name + switcher, Projects, Settings, account menu
├── StudioGate.tsx                 # resolves slug → membership; no-access and no-studio screens
├── StudioPicker.tsx               # `#/` with several studios
├── useStudio.ts                   # current membership + role → visible actions
├── roleActions.ts                 # role → visible actions map (FR-010)
├── MembersSettings.tsx            # members, pending invites, invite form, role change
├── membersApi.ts                  # supabase-js reads/writes for members, profiles, invites
└── *.test.tsx

src/app/
├── router.ts                      # + studio routes (`#/s/<slug>/projects`, `#/s/<slug>/settings/members`)
├── App.tsx                        # SessionProvider → gate → shell or editor
└── main.tsx                       # unchanged except removing nothing yet (factory stays until 043)

src/components/layout/TopBar.tsx   # remove the Cloud Sync button only (no account menu in the editor)

supabase/
├── migrations/<ts>_invites_never_change_existing_members.sql   # new (FR-015)
├── seed.sql                       # + both@example.test, member of Alpha and Beta (switcher tests)
└── tests/05_invites.test.sql      # new

e2e/
├── auth.setup.ts                  # new: sign in once, save storage state
├── auth.spec.ts                   # new: sign-in, deep link, sign-out, config error
└── studio.spec.ts                 # new: switcher, no access, members, invites by role
playwright.config.ts               # setup project, storage state, web server env
.github/workflows/ci.yml           # e2e job starts the local stack
.gitignore                         # playwright/.auth/

Deleted:
src/server/auth/actorResolver.ts (+test), src/server/auth/jwtVerifier.ts (+test),
src/server/authorizationMiddleware.ts (+test), src/server/policyMiddleware.ts (+test),
src/features/projects/CloudProjectModal.tsx (+test),
src/state/authorizationStore.ts (+test), src/features/shared/useAuthorize.ts,
src/features/shared/useSubscriptionPolicy.ts (+ tests)
```

**Structure Decision**: New feature folders `auth` and `studio` beside the existing ones; the Supabase
client sits next to the generated types in `src/infrastructure/supabase`. No new package or workspace.

## Implementation Approach

1. **Land the e2e CI fix first** (separate PR, already prepared): otherwise this PR's `e2e` job is red
   for unrelated reasons.
2. **Database first (tests first)**: `05_invites.test.sql` (fails), then the FR-015 migration (passes);
   extend the seed with `both@example.test`; regenerate types.
3. **Client and session**: `client.ts` with config check → `SessionProvider` + RTL tests (mocked client).
4. **Routing and gates**: studio routes in `router.ts`; `App.tsx` wraps everything in the provider;
   sign-in screen, deep-link return, config error, no-studio, no-access, picker.
5. **Shell and Members**: `StudioShell` around studio pages; `MembersSettings` with role-based visibility.
6. **Deletions**: Cloud Sync button and modal, server auth files, browser permission store; fix
   `cloudProjectStore.test.ts` ids; prove the UUID search is clean.
7. **Playwright**: setup project + storage state; new auth and studio specs; existing 62 tests pass
   unchanged through the redirect; CI `e2e` job starts the stack.
8. **Gate**: five-stage gate locally; CI green; founder steps (FR-016, Vercel env, redirect URLs);
   founder pushes the FR-015 migration to production after a fresh backup (same procedure as 041 T038);
   founder signs in on the preview and invites a colleague.

## Post-design Constitution Re-check

The design still passes. Two notes:

- Rewriting `accept_pending_invites` touches one of the three advisor warnings that spec 046 owns. The
  rewrite already meets principle XI, which shrinks 046's list; it does not pre-empt 046's grant sweep.
- Previews use the production project until 048 creates staging (research R8). This is acceptable under
  RLS, and the 041 suite proves isolation. It is recorded so 048 changes it.

## Complexity Tracking

| Item | Why needed | Simpler alternative rejected because |
| --- | --- | --- |
| Changing CI's `e2e` job to start Supabase | Every route now needs a session, and sessions need an Auth server | Mocking auth in Playwright would test a fake, the 034.x failure mode the constitution now forbids |
| Possible branch age over 3 days (estimate 4–5) | Sign-in, shell, members and test infrastructure are one user-visible change; splitting leaves `main` with sign-in but no way to manage a studio | If day 3 passes, split: PR A = client, session, sign-in, gates, test setup; PR B = shell polish, Members, invite migration |
