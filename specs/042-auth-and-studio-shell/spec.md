# Feature Specification: 042 — Google Sign-in and Studio Shell

**Feature Branch**: `042-auth-and-studio-shell`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 1 — Identity and one database (estimate 4–5 days)
**Depends on**: 041
**Blocks**: 043, 045
**Source**: Architecture Review (Architecture: no identity; UI/UX: no studio context) and Playbook (042)

## Context

No code in `src` calls `signInWith`, `getSession` or `onAuthStateChange`. A hand-built fetch client sends the anon key as the bearer token, so `auth.uid()` is always null. Server auth code (`actorResolver`, `jwtVerifier`, `withAuthorization`) is imported by no API handler. The cloud modal exposes a dev "connect session" and hardcoded `00000000-0000-4000-8000-…` ids.

The pre-rewrite app (commit `eaf7d0f`) already had working Google sign-in (`apps/web/src/auth/AuthProvider.tsx`) and team management (`apps/web/src/data/team.ts`) against the live schema, which still has 3 profiles and the `org_invites` table. This spec restores identity using the official client and adds a studio-aware app shell.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Sign in with Google (Priority: P1)

As a designer, I want to sign in with my Google account and stay signed in, so that my work is tied to me and my studio.

**Why this priority**: Every cloud feature and every security control depends on a real user token.

**Independent Test**: On a preview URL, a signed-out visit shows the sign-in screen; "Continue with Google" returns to the app signed in; a reload keeps the session.

**Acceptance Scenarios**:

1. **Given** I am signed out, **When** I open any route, **Then** I see the sign-in screen with a single "Continue with Google" action.
2. **Given** I followed a deep link (e.g. `#/s/acme/projects`) while signed out, **When** sign-in completes, **Then** I land on that exact route.
3. **Given** I am signed in, **When** I reload or reopen the browser, **Then** I am still signed in.
4. **Given** I am signed in, **When** I choose Sign out in the account menu, **Then** the session is cleared, all cached studio data is removed from memory and storage, and I see the sign-in screen.
5. **Given** `VITE_SUPABASE_URL` or the publishable/anon key is missing at build, **When** the app loads, **Then** it shows a configuration error screen naming the missing variable, never a blank page.

---

### User Story 2 — Land in my studio (Priority: P1)

As a designer who belongs to one or more studios, I want to see the studio I am working in and switch between studios, so that I always know whose projects I am looking at.

**Independent Test**: A seeded user in two studios switches; the URL slug and project list change together.

**Acceptance Scenarios**:

1. **Given** I belong to exactly one studio, **When** I sign in, **Then** I land on `/s/<slug>/projects` for that studio.
2. **Given** I belong to two studios, **When** I use the studio switcher, **Then** the URL changes to the other slug and the shell shows that studio's name.
3. **Given** I edit the URL to a slug I am not a member of, **When** the route loads, **Then** I see "You don't have access to this studio" with a link back to my studios; no data from that studio is fetched or shown.
4. **Given** I belong to no studio and have no pending invite, **When** I sign in, **Then** I see an explanation that a studio owner must invite me, with my signed-in email shown.

---

### User Story 3 — Invite colleagues and manage roles (Priority: P2)

As a studio owner or admin, I want to invite designers by email and change their roles, so that my team can work in the studio.

**Independent Test**: An owner invites an email; the invite is listed; that user signs in and lands in the studio with the invited role.

**Acceptance Scenarios**:

1. **Given** I am an owner or admin, **When** I open Settings → Members, **Then** I see members with their roles and pending invites, and an invite form (email + role).
2. **Given** I invite `new@example.test` as designer, **When** that person signs in for the first time, **Then** `private.handle_new_user` creates their profile, `accept_pending_invites` adds them to the studio as designer, and the invite leaves the pending list.
3. **Given** I am an owner, **When** I change a member's role, **Then** it persists and the member sees the change after reload.
4. **Given** I am a designer or viewer, **When** I open Settings → Members, **Then** I see the member list read-only and no invite form or role controls.
5. **Given** a designer calls the invite insert directly through the API, **When** RLS evaluates it, **Then** it is rejected (pgTAP).

---

### User Story 4 — Remove fake identity (Priority: P1)

As the founder, I want every hardcoded user and studio id and every dev-only session path deleted, so that no code path can act as someone without a real sign-in.

**Independent Test**: `grep -rn "00000000-0000-4000-8000" src` returns matches only in test fixtures; the deleted files are gone.

**Acceptance Scenarios**:

1. **Given** the repo after this spec, **When** I search `src` for `00000000-0000-4000-8000`, **Then** matches appear only under test fixtures.
2. **Given** the repo, **When** I list `src/server/auth/`, **Then** `actorResolver.ts`, `jwtVerifier.ts` and their tests no longer exist.
3. **Given** the editor UI, **When** I look for "connect session", **Then** it does not exist.

### Edge Cases

