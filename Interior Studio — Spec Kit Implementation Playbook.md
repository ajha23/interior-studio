# Interior Studio — Spec Kit Implementation Playbook

Nov 5, 2026 · @Akhilesh

## How to run each step

Each spec below is one Spec Kit cycle in Claude Code, from `/speckit-specify` to a merged PR whose gate you checked yourself. The prompts are written for this repo's setup: Spec Kit 1.2.5, skills in `.claude/skills/speckit-*`, sequential numbering, constitution 2.2.0.

**Numbering.** Your newest spec folder is `03422-…`, which the numbering script reads as 3422, so the next automatic number would be 3423. Every prompt below therefore starts by naming its number (040 onward) and short name; the script accepts a preferred number when that prefix is free.

### The loop for one spec

1. Start clean: `git switch main && git pull`. Run `npm run check` once so you know the baseline is green.
2. `claude` in the repo root, then `/speckit-specify` followed by the spec's prompt block, pasted whole. It creates the branch and `specs/NNN-name/spec.md`.
3. `/speckit-clarify`. Answer its questions with the **Clarify answers** listed for that spec; anything not listed, answer in one line and add it to the spec.
4. `/speckit-plan` followed by the spec's **Plan constraints** block. Read the Constitution Check in the plan; reject a plan that adds a server, a new package or hand-written auth code.
5. `/speckit-tasks`, then `/speckit-analyze`. Fix every CRITICAL and HIGH finding in the artifacts before any code.
6. `/speckit-implement`, one task group at a time. After each group, ask: "Show the diff summary and the exact commands you ran with their output." Stop it if it marks a task done without output.
7. Run the spec's **Gate** yourself: the commands and the browser check. A gate is passed only when you saw it pass.
8. `/speckit-converge`, then open the PR. Merge only on green CI and after you used the Vercel preview.

### Rules for every session

- One spec, one branch, one PR. Branches live 1 to 3 days. Nothing merges to a second long-lived branch.
- If Claude proposes code outside the spec's scope, say no and add it to the tracker instead.
- Keep `main` deployable after every merge; Phase 1 hides cloud features behind sign-in, not behind half-built code.
- When a prompt says **Delete**, deletion is part of done. Old code left "for later" is how 034.x accumulated.
- Paste error output back to Claude verbatim; never summarise a failure for it.
- Start each new session with: "Read AGENTS.md, the constitution and specs/NNN-name/ before anything else."

## Phase 0 — Freeze and decide (2 days)

Phase 0 is four manual steps and one constitution amendment; no feature spec. Do the steps in this order, because the amendment changes the rules every later spec is checked against.

### Step 0.1 — Cap AI spend now

The production AI endpoints are open until spec 045. In the Google Cloud project that owns the Gemini key: set a billing budget with alerts at 50%, 80% and 100%, and lower the Generative Language API quota (requests per day) to what your team uses. In Vercel, turn on spend management for the project.

### Step 0.2 — One trunk

Both `main` and `integration` carry a version of 034.2.2. Phase 1 deletes most of that code, so take `integration` (it also has the specs) and retire the branch:

```bash
git switch main && git pull
git switch -c chore/merge-integration
git merge origin/integration -X theirs
npm ci && npm run check
git push -u origin chore/merge-integration   # open a PR into main, merge on green CI
git push origin --delete integration         # after the merge
```

In Vercel, keep `main` as the production branch; every PR gets a preview.

### Step 0.3 — Back up the live database

The live project holds your team's 8 projects and 129 versions. Dump it before anything touches it, and keep the files out of git (they contain user data):

```bash
npx supabase login
npx supabase link --project-ref pkbctmaiawztzmwqkpgw
npx supabase db dump -f ~/backups/interior-studio/2026-11-05-schema.sql
npx supabase db dump --data-only -f ~/backups/interior-studio/2026-11-05-data.sql
```

### Step 0.4 — Freeze

Add a line to the top of `docs/ROADMAP.md`: "Feature freeze until spec 048 (CI database gate) merges. Specs 035 and later wait." Close or label any open feature branches.

### Step 0.5 — Amend the constitution

Run in Claude Code:

