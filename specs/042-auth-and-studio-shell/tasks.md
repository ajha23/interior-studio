---
description: "Task list for 042 — Google Sign-in and Studio Shell"
---

# Tasks: 042 — Google Sign-in and Studio Shell

**Input**: Design documents from `specs/042-auth-and-studio-shell/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/routes-and-session.md](contracts/routes-and-session.md), [quickstart.md](quickstart.md)

**Tests**: Requested by the spec (Playwright acceptance for each story, pgTAP for invite and member policies, FR-015). Each story's tests are written before its implementation.

**Organization**: US1, US2 and US4 are P1; US3 is P2. US4 (remove fake identity) can run any time after Phase 2.

**Evidence rule (constitution 2.3.0)**: a task is checked only when its command was run and its output recorded. Production-writing commands are run by the founder only.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an unfinished task)
- **[Story]**: US1–US4 from spec.md

---

## Phase 1: Setup

**Purpose**: Dependencies, configuration and the local test environment.

- [X] T001 Confirm the e2e CI fix (Chromium new headless, screenshot paths) is merged to `main`, then rebase `042-auth-and-studio-shell` on `main`; record `git log --oneline -1 main`
- [X] T002 Add the client as an exact dependency: `npm install --save-exact @supabase/supabase-js@2.118.0`; verify `package.json` lists `"@supabase/supabase-js": "2.118.0"`
- [X] T003 [P] Add `playwright/.auth/` and `.env.local` to `.gitignore` (verify `.env.local` is already ignored; add only what is missing)
- [X] T004 [P] Document the three browser variables in `.env.example` exactly as in [contracts/routes-and-session.md](contracts/routes-and-session.md): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (with the note "renamed to the publishable key in spec 046"), and `VITE_AUTH_PASSWORD_SIGN_IN` ("'true' only for local development and Playwright; never in production")
- [X] T005 [P] Add `both@example.test` to `supabase/seed.sql`: a user in `auth.users` + `auth.identities` (same pattern and local password as the other seed users, id `d0000000-0000-4000-8000-000000000000`), with `org_members` rows as `designer` in Alpha and `viewer` in Beta. Run `npm run db:reset && npm run db:test` and confirm the 041 suite still passes (this user is not used by the cross-tenant tests)

---

## Phase 2: Foundational (blocking prerequisites)

**Purpose**: The client, the session context, studio routes and the test infrastructure every story needs.

**⚠️ CRITICAL**: No story work starts until this phase is complete.

- [X] T006 Create `src/infrastructure/supabase/client.ts`: read `import.meta.env.VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; export `supabaseConfigError` (`null`, or a message naming each missing variable) and, when configured, one `createClient<Database>(url, key, { auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })` typed with `./database.types`. No other module may call `createClient`
- [X] T007 [P] Write `src/features/auth/SessionProvider.test.tsx` (RTL, mocked client module) before the provider: starts `loading`; `signed-out` with no session; `signed-in` with a session, calling `accept_pending_invites` once and then loading memberships; `signOut()` clears memberships and `interior-studio:last-studio`; a failing membership load sets `error` without signing out
- [X] T008 Implement `src/features/auth/SessionProvider.tsx` and `src/features/auth/useSession.ts` per [contracts/routes-and-session.md](contracts/routes-and-session.md): `status`, `user` (`id`, `email`, `name`, `avatarUrl` from `user_metadata`), `memberships` (`org_members.select('role, organizations ( id, name, slug )')` mapped to `{ orgId, orgName, orgSlug, role }`), `error`, `signInWithGoogle`, `signInWithPassword` (only when `VITE_AUTH_PASSWORD_SIGN_IN === 'true'`), `signOut`, `refreshMemberships`; subscribe with `onAuthStateChange`; T007 passes
- [X] T009 [P] Write `src/features/auth/returnTo.test.ts`, then implement `src/features/auth/returnTo.ts`: `rememberReturnTo(hash)` writes `sessionStorage['auth:return-to']`; `takeReturnTo()` reads and clears it; `cleanAuthParams()` removes `code`, `error` and `error_description` from the query string with `history.replaceState`, keeping the hash; storage access wrapped in try/catch
- [X] T010 Extend `src/app/router.ts` (and its tests in `src/app/router.test.ts`, creating the file if absent) with `{ name: 'studio-projects'; slug }` for `#/s/<slug>/projects` and `{ name: 'studio-settings'; slug; section: 'members' }` for `#/s/<slug>/settings/members`; slug pattern `[a-z0-9-]{2,60}` (the live `organizations.slug` check); existing editor routes unchanged; `#/` stays `{ name: 'home' }`
- [X] T011 Add a Playwright `setup` project in `playwright.config.ts` and create `e2e/auth.setup.ts`: sign in through the email form as `designer.a@example.test` / `password123`, wait for `#/s/alpha/projects`, save storage state to `playwright/.auth/designer.json`; make project `chromium` depend on `setup` and use that storage state; pass `VITE_SUPABASE_URL=http://127.0.0.1:54321`, `VITE_SUPABASE_ANON_KEY` and `VITE_AUTH_PASSWORD_SIGN_IN=true` in `webServer.env`. When `VITE_SUPABASE_ANON_KEY` is not set, `playwright.config.ts` reads it once from `npx supabase status -o env` (`ANON_KEY`) and fails with "Start the local stack: npm run db:start" if that fails, so `npm run e2e` needs no manual step **Verified in T018: setup signs in as designer.a and saves the session.**
- [X] T012 Change the `e2e` job in `.github/workflows/ci.yml`: after `npm ci`, run `npm run db:start` and `npm run db:reset`, export the local anon key (`npx supabase status -o env` → `ANON_KEY`) as `VITE_SUPABASE_ANON_KEY` for the Playwright step; keep `npx playwright install --with-deps chromium`