- OAuth callback arrives with `?code=` (PKCE) while the hash router is mounted: the callback is exchanged before the router mounts, then the URL is cleaned.
- The user cancels Google consent: return to sign-in with a neutral message, no error stack.
- A user is removed from the current studio while signed in: the next data request fails under RLS; the shell redirects to the studio list with a message.
- The owner tries to demote the last owner: blocked by the database (if no live constraint exists, add one in a migration with a pgTAP test).
- Invite to an email that already belongs to a member: shown as "already a member", no duplicate row.
- Session token expires mid-session: `supabase-js` refreshes it; if refresh fails, show sign-in and keep the deep link.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST use `@supabase/supabase-js` through a single module `src/infrastructure/supabase/client.ts`, built from `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (renamed to the publishable key in 046), with `flowType: 'pkce'`.
- **FR-002**: Missing configuration MUST render a configuration error screen.
- **FR-003**: The sign-in screen MUST offer Google only in production; email-password MUST be enabled only in local `supabase/config.toml` for tests.
- **FR-004**: Session state MUST live in one small React context fed by `onAuthStateChange`; no new state library.
- **FR-005**: First sign-in MUST rely on `private.handle_new_user` and then call `accept_pending_invites`.
- **FR-006**: Every route except sign-in MUST require a session; the requested route MUST survive the sign-in round trip.
- **FR-007**: The current studio MUST be derived only from the user's `org_members` rows and carried in the URL (`/s/<slug>/…`). No default organisation or user id anywhere outside test fixtures.
- **FR-008**: The shell MUST show studio name and switcher, navigation to Projects and Settings, and an account menu (name, email, sign out).
- **FR-009**: Settings → Members MUST list members and invites and, for owner and admin only, allow inviting by email and changing roles via `org_invites` and `org_members` under existing RLS.
- **FR-010**: The UI MUST read `org_role` only to hide or disable controls, via a role-to-visible-actions map; it MUST NOT authorize.
- **FR-011**: Sign-out MUST clear the session and all cached studio data.
- **FR-012**: Delete: `src/server/auth/actorResolver.ts`, `src/server/auth/jwtVerifier.ts` and tests; dev "connect session"; hardcoded ids in `CloudProjectModal.tsx` and `cloudProjectStore.ts`; the client-side evaluator as a gate.
- **FR-013**: Supabase Auth redirect URLs MUST include localhost, a wildcard for Vercel previews, and production; documented in `docs/`.
- **FR-014**: Any new table, column or policy MUST arrive as a new migration with pgTAP tests in this PR.

### Key Entities

- **Session**: Supabase auth session (access token, refresh token, user).
- **Profile**: display name and avatar for a user.
- **Studio (organization)**: id, slug, name.
- **Membership (org_members)**: user, studio, `org_role`.
- **Invite (org_invites)**: email, studio, role, inviter, status.

## Success Criteria *(mandatory)*

- **SC-001**: A new invited designer goes from invite email to their studio's project list in under 1 minute.
- **SC-002**: Zero matches for the dev UUID prefix outside test fixtures.
- **SC-003**: All Playwright scenarios in User Stories 1–3 pass against local Supabase.
- **SC-004**: pgTAP invite and member policy tests pass.

## Assumptions

- The hash router stays in this spec; path routing moves to a library in 049.
- Studio creation is not offered; "create studio" comes with billing. Existing studios are managed in the database.
- The commit `eaf7d0f` implementations are read for reference and rewritten to current conventions, not copied.

## Out of Scope

Saving projects to the cloud (043), billing, a custom-roles editor, SAML SSO.

## Gate

On the Vercel preview, the founder signs in with Google, sees the studio, invites a colleague, and the colleague lands in the same studio.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-platform-identity`
- **Parent Module**: none
- **Module Capabilities**: sign-in, sign-out, studio switch, member list, invite, role change.
- **Dependencies on Other Modules**: none.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec — identity is available to every studio regardless of plan.

### 3. Usage and Commercial Limits
Not applicable: foundation spec — seat limits arrive with billing.

### 4. RBAC Requirements
- **Required Permissions**: invite and role change require `org_role` in (owner, admin), enforced by RLS on `org_invites` and `org_members`.
- **Applicable Roles**: existing `org_role` enum: owner, admin, designer, viewer.
- **Resource-Level Permissions**: studio-wide.
- **Administrative Management**: no custom roles in this spec.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: `org_members`, `org_invites`.
- **Tenant Isolation Requirements**: boundary is `org_members`; a user sees only studios they belong to.
- **Storage and Cache Isolation**: cached studio data is keyed by studio id and cleared on sign-out and studio switch.
- **Background Worker Tenant Context**: none.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Frontend**: controls hidden for roles that cannot use them; never relied upon.
- **Backend**: RLS on `org_members` and `org_invites`; `accept_pending_invites` derives the user from `auth.uid()`.
- **Audit**: role changes and invites recorded if the live audit table supports it; otherwise deferred to 043's audit port.

### 8. Acceptance Criteria and Security Tests
- **RBAC Permission Tests**: owner and admin can insert invites and update roles; designer and viewer cannot (pgTAP).
- **Tenant Isolation Tests**: a studio A owner cannot list, invite into or change roles in studio B (pgTAP); URL slug of a foreign studio shows no data (Playwright).
- **Anonymous Tests**: signed-out requests read nothing (pgTAP `anon`).
- **Flow Tests**: Playwright scenarios in User Stories 1–3.