```text
/speckit-constitution Amend the constitution to version 2.3.0 (MINOR). Rationale: Features 034.1 to 034.2.2 hardened a cloud path that production never ran; the rules below make that impossible to repeat.

Add Core Principle XI "The Database Is the Security Boundary":
- Every table in the public schema has row-level security enabled and policies covering select, insert, update and delete.
- Tenant isolation is decided by Postgres policies and RPCs using auth.uid(). Browser permission checks only decide what to show; they never authorize.
- Every SECURITY DEFINER function sets search_path = '' and uses schema-qualified names, and EXECUTE is revoked from public, anon and authenticated before it is granted to the one role that needs it.
- User-facing RPCs never accept an actor id or trust a service role. Privileged server work uses its own narrow function.

Add Core Principle XII "Official Clients, No Hand-Written Security Code":
- Browser and server code talk to Supabase only through @supabase/supabase-js.
- Tokens are verified with Supabase's JWKS (auth.getClaims or the jose library). No hand-written JWT, HMAC or crypto code.
- No default user, studio or organisation ids outside test fixtures.

Replace the Definition of Done with evidence:
- A feature is done when its PR is merged to main with green CI, CI applied its migrations to a fresh local Supabase and ran its pgTAP policy tests, and a person signed into the Vercel preview and used the feature.
- Reported command output is not evidence; the CI run link and the preview URL are.

Add a branching rule: main is the only long-lived branch; feature branches live at most 3 days.

Amend the mandatory SaaS section: foundation and infrastructure specs may answer an item with "Not applicable: foundation spec" plus one sentence of reason. Tenant isolation and security tests (item 8) are never optional.

Update AGENTS.md and CLAUDE.md to match, and record the amendment in the Sync Impact Report.
```

**Gate.** `main` is the only branch; the backup files exist; the spend cap is set; constitution 2.3.0 is merged.

## Phase 1 — Identity and one database (2 weeks)

Four specs reconnect the editor to the live Supabase project, whose schema is better than I expected: it already has private helper functions (`is_org_member`, `can_edit_org`, `can_admin_org`), an `org_role` enum (owner, admin, designer, viewer), five private storage buckets, an AI credit ledger with `ai_debit`, and `save_project_version`. Build on it rather than on the 034.x tables.

One surprise from the data: the 129 saved versions use the earlier editor's scene format (schema versions 1 to 7, with `plan` and `furniture` keys). Today's editor uses a different model (kitchen `SCHEMA_VERSION` 2, home `HOME_SCHEMA_VERSION` 1). Spec 044 decides what happens to them.

### 041 · Supabase baseline and local stack (2 to 3 days)

**Specify**

```text
/speckit-specify Use feature number 041 and short name supabase-baseline.

Make the live Supabase project (ref pkbctmaiawztzmwqkpgw, "interior-studio", Mumbai) the single source of truth for the database schema, and give every developer and CI run a reproducible local copy.

Why: the repo holds 12 migrations (00001 to 00012) that were never applied to any database, while the live project has 17 applied migrations and the team's real data. Two schemas mean every review checks SQL that never runs.

Scope:
- Initialise the Supabase CLI in the repo (supabase/config.toml), pinned as a devDependency.
- Bring the live migration history into supabase/migrations so local history matches production exactly (17 migrations, phase0_core_schema to quotes).
- Move 00001 to 00012 to docs/archive/migrations-034/ with a README: never applied; ideas to port later are revision compare-and-swap, idempotency keys and an append-only audit table.
- A seed file with synthetic data only: two studios, users in each with roles owner, designer and viewer, two projects per studio with a few versions.
- Generate TypeScript types into src/infrastructure/supabase/database.types.ts, plus a check that fails when they are stale.
- A pgTAP suite in supabase/tests: RLS enabled on every public table; a studio A user cannot select, insert, update or delete studio B rows in projects and project_versions; anon reads nothing.
- npm scripts: db:start, db:reset, db:test, db:types, db:types:check.

Out of scope: sign-in UI, app code, new tables, fixing advisor warnings (spec 046).

Acceptance:
- npx supabase start then npx supabase db reset builds the database with zero errors.
- npx supabase db diff --linked reports no differences from the live project.
- npx supabase test db passes, and the cross-tenant tests fail when one policy is dropped (show this once).
- Generated types are committed and db:types:check passes.

SaaS section: items 1 to 4, 6 and 7 are "Not applicable: foundation spec". Item 5: tenant boundary is org_id checked through private.is_org_member. Item 8: the pgTAP tests above.
```

**Clarify answers**

- History import: use `supabase migration fetch` to download the 17 live migrations. If that is unavailable, `supabase db pull` into one baseline file and `supabase migration repair` so the live history matches. Do not restore the files from git history at eaf7d0f: their version stamps differ from the live history.
- Seed users: create them with SQL in `seed.sql` (auth.users plus identities), never real emails.
- pgTAP style: plain pgTAP with `set local role authenticated` and `set local request.jwt.claims`; no extra test-helper extension unless a test cannot be written without it.

**Plan constraints**