**Checkpoint**: the provider and router tests pass; Playwright's setup project signs in locally.

---

## Phase 3: User Story 1 — Sign in with Google (Priority: P1) 🎯 MVP

**Goal**: A signed-out visitor sees one sign-in screen; Google sign-in returns them to the page they asked for; the session survives reload; sign-out works; missing configuration shows an error screen.

**Independent Test**: On a preview, a signed-out visit shows the sign-in screen; "Continue with Google" returns to the app signed in; reload keeps the session.

### Tests for User Story 1

- [X] T013 [P] [US1] Write `e2e/auth.spec.ts` with a fresh (signed-out) context: any route shows the sign-in screen with "Continue with Google"; signing in (email form) from `#/s/alpha/settings/members` lands on that route (deep link); reload keeps the session; account menu → Sign out returns to the sign-in screen and reload stays signed out
- [X] T014 [P] [US1] Write `src/features/auth/SignInScreen.test.tsx` and `src/features/auth/ConfigErrorScreen.test.tsx`: Google button calls `signInWithGoogle` after `rememberReturnTo(location.hash)`; the email form renders only when password sign-in is enabled; the config screen names each missing variable

### Implementation for User Story 1

- [X] T015 [US1] Implement `src/features/auth/SignInScreen.tsx` (product name, one primary "Continue with Google", the email form only when enabled, a neutral message when Google consent is cancelled via `error` in the URL) and `src/features/auth/ConfigErrorScreen.tsx`, using `src/components/ui` primitives and existing tokens
- [X] T016 [US1] Wire `src/app/App.tsx`: render `ConfigErrorScreen` when `supabaseConfigError` is set; otherwise wrap everything in `SessionProvider`; while `loading` show the existing loading state; when `signed-out` show `SignInScreen` for every route; on becoming `signed-in`, call `cleanAuthParams()` and restore `takeReturnTo()` if present. Editor routes stay as they are but are now behind the session
- [X] T017 [US1] Add the account menu (name, email, Sign out) to the shell header in `src/features/studio/StudioShell.tsx` (create the component with the header only; studio parts come in US2). Do not add it to the editor's `src/components/layout/TopBar.tsx` (plan constraint: the editor changes only to remove dead imports and the Cloud Sync button)
- [X] T018 [US1] Run `npm test` for the new unit tests and `npm run e2e -- e2e/auth.spec.ts`; record the output