```text
/speckit-plan Use the Supabase CLI through npx with the version pinned in package.json. Change nothing in src except adding the generated types file. Tests live in supabase/tests/*.test.sql. From this spec on, every schema change is a new file from `supabase migration new`; never edit a migration that is on main.
```

**Gate.** All four acceptance commands pass on your machine; `db diff --linked` is empty.

### 042 · Google sign-in and studio shell (4 to 5 days)

**Specify**

```text
/speckit-specify Use feature number 042 and short name auth-and-studio-shell.

Users sign in with Google through Supabase Auth and work inside a studio (organization). Production today has no sign-in at all.

Who: a studio owner invites designers by email; designers sign in with Google and land in their studio's project list.

Requirements:
- Add @supabase/supabase-js. One client module, src/infrastructure/supabase/client.ts, built from VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (renamed to the publishable key in spec 046), using the PKCE flow. If either variable is missing, show a configuration error screen, not a blank page.
- Sign-in screen with "Continue with Google"; session persisted by supabase-js; sign-out in the account menu.
- First sign-in relies on the existing private.handle_new_user trigger for the profile, then calls accept_pending_invites.
- App shell for signed-in users: studio name and switcher (from org_members), navigation to Projects and Settings, account menu.
- Every route except sign-in requires a session; a deep link survives the sign-in round trip.
- The current studio comes only from the user's memberships and lives in the URL (/s/<slug>/...). No default organization or user id anywhere.
- Studio settings: members and roles; owners and admins invite by email and change roles, using org_invites and org_members under their existing RLS.
- The UI reads the user's org_role only to hide or disable controls; it never authorizes.
- Delete: src/server/auth/actorResolver.ts, src/server/auth/jwtVerifier.ts and their tests; the dev "connect session" and every hardcoded 00000000-0000-4000-8000-... id in CloudProjectModal.tsx and cloudProjectStore.ts; the client-side evaluator as a gate (keep a role-to-visible-actions map).

Out of scope: saving projects to the cloud (043), billing, a custom-roles editor.

Acceptance (Playwright on local Supabase, using an email-password test user that exists only in local config):
- A signed-out visit to any route shows sign-in; after sign-in the user returns to that route.
- A user in two studios can switch; the URL and project list follow.
- A designer sees no invite form; an owner invites and the invite is listed.
- Sign-out clears the session and all cached studio data.
- Searching src for 00000000-0000-4000-8000 finds matches only in test fixtures.

SaaS section: item 4 uses the existing org_role enum; item 5 the boundary is org_members; item 8 the tests above plus pgTAP tests for invite and member policies.
```

**Clarify answers**

- Router: keep the current hash router in this spec and add the guard; routing moves to a library in spec 049. The OAuth callback (`?code=` with PKCE) is handled before the router mounts.
- Redirect URLs: localhost, a wildcard for Vercel previews, and production, added in Supabase Auth settings.
- Email-password sign-in: enabled only in local `config.toml` for tests; production allows Google only.
- Studio creation: only the existing studio for now; "create studio" comes with billing. Reference: the pre-rewrite app at commit eaf7d0f already had Google sign-in (apps/web/src/auth/AuthProvider.tsx) and team management (apps/web/src/data/team.ts). Read them for what worked; rewrite to current conventions.

**Plan constraints**

```text
/speckit-plan No new state library: the session lives in a small React context and the studio in the URL. Touch the editor only to remove dead imports. New Supabase tables or policies, if any, come as new migrations with pgTAP tests in this PR.
```

**Gate.** On the Vercel preview, you sign in with Google, see your studio, invite a colleague, and the colleague lands in the same studio.

### 043 · Cloud projects on the live schema (5 to 6 days)

**Specify**