**Checkpoint**: US1 independent test passes locally.

---

## Phase 4: User Story 2 — Land in my studio (Priority: P1)

**Goal**: Signed-in users land in their studio; the URL carries the slug; a two-studio user can switch; foreign slugs show no data; users with no studio see what to do.

**Independent Test**: `both@example.test` switches between Alpha and Beta; URL and project list follow; `#/s/beta/projects` as an Alpha-only user shows "no access".

### Tests for User Story 2

- [X] T019 [P] [US2] Write `e2e/studio.spec.ts` (studio part): designer.a at `#/` lands on `#/s/alpha/projects` with "Alpha Studio" in the header; `both@example.test` at `#/` sees the studio picker, picks Beta, the URL becomes `#/s/beta/projects`, the switcher changes back to Alpha; designer.a at `#/s/beta/projects` sees "You don't have access to this studio" and the network log shows no request filtered by Beta's id; `stranger@example.test` sees "Ask a studio owner to invite stranger@example.test" and a Sign out action
- [X] T020 [P] [US2] Write `src/features/studio/StudioGate.test.tsx` and `src/features/studio/roleActions.test.ts`: slug → membership resolution; unknown slug → no-access screen without calling the members API; role → visible actions exactly as the table in [data-model.md](data-model.md) ("Owners never appear as a choice in the invite or role selectors")

### Implementation for User Story 2

- [X] T021 [P] [US2] Implement `src/features/studio/roleActions.ts` (role → visible actions map, FR-010) and `src/features/studio/useStudio.ts` (current membership from the URL slug + its actions)
- [X] T022 [US2] Implement `src/features/studio/StudioGate.tsx` (slug resolution; no-access screen; no-studio screen) and `src/features/studio/StudioPicker.tsx`; `#/` redirect rule: one studio → its projects; else the `interior-studio:last-studio` slug if still a membership; else the picker. Write the last-used slug on every studio route visit (try/catch)
- [X] T023 [US2] Complete `src/features/studio/StudioShell.tsx`: studio name and switcher (from memberships; switching keeps the section and changes the slug), navigation to Projects and Settings, the account menu from T017. Render `ProjectsHome` inside the shell for `studio-projects` in `src/app/App.tsx`; leave `ProjectsHome` itself unchanged
- [X] T024 [US2] Run the US2 unit tests and `npm run e2e -- e2e/studio.spec.ts`; then the full existing suite `npm run e2e` (62 tests must still pass through the `#/` redirect); record the output

**Checkpoint**: US1 and US2 pass together; existing e2e suite unchanged and green.

---

## Phase 5: User Story 4 — Remove fake identity (Priority: P1)

**Goal**: No code path can act as someone without a real sign-in.

**Independent Test**: `grep -rn "00000000-0000-4000-8000" src` matches only test fixtures; the deleted files are gone; no "Cloud Sync" or "connect session" in the UI.

- [ ] T025 [P] [US4] Delete `src/server/auth/actorResolver.ts`, `src/server/auth/actorResolver.test.ts`, `src/server/auth/jwtVerifier.ts`, `src/server/auth/jwtVerifier.test.ts`, `src/server/authorizationMiddleware.ts`, `src/server/authorizationMiddleware.test.ts`, `src/server/policyMiddleware.ts`, `src/server/policyMiddleware.test.ts`; first confirm with `grep` that no API handler (`src/server/*Handler.ts`, `src/server/vercel*.ts`, `src/server/node.ts`) imports them
- [ ] T026 [P] [US4] Remove the Cloud Sync button and its state from `src/components/layout/TopBar.tsx`; delete `src/features/projects/CloudProjectModal.tsx` and `src/features/projects/CloudProjectModal.test.tsx`
- [ ] T027 [P] [US4] Delete `src/state/authorizationStore.ts`, `src/state/authorizationStore.test.ts`, `src/features/shared/useAuthorize.ts`, `src/features/shared/useSubscriptionPolicy.ts` and their tests; keep `src/domain/platform/authorization/` (pure catalogue, research R7)
- [ ] T028 [P] [US4] Replace hard-coded `00000000-0000-4000-8000-…` ids in `src/state/cloudProjectStore.test.ts` with ids from `crypto.randomUUID()` or a local fixture constant in `src/test/ids.ts`
- [ ] T029 [US4] Run `grep -rn "00000000-0000-4000-8000" src` (matches only under `src/test/` or in `*.test.ts(x)` fixtures), `grep -rni "cloud sync\|connect session" src` (no matches), `npm run lint && npm run typecheck && npm test`; record the output