```text
/speckit-specify Use feature number 043 and short name cloud-projects.

Projects save to the studio's Supabase database and open on any device. IndexedDB stays as an offline cache.

Requirements:
- Projects list from public.projects for the current studio (name, client, status, updated, owner); create, rename, archive.
- Both document types the editor has today (kitchen project and whole home) save as versions in public.project_versions. A new migration adds doc_type ('kitchen', 'home', 'legacy_v1') and backfills existing rows as 'legacy_v1'.
- Saves go through save_project_version, extended by a new migration with p_expected_version_no (compare-and-swap: reject with a conflict error when projects.current_version_no differs) and p_idempotency_key (a retried save returns the same version). The scene hash is computed in the database. search_path '' and per-role grants, per constitution principle XI.
- Autosave 2 s after the last command (kind autosave); explicit save is kind manual with an optional message. A status indicator shows Saved, Saving, Offline (queued) or Conflict.
- Edits made offline are queued in IndexedDB and saved in order when the connection returns.
- On conflict, a dialog offers: load theirs, or save mine as a new version on top of theirs. Never overwrite silently.
- Version history: who, when, kind, message; open a past version read-only; restore saves it as a new version.
- Viewers open projects read-only (private.can_edit_org decides in the database).
- One persistence adapter on supabase-js, with no module-level default adapter.
- Delete: SupabaseClientLike and createBrowserSupabaseClient; InMemoryPersistenceAdapter outside tests; persistenceFactory's environment bootstrapping; CloudProjectModal.tsx; cloudProjectStore code and cloudTypes for spaces and design_revisions, which do not exist in the live schema.

Out of scope: legacy_v1 projects (044), render storage, AI.

Acceptance:
- A project created in one browser opens with the same design in another browser signed into the same studio.
- Two tabs edit one project: the second save shows the conflict dialog and no version is lost.
- Offline for three edits, then online: three versions saved in order (Playwright setOffline).
- A retried save with the same idempotency key creates one version (pgTAP).
- A studio B user cannot read studio A's projects or versions (pgTAP and Playwright).

SaaS section: item 3 no quotas yet; item 5 tenant boundary is org_id; item 8 the tests above.
```

**Clarify answers**

- Retention: keep every version for now; spec 052 thins old autosaves.
- Size limit: the RPC rejects scenes over 2 MB with a clear message (a whole 2BHK home is 125 KB today).
- Rooms of a home stay inside the home document; no separate rooms table.
- Who can save: owner, admin and designer; viewer is read-only.

**Plan constraints**

```text
/speckit-plan Use supabase-js rpc() and from() with the generated types from 041. Every SQL change is a new migration with pgTAP tests in the same PR. src/domain and src/engine stay framework-free; persistence code lives under src/infrastructure. Server state stays in the existing store for now; TanStack Query arrives in spec 049.
```

**Gate.** Open the same project on your laptop and phone browser; force a conflict between two tabs; go offline and back. All three behave as specified.

### 044 · Local and earlier-editor projects (2 to 3 days)

**Specify**

```text
/speckit-specify Use feature number 044 and short name project-import.

Bring projects that live outside the studio into it, without losing data.

1. Browser projects: after sign-in, if IndexedDB holds kitchen projects or homes not linked to the cloud, show a one-time banner: "N projects on this computer: move them to <studio>". Moving uploads each as a new project with one manual version and marks the local copy as linked; nothing local is deleted.
2. Earlier-editor projects: projects whose versions are all doc_type legacy_v1 show in Projects with an "Earlier editor" badge. They open as a read-only summary (name, client, created, version count). Owners can download the latest version as JSON or archive the project.

Acceptance:
- With two local projects, the banner appears once; after moving, both open from another browser.
- Moving twice does not duplicate (the local id is recorded on the cloud project).
- Legacy projects never open in the current editor, and their JSON download matches the stored scene.

SaaS section: item 5 imports land only in the current studio; item 8 the tests above plus a pgTAP test that a viewer cannot import.
```

**Clarify answers**

- Convert earlier-editor scenes to the current model? No. There are 8 such projects; re-create the ones still active by hand. Build a converter only if more than five are still live work.
- Where to record the local id: a nullable `source_local_id` on projects, unique per studio.

**Gate.** Your own browser's local projects appear in the studio; the 8 earlier projects show with their badge and download.

Phase 1 is done when all four gates pass on the production URL, not only on previews.

## Phase 2 — Lock down (1 week)

Three specs close the exposure that exists today. Spec 045 matters most: it is the only one that protects money.

### 045 · Signed-in, credit-metered AI endpoints (3 days)

**Specify**

```text
/speckit-specify Use feature number 045 and short name ai-auth-and-credits.

The five AI endpoints (/api/assistant, /api/speech, /api/live-token, /api/render, /api/reference) accept anonymous calls today and spend the studio's provider keys. Only signed-in studio members may call them, and every call is paid for from the studio's AI credits.

Requirements:
- Each endpoint requires Authorization: Bearer <Supabase access token> and an x-studio-id header. Verify the token against the project's JWKS (supabase.auth.getClaims or jose with createRemoteJWKSet); reject missing or invalid tokens with 401.
- Server-side, create a Supabase client that carries the user's token, so every database call runs as that user under RLS. The server never uses a secret key for these endpoints.
- Before calling a provider, call one RPC that checks membership in the studio (403 if not a member, 403 for viewers), checks the balance, debits the cost and inserts an ai_jobs row, in one transaction. 402 when credits are insufficient; the provider is then never called.
- Costs per endpoint and model live in one server-side table (code constant is fine), not in the request.
- If the provider call fails, the same job is refunded with a positive ledger row and the job marked failed.
- Reuse the live ai_credit_ledger, ai_jobs, ai_credit_balance and private.ensure_monthly_grant. The public RPC is SECURITY INVOKER and calls a private SECURITY DEFINER function that derives the user from auth.uid() and ignores any user id in its arguments.
- Remove the in-memory RateLimiter as a security control (it may stay as a courtesy limit). Add a Vercel firewall rate-limit rule for /api/* documented in docs/.
- Browser: send the token and studio on every AI call; show the studio's remaining credits in the assistant panel; handle 402 with a clear message and, for owners, a link to Settings.

Acceptance (integration tests against local Supabase with the provider mocked):
- No token: 401. Token from another studio: 403. Viewer: 403.
- Zero credits: 402, and the mock provider receives no call.
- Ten concurrent calls with credit for five: exactly five succeed; the balance never goes negative.
- Provider failure: the debit is refunded and the job is failed.

SaaS section: item 3 is the subject (monthly grant, debit per call, behavior at zero); item 4 viewers cannot spend; item 5 credits and jobs are per studio; item 8 the tests above.
```

**Clarify answers**

- Monthly grant size per plan: keep whatever `ensure_monthly_grant` grants today; pricing comes with billing.
- Live voice tokens: debit when the token is issued, sized for one session.
- Studio header vs body: header, so every endpoint parses it the same way. Reference: commit eaf7d0f had credit-metered AI as Supabase Edge Functions (supabase/functions/\_shared/ai.ts, ai-command, ai-image); reuse its debit logic, keep the Vercel handlers.

**Plan constraints**

```text
/speckit-plan Keep the handlers in src/server and the Vercel build script as they are; add one auth-and-credits wrapper used by all five handlers. Use jose or supabase-js for verification, never hand-written JWT code. New SQL as migrations with pgTAP tests, including the concurrency test.
```

**Gate.** From your terminal, `curl -X POST https://<production>/api/assistant` returns 401. Signed in, the assistant works and the credit count drops.

### 046 · Database privilege hardening (2 days)

**Specify**

```text
/speckit-specify Use feature number 046 and short name db-privilege-hardening.

Bring the database to constitution principle XI and clear the live security advisor.

Requirements:
- Default privileges: revoke EXECUTE on functions in schema public from public, anon and authenticated, for existing and future functions; grant each function only to the role that needs it.
- Every SECURITY DEFINER function, in public and private, sets search_path = '' and uses schema-qualified names.
- Functions callable through the API (accept_pending_invites, ai_credit_balance, save_project_version, ai_debit and those added in 043 and 045) become SECURITY INVOKER wrappers in public; the privileged part moves to private SECURITY DEFINER functions that derive the user from auth.uid().
- Switch the app and functions to the new publishable and secret API keys, then rotate the project to asymmetric JWT signing keys; revoke the legacy JWT secret once both environments work.
- Enable leaked-password protection.
- A pgTAP test lists every function in public with its grants and fails on any unexpected grant to anon.

Acceptance:
- Supabase security advisor on production reports zero findings.
- All earlier pgTAP and Playwright tests still pass.
- A request using the old anon JWT key is rejected after revocation.

SaaS section: items 1 to 4 and 6 "Not applicable: foundation spec"; item 7 enforcement is in the database; item 8 the grant and isolation tests.
```

**Clarify answers**

- Order of the key switch: add the new keys to Vercel and local env first, deploy, verify, then rotate signing keys, verify again, then revoke the legacy secret. Never in one step.
- Is `private` exposed through the API? It must not be; the plan checks the API's exposed schemas.

**Plan constraints**

```text
/speckit-plan Apply to staging first. One migration per concern (grants, search_path, invoker wrappers) so a failure is easy to locate. Use `supabase db lint` and the Management API advisor in CI where possible.
```

**Gate.** The advisor page for production shows no findings, and the app still signs in, saves and calls AI.

### 047 · Security headers and storage policies (2 days)

**Specify**

```text
/speckit-specify Use feature number 047 and short name headers-and-storage.

Requirements:
- Headers on every response (vercel.json and scripts/build-vercel-output.mjs): Content-Security-Policy, Strict-Transport-Security (2 years, includeSubDomains), Permissions-Policy allowing camera and microphone for self only, geolocation off.
- CSP: default-src 'self'; connect-src 'self' plus the Supabase URL and its wss realtime endpoint; img-src 'self' data: blob: plus Supabase storage; worker-src 'self' blob:; style-src 'self' 'unsafe-inline' (React style attributes); frame-ancestors 'none'. Ship as Report-Only for one week, then enforce.
- Storage: for the live buckets (models, renders, ai, plans, render-jobs), the first path segment is the org id; policies allow read and write only to members of that studio, and write only to owner, admin and designer. File size and MIME limits per bucket.
- Client shares use signed URLs with an expiry, never public buckets.
- pgTAP tests for storage policies: own studio allowed, other studio denied, anon denied.

Acceptance: securityheaders.com grade A on production; storage tests pass; the editor, renders and site photos still work with CSP enforced.

SaaS section: item 5 storage paths per studio; item 8 the storage tests.
```