**Checkpoint**: SC-002 holds; nothing imports the deleted files.

---

## Phase 6: User Story 3 — Invite colleagues and manage roles (Priority: P2)

**Goal**: Owners and admins invite by email and change roles; designers and viewers see the member list read-only; invites never change an existing member's role.

**Independent Test**: An owner invites an email; it is listed; that user signs in and lands in the studio with the invited role. Inviting an existing member says "already a member".

### Tests for User Story 3 (database first)

- [ ] T030 [US3] Write `supabase/tests/05_invites.test.sql` per [data-model.md](data-model.md) "Tests": admin.a inviting `designer.a@example.test` throws `23505`; admin.a inviting `owner.a@example.test` as viewer throws `23505`; a stale invite written as `postgres` for owner.a as viewer, then owner.a calls `accept_pending_invites()` → owner.a is still `owner` and the invite has `accepted_at`; a new user (created in the test) invited as designer gets a `designer` membership on accept; designer.a cannot insert an invite (`42501`); a user created in the test with `email_confirmed_at` null and a pending invite for their address gets 0 from `accept_pending_invites()` and no membership; `anon` cannot execute `accept_pending_invites` (`has_function_privilege` false). Run `npm run db:test` and record that the new file fails before T031
- [ ] T031 [US3] Create the migration with `npx supabase migration new invites_never_change_existing_members` and implement it exactly as in [data-model.md](data-model.md) "Migration": security-invoker trigger function `private.reject_invite_for_member()` with `search_path = ''` raising `already a member` (errcode `23505`), trigger `org_invites_reject_member` `BEFORE INSERT` on `public.org_invites`; `create or replace function public.accept_pending_invites()` that returns 0 unless the caller's `auth.users.email_confirmed_at is not null`, with `on conflict (org_id, user_id) do nothing`, `security definer`, `set search_path = ''`, schema-qualified names, `revoke execute … from public, anon`, `grant execute … to authenticated`. Run `npm run db:reset && npm run db:test` (all pass) and `npm run db:types:check` (regenerate if needed)
- [ ] T032 [P] [US3] Write `e2e/studio.spec.ts` (members part) and `src/features/studio/MembersSettings.test.tsx`: owner.a sees members with roles, pending invites and the invite form; invites `new.member@example.test` as designer → listed as pending with "Ask them to sign in with Google using this address"; inviting `designer.a@example.test` shows "already a member"; owner.a changes viewer.a to designer and it persists after reload; first-sign-in flow: as `postgres`, create a confirmed user `invitee@example.test` with no membership and an Alpha invite as designer, sign that user in through the email form, and assert they land on `#/s/alpha/projects` with role designer; designer.a and viewer.a see the member list without the invite form or role controls; no selector offers "owner"

### Implementation for User Story 3

- [ ] T033 [P] [US3] Implement `src/features/studio/membersApi.ts`: `listMembers(orgId)` (org_members, then profiles for those user ids), `listInvites(orgId)`, `invite(orgId, email, role)` (maps `23505` to "already a member"), `changeRole(orgId, userId, role)`; all through the client from T006; roles limited to `admin`, `designer`, `viewer`
- [ ] T034 [US3] Implement `src/features/studio/MembersSettings.tsx` and the `studio-settings` route in `src/app/App.tsx` inside `StudioShell`: members table (name, email, role, "you"), pending invites (admin+ only), invite form and role selector shown per `roleActions`; empty, loading and error states that say what happened and what to do next; after an accepted invite elsewhere, `refreshMemberships()` on focus
- [ ] T035 [US3] Run `npm test` and `npm run e2e -- e2e/studio.spec.ts`; record the output