**Gate.** Browser console shows no CSP violations during a full session: sign in, open a project, render, upload a photo, use voice.

## Phase 3 — CI database gate and deploys (1 week, alongside Phase 2)

One spec turns every rule above into something CI enforces; when it merges, the feature freeze lifts. Start it in parallel with 045, because 046 should be tried on the staging project this spec creates.

### 048 · CI database gate and gated deploys (4 to 5 days)

**Specify**

```text
/speckit-specify Use feature number 048 and short name ci-db-gate.

No change reaches production unless its migrations, policies and user flows passed against a real database. Today CI never starts Postgres and nothing deploys the schema.

Requirements:
- Environments: local (Supabase CLI), staging (a second Supabase project, Mumbai), production. Vercel previews use staging; production uses production.
- Pull-request workflow, all jobs required by branch protection on main:
  - check: lint, typecheck, unit tests, build, bundle-size budget (ratchet at today's size until spec 049 lowers it).
  - db: supabase start, db reset, test db (pgTAP), db:types:check, db lint.
  - e2e: Playwright against the built app and the local Supabase stack with seeded users.
  - security: secret scan (gitleaks) and dependency audit (osv-scanner or npm audit for production dependencies).
- Deploy workflow on push to main: supabase db push to staging, Playwright smoke against staging, then (GitHub environment "production" with you as required reviewer) supabase db push to production, then deploy the Vercel production build with the Vercel CLI. Vercel's own automatic production deploy from main is turned off; previews stay automatic.
- Migrations must be backward compatible with the previous app version (expand, then contract in a later PR), because the database migrates before the app deploys. Document this rule in docs/.
- Renovate for dependencies, grouped weekly.
- A rollback runbook in docs/: how to redeploy the previous Vercel build and how to write a forward-fix migration.

Acceptance (demonstrate each with a throwaway PR, then close it):
- A migration that disables RLS on a table fails the db job.
- A policy change that lets studio B read studio A fails the db job.
- Stale generated types fail the db job.
- A committed fake secret fails the security job.
- A merge to main migrates staging, waits for your approval, migrates production, then deploys.

SaaS section: "Not applicable: foundation spec" for items 1 to 4 and 6; items 5, 7 and 8 are enforced by the db job.
```

**Clarify answers**

- Supabase branching instead of a staging project? Not yet; a second project is simpler and costs $10 a month.
- Secrets in GitHub: `SUPABASE_ACCESS_TOKEN`, `STAGING_PROJECT_REF`, `STAGING_DB_PASSWORD`, `PRODUCTION_PROJECT_REF`, `PRODUCTION_DB_PASSWORD`, `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- CI time budget: under 12 minutes for a PR; cache the Supabase Docker images and Playwright browsers.

**Plan constraints**

```text
/speckit-plan GitHub Actions only. Pin action versions by SHA. Reuse the npm scripts from 041 so local and CI run the same commands. Keep the current ci.yml jobs working until the new ones are required, then delete the old file in the same PR.
```

**Gate.** The five throwaway PRs behave as listed, and branch protection shows the four jobs as required. Then remove the freeze line from `docs/ROADMAP.md`.

## Phase 4 — Product shell and performance (2 weeks)

Two specs: 049 changes how the app loads and holds server data; 050 changes what designers see around the editor. Do 049 first, since 050's screens are new routes.

### 049 · Routes, code splitting and server state (5 days)

**Specify**

```text
/speckit-specify Use feature number 049 and short name routes-and-server-state.

The first screen downloads about 777 KB of gzipped JavaScript, including three.js, before showing a project list. Load only what each screen needs, and keep server data in one cache.