**Checkpoint**: All four stories pass locally.

---

## Phase 7: Polish & Gate

- [ ] T036 Run the five-stage gate and `npm run db:reset && npm run db:test`; record the output: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
- [ ] T037 Push the branch and open a draft PR; record links for green `check`, `db` and `e2e` jobs
- [ ] T038 Founder: confirm the Google provider in the live project (FR-016); if missing, create the Google OAuth client (redirect URI `https://pkbctmaiawztzmwqkpgw.supabase.co/auth/v1/callback`) and enable the provider. Also confirm the **Email** provider is disabled in production (or that "Confirm email" is on). No agent handles the client secret
- [ ] T039 Founder: in Supabase Auth → URL Configuration set the site URL to the production URL and add redirect URLs `http://localhost:5173/**`, `http://localhost:5174/**`, the Vercel preview wildcard for this project and the production URL; document the values (not secrets) in `docs/auth.md`
- [ ] T040 Founder: add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` for the live project to Vercel Production and Preview; never set `VITE_AUTH_PASSWORD_SIGN_IN` there
- [ ] T041 Founder, same procedure as spec 041 T038: fresh backup with row counts checked → `npx supabase db push --remote --dry-run` lists only `<timestamp>_invites_never_change_existing_members.sql` and no seeds → founder runs `npx supabase db push --remote` → agent verifies `migration list --remote` matches and `db diff --remote --schema public,private,storage` is empty
- [ ] T042 Founder gate on the PR's Vercel preview: sign in with Google, see your studio, invite a colleague; the colleague signs in with Google and lands in the same studio. Record the preview URL and the time from invite to landing in the studio (SC-001) in the PR
- [ ] T043 Update `specs/FOUNDATION-PLAN.md` (042 done, date, PR) and complete the PR description: CI links, preview URL, the FR-015 finding and fix, production migration output, deleted files list

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → stories.** T001 first (the e2e fix must be on `main`).
- **US1 (Phase 3)** needs T006–T011. **US2 (Phase 4)** needs US1's `App.tsx` wiring (T016) and the shell header (T017).
- **US4 (Phase 5)** needs only Phase 2.
- **US3 (Phase 6)** needs US2 (shell, `useStudio`, `roleActions`). T030 → T031 strictly (tests first).
- **Polish**: T036–T037 after all stories; T038–T040 any time (founder); T041 after T031 is on the PR; T042 after T038–T041.

### Within stories

- US1: T013, T014 parallel → T015 → T016 → T017 → T018.
- US2: T019, T020 parallel → T021 → T022 → T023 → T024.
- US4: T025, T026, T027, T028 parallel; T029 last.
- US3: T030 → T031; T032 and T033 parallel; T034 → T035.

## Parallel Examples

```text
# After Phase 2:
T013 e2e/auth.spec.ts
T014 SignInScreen / ConfigErrorScreen tests
T025 delete server auth files
T027 delete browser permission store
T028 cloudProjectStore.test ids

# Founder, any time:
T038 Google provider · T039 redirect URLs · T040 Vercel env
```

## Implementation Strategy

### MVP (US1)

Phases 1–3: sign-in screen, Google sign-in, session, sign-out, configuration error. Already removes the
"no identity anywhere" finding.

### Incremental delivery

1. MVP (US1) → 2. US2 studio shell and routing → 3. US4 deletions → 4. US3 members and invites with
the FR-015 migration → 5. gate.

### Split point (plan's Complexity Tracking)

If the branch passes 3 days, merge **PR A** = Phases 1–5 (sign-in, studio routing, deletions, test
infrastructure) and continue **PR B** = Phase 6 + the founder gate steps for invites.