Requirements:
- Path-based routes with TanStack Router: /sign-in, /s/:slug/projects, /s/:slug/p/:projectId (editor), /s/:slug/p/:projectId/deliverables, /s/:slug/settings/*. Old hash URLs (#/project/..., #/home/...) redirect to the new paths.
- Each route is a lazy chunk. three.js, @react-three/*, postprocessing and n8ao load only with the editor and deliverables routes.
- TanStack Query for all server data (projects, versions, members, credits), with keys scoped by studio, so switching studio cannot show another studio's cached data. Zustand keeps only editor document state, selection and undo.
- Bundle budget in CI: the projects route's JavaScript is at most 250 KB gzipped.
- Replace the deprecated advancedChunks option in vite.config.ts.
- Vitest: environment node by default, jsdom only for *.test.tsx; target under 60 s locally.

Acceptance:
- Lighthouse CI on the projects route (mobile, simulated 4G): LCP under 2.5 s, total blocking time under 200 ms.
- Navigating from projects to the editor loads the 3D chunk once and caches it.
- Switching studio clears the previous studio's queries (test).
- An old hash link from before this change opens the right project.

SaaS section: item 5 query keys include the studio id; other items "Not applicable: foundation spec".
```

**Clarify answers**

- TanStack Router or React Router? TanStack Router: typed params and loaders pair with TanStack Query. If the agent pushes back strongly, React Router data mode is acceptable; do not keep the hand-written router.
- Prefetch the editor chunk on hover over a project card: yes.

**Gate.** The Lighthouse CI report is attached to the PR and meets the numbers; the size budget job is green.

### 050 · Studio shell and editor toolbar (5 to 6 days)

**Specify**

```text
/speckit-specify Use feature number 050 and short name studio-shell-ux.

Designers open the app to work on projects; studio administration should not compete with design tools. Today the editor toolbar has 12 top-level items, including Cloud Sync, Studio Tables and Roles & Access, and clips at 1440 px.

Requirements:
- Projects home leads with the studio's projects: name, client, status (lead, design, approved, production, installed), last updated, owner; search; filter by status; card and list views. One primary action, New project, opening a dialog: kitchen (existing presets) or whole home (existing form).
- Editor top bar: back to Projects, project name with save status, view switch (3D, Plan, Split), then Deliverables, BOM, Checks, Export, and an overflow menu. It fits at 1280 px without clipping.
- Move Studio Tables, Roles & Access and studio settings to Settings in the shell. Remove the Cloud Sync entry; saving is shown by the status indicator from spec 043.
- Site capture becomes its own mobile-first route (/s/:slug/p/:projectId/site) for measuring on site with a phone.
- Empty, loading and error states for every new screen, each saying what happened and what to do next.
- Accessibility: keyboard reachable controls, visible focus, labels; axe checks in Playwright on projects, editor shell, settings and site capture.

Acceptance:
- At 1280 x 800 the editor bar shows every primary item with nothing clipped (Playwright screenshot test).
- No serious or critical axe violations on the four screens.
- On a 390 px wide viewport, site capture can record a wall length and a photo.
- Every control does something real (constitution: no placeholder buttons).

SaaS section: item 4 Settings entries follow org_role; item 7 controls hidden for roles that cannot use them, enforcement already in the database.
```

**Clarify answers**

- Visual design source: the existing tokens in `src/app/index.css` and `src/components/ui`; no new design system in this spec.
- Project status changes: owners, admins and designers; viewers see it read-only.

**Plan constraints**

```text
/speckit-plan Before coding, produce a short screen inventory and the new information architecture in design.md, then critique screenshots of the current projects page and editor bar for hierarchy, consistency and discoverability, and fold the findings into tasks. Do not change editor tools or behavior, only where they are reached from.
```

**Gate.** A designer on your team uses the new shell for a day and can find everything without asking you.

## Phase 5 — Scale readiness (2 weeks)

Two specs prepare for 5,000 users: long renders move off the request path, and you can see, restore and load-test the system before customers find its limits.

### 051 · Render jobs and the Cloud Run worker (5 days)

You built a Blender Cycles worker for Cloud Run on Oct 24 (commit `2e85014`: `workers/blender/` with `server.py`, `render_scene.py`, a Dockerfile and `.github/workflows/blender-worker.yml`). The live database still has `ai_jobs`, `renders` and the `render-jobs` bucket. This spec brings that back on the new foundation.

**Specify**

```text
/speckit-specify Use feature number 051 and short name render-jobs.

Photoreal renders (4K and 360 degree) run as background jobs instead of inside a 60-second Vercel function, so designers can keep working and renders finish reliably.

Requirements:
- A designer requests a render from the editor; the request goes through the credit-metered path from spec 045 and creates a queued job for the current project version.
- Restore the Blender worker from commit 2e85014 into workers/blender/, deployed to Cloud Run in asia-south1 with minimum instances 0.
- The worker claims jobs with a private function using FOR UPDATE SKIP LOCKED, renders, uploads to the renders bucket under <org_id>/<project_id>/, and marks the job done with the storage path. It uses a dedicated database role or secret key that can call only the job functions.
- Jobs time out after 15 minutes and retry up to twice; then they fail and refund credits.
- The editor shows job status (queued, rendering, done, failed) via Supabase Realtime or polling every 5 s, and shows finished renders from signed URLs.

Acceptance:
- With the worker stopped, a request stays queued; starting the worker completes it.
- Two workers never render the same job (integration test with two claimers).
- A failed render refunds the credits.
- A studio B user cannot see studio A's jobs or render files.

SaaS section: item 3 renders are metered by credits; item 5 jobs and files carry org_id and the worker sets tenant context per job; item 8 the tests above.
```

**Clarify answers**

- Realtime or polling: polling at 5 s first; Realtime only if the team asks for faster updates.
- GPU: CPU Cycles at launch; measure render time per job before paying for GPUs.

**Gate.** A 4K render requested on production completes while you keep editing, and Cloud Run shows zero instances afterwards.

### 052 · Observability, retention, backups and load test (5 days)

**Specify**

```text
/speckit-specify Use feature number 052 and short name ops-readiness.

Know when the product breaks before customers tell you, keep the database small, and prove it holds 5,000 users.

Requirements:
- Sentry for the browser app and the Vercel functions, with releases tied to git SHAs and source maps uploaded in CI; user and studio ids attached, no design content.
- An uptime check on the production URL and a /api/health endpoint, alerting by email.
- Spend alerts: Supabase usage, Vercel spend, Google Cloud budget.
- Version retention as a scheduled database job (pg_cron): keep every manual and revision version; keep the newest 20 autosaves per project plus one per day for older ones; delete the rest after 30 days.
- A k6 load test against staging: 500 virtual designers, each saving a 125 KB home every 30 s and listing projects every minute, for 15 minutes.
- A restore drill: restore the latest production backup into a scratch project and open a project from it. Write the steps in docs/runbooks/restore.md.
- A one-page decision in docs/ on point-in-time recovery ($100 a month for 7 days).

Acceptance:
- A thrown error in staging appears in Sentry with its release and readable stack trace.
- The load test keeps save p95 under 500 ms and error rate under 0.5%, with database CPU under 70%.
- The retention job leaves manual versions untouched (pgTAP).
- The restore drill succeeds and its duration is recorded.

SaaS section: "Not applicable: foundation spec" except item 5 (retention runs per studio, never across) and item 8.
```

**Gate.** You have the load-test report, the restore time, and a test alert in your inbox. Then reopen the spec queue: 035 lifecycle first.

## Tracker

Thirteen steps, about eight weeks; update the status as you go. Specs in the same phase can overlap only where the "Depends on" column allows.

| Step | Phase | Depends on | Estimate | Gate you check | Status |
| --- | --- | --- | --- | --- | --- |
| 0 · Freeze, trunk, backup, cap, constitution 2.3.0 | 0 | — | 2 days | One branch, backup files, spend cap, amendment merged | Not started |
| 041 · supabase-baseline | 1 | 0 | 2 to 3 days | `db diff --linked` empty; pgTAP cross-tenant tests pass | Not started |
| 042 · auth-and-studio-shell | 1 | 041 | 4 to 5 days | Google sign-in on preview; colleague joins your studio | Not started |
| 043 · cloud-projects | 1 | 042 | 5 to 6 days | Same project on two devices; conflict and offline behave | Not started |
| 044 · project-import | 1 | 043 | 2 to 3 days | Local projects moved; 8 earlier projects badged | Not started |
| 045 · ai-auth-and-credits | 2 | 042 | 3 days | Anonymous `curl` gets 401; credits drop per call | Not started |
| 046 · db-privilege-hardening | 2 | 043, 045, staging from 048 | 2 days | Advisor shows zero findings in production | Not started |
| 047 · headers-and-storage | 2 | 043 | 2 days | No CSP violations in a full session | Not started |
| 048 · ci-db-gate | 3 | 041 | 4 to 5 days | Five throwaway PRs fail as designed; freeze lifted | Not started |
| 049 · routes-and-server-state | 4 | 048 | 5 days | Lighthouse LCP under 2.5 s; first screen under 250 KB | Not started |
| 050 · studio-shell-ux | 4 | 049 | 5 to 6 days | A designer works a day without asking where things are | Not started |
| 051 · render-jobs | 5 | 045, 048 | 5 days | 4K render finishes in background; worker scales to zero | Not started |
| 052 · ops-readiness | 5 | 048 | 5 days | Load test p95 under 500 ms; restore drill timed | Not started |

After 052, reopen the queue with 035 (lifecycle and approvals), then billing with a server-side Razorpay webhook, each through the same loop and the CI gate.
