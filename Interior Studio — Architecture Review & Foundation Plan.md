# Interior Studio — Architecture Review & Foundation Plan

Nov 5, 2026 · @Akhilesh

## Executive summary

The design editor is genuinely strong, but the platform under it is not real yet: production has no sign-in and no cloud saving, its AI endpoints are open to anyone, and the 12 migrations behind Features 034.x have never been applied to any database. Stop hardening a path that cannot run. Reconnect one identity system, one schema and one database, then build features on that.

The five things that matter:

1. **Production is a local-only app.** Vercel production serves `main`, and its only environment variable is `GEMINI_API_KEY`. With no Supabase settings, startup falls back to in-memory persistence, and the home screen says projects are stored in this browser. There is no login.
2. **The 034.x cloud layer cannot run.** The hand-built browser client sends the anon key as the bearer token, so `auth.uid()` is always null inside the RPCs. Its `from()` method throws, yet `createProject`, `listProjects` and six other adapter methods call it. Nothing in `src` signs a user in.
3. **Two databases of record that do not match.** The live Supabase project `interior-studio` holds the Oct 24 schema (Phase 0 to 2.7, Google sign-in, 8 projects, 129 saved versions). The repo holds 12 different migrations that appear nowhere in that project's history. The Oct 30 rewrite dropped the working cloud and auth path.
4. **Real exposure today.** Five paid AI endpoints accept anonymous calls. Their rate limiter lives in one function instance's memory, and the same-origin check is skipped when a caller sends no `Origin` header. In the repo schema, 8 tables have no row-level security, including `clients` and `consents` (personal data under DPDP).
5. **Scope outran the foundation.** There are 39 spec folders and 51,600 lines of non-test TypeScript, all of the specs added in the week since the Oct 30 rewrite. Billing, manufacturing, MEP and client portal features sit on persistence that never reaches a server. The 8 workspace packages are 8 to 18 lines each.

**Verdict on 034.x.** The database patterns are sound and worth keeping: compare-and-swap revision commits, idempotency keys, an append-only audit trail. The work hardened code that production never executes, and each review found gaps the completion reports had called closed. Do not open 034.2.3.

**Direction.** A modular monolith on Supabase and Vercel, sized for 5,000 users at roughly $60 to $65 a month before AI and render compute:

- Supabase Auth (Google) in the browser, with the user's own token on every request.
- Postgres row-level security as the only security boundary; RPCs only for multi-row writes.
- Vercel functions only for work that needs a secret (AI providers), each verifying the user's token.
- Object storage for design snapshots, renders and uploads; a Postgres job queue for long renders.
- One trunk branch, and a CI gate that runs every migration and policy test against a real local Postgres.

## What is actually running

Three versions of the system exist side by side, and none of them connects the editor to the live database. Everything below was checked directly on Nov 5, 2026 through the GitHub repo, Vercel and Supabase.

| Layer | What is there | How it was checked |
| --- | --- | --- |
| Production (Vercel) | `main` at `2068765` (PR #8). No login; projects saved to the browser's IndexedDB | Vercel deployment list; built app home screen |
| Integration preview | `integration` at `1863f0b` (PR #9): a second, different implementation of 034.2.2. 7 files differ from `main` (271 lines added, 35 removed) | `git diff main integration` |
| Vercel environment | One variable: `GEMINI_API_KEY` (production). No `VITE_SUPABASE_URL`, no `VITE_CLOUD_PERSISTENCE`, so startup chooses in-memory | Vercel project env list |
| Live Supabase `interior-studio` | Mumbai, Postgres 17. 17 migrations from Oct 24 (`phase0_core_schema` to `quotes`). 16 tables, all with RLS. Data: 8 projects, 129 saved versions, 3 profiles, 16 AI jobs, 12 credit-ledger rows | Supabase migration and table listing |
| Repo `supabase/migrations` | `00001` to `00012`, 2,922 lines. None appear in the live project's history; the table sets differ (`spaces`, `design_revisions`, `outbox_events`, `clients`, `consents`) | File review vs live listing |
| Live database advisors | 3 `SECURITY DEFINER` functions callable by any signed-in user (`accept_pending_invites`, `ai_credit_balance`, `save_project_version`); leaked-password protection off | Supabase security advisor |
| CI | Lint, typecheck, unit tests, build, Playwright. Runs on pushes to `main` and on PRs. No database job; migrations are never applied anywhere | `.github/workflows/ci.yml` |
| Local run (this review) | Build passes. 868 unit tests pass in 136 s. Main chunk 1,429 KB (419 KB gzipped) plus three.js 1,187 KB (358 KB gzipped). No secrets and no dev UUIDs in the production bundle | `npm run build`, `vitest run`, bundle grep |

**How it got here.** On Oct 24 the Phase 0 commit shipped Supabase tenancy, Google sign-in and cloud-saving versions; the live database still holds that data. On Oct 30 the "rewrite on the blueprint stack" replaced it with a local-only editor. Since then all 39 spec folders have been written on top, and the cloud layer was rebuilt from scratch in 034.x without reusing the working schema. The 129 saved versions in the live project are orphaned: no current code reads them.

## Findings by discipline

Sixteen findings are critical or high; most trace back to one cause: there is no signed-in user anywhere in the production path. Severity is about risk at your first 5,000 users, not code style.

### Architecture

| Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Critical | No identity in the production path. No sign-in screen, no session, no token | No `signInWith`, `getSession` or `onAuthStateChange` anywhere in `src` | Supabase Auth with Google, via `@supabase/supabase-js` |
| High | A hand-rolled Supabase client replaces the official one, and gets auth wrong | `persistenceFactory.ts`: `Authorization: Bearer ${anonKey}`; `from()` throws | Delete `SupabaseClientLike`; use `supabase-js`, which sends the user's token |
| High | Two authorization engines that can disagree | `authorizationStore` + `evaluator.ts` in the browser; `public.authorize()` in Postgres | Postgres decides. The browser only hides buttons, from permissions it reads from the database |
| High | Server auth code exists but guards nothing | `actorResolver`, `jwtVerifier`, `withAuthorization` are imported by no API handler | Delete them. Verify tokens with Supabase's JWKS in one small middleware |
| Medium | Monorepo ceremony without content | 8 packages of 8 to 18 lines; Turborepo plus `pnpm-workspace.yaml` beside `package-lock.json` | One app with feature folders; extract a package when a second deployable (the render worker) needs shared code |

### Security

| Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Critical | Five paid AI endpoints are anonymous: assistant, speech, live-token, render, reference | `src/server/*`: no token check; limiter is an in-process `Map`; origin check skipped when `Origin` is absent | Require a Supabase token; debit an org credit ledger in Postgres before each call; add a Vercel WAF rate rule; set provider spend caps |
| High | 8 tables without RLS, incl. personal data | `clients`, `consents`, `project_members`, `roles`, `role_permissions`, `permissions`, `audit_log`, `audit_log_default` | RLS on every table in `public`; a CI check fails the build if any table lacks it |
| High | Function grants revoke only `PUBLIC` | `REVOKE ALL ... FROM PUBLIC` then `GRANT ... TO authenticated`. Supabase also grants `EXECUTE` to `anon` by default | `alter default privileges in schema public revoke execute on functions from public, anon, authenticated`; grant per function |
| High | A service-role branch inside user-facing RPCs | `00012`: trusts a supplied actor when `auth.role() = 'service_role'` | No server calls these RPCs. Delete the branch |
| Medium | `SECURITY DEFINER` functions use `search_path = public, pg_temp` | `00010` to `00012` | `set search_path = ''` and schema-qualified names, per Supabase guidance |
| Medium | Legacy keys and HS256 assumptions | `VITE_SUPABASE_ANON_KEY`; HS256-only verifier | Move to publishable and secret keys and asymmetric JWT signing keys |
| Medium | No Content Security Policy | `vercel.json` sets only frame, sniffing and referrer headers | Add CSP, HSTS and a Permissions-Policy that allows camera and microphone only where voice and site capture need them |
| Medium | Live database warnings | 3 definer functions open to signed-in users; leaked-password protection off | Revoke or convert to `SECURITY INVOKER` during the schema merge |

### Database

| Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| Critical | Schema drift: repo and live database are different systems | 17 live migrations vs 12 repo migrations, no overlap | One source of truth (Phase 1): `supabase db pull` the live schema, then port the good 034.x patterns forward |
| High | Two audit tables | `audit_log` (partitioned) and `audit_events` | Keep one: append-only, partitioned by month |
| Medium | Full design snapshot per save in Postgres | Live: 129 versions for 8 projects (about 16 per project in one day of use) | Fine at launch (a whole home is 5 KB gzipped). Add version thinning; move cold versions to object storage past about 20 GB |
| Medium | Idempotency read-then-insert with a client-supplied hash | `p_canonical_hash` from the browser | Hash inside the RPC; `insert ... on conflict do nothing` on `(org_id, actor_id, op, key)`; purge after 7 days |
| Medium | Outbox with no consumer | `outbox_events` written, never read | Drop until something consumes it |
| Medium | Policy performance at scale | Policies call membership lookups per row | `(select auth.uid())` in policies, one stable `is_org_member(org)` helper, an index on `org_id` everywhere |

### Frontend

| Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| High | Everything loads up front: 777 KB gzipped of JavaScript before the project list appears | One `React.lazy` in `src`; three.js in the first load | Route-split: projects list without three.js; editor, deliverables and admin as separate chunks. Budget: under 250 KB gzipped for the first screen |
| Medium | Server data mixed into 41 Zustand store files | `cloudProjectStore` holds a module-level adapter and sync state | TanStack Query for server data; Zustand only for the editor document, selection and undo |
| Medium | Local-first design is good but has no server behind it | IndexedDB `projectDb.ts` | Keep IndexedDB as an offline cache and outbox; the cloud revision is the source of truth |
| Low | Slow test runs | Vitest builds jsdom 151 times; 136 s | `environment: 'node'` by default, jsdom only in component tests |

### UI and UX

The editor is the product's strength: dimensioned 3D, a typed catalogue, a properties panel, a command line and live design checks in one screen. The problems are around it.

| Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| High | The editor toolbar mixes design with back-office | 12 top-level items incl. Cloud Sync, Studio Tables, Roles & Access; the units menu is clipped at 1440 px | Editor keeps design and output (3D/Plan, Deliverables, BOM, Checks, Export). Org settings move to an app shell |
| High | Saving is a modal, not a state | "Cloud Sync" opens a 615-line modal with a dev-only "connect session" | Autosave with a quiet status (Saved, Saving, Offline, Conflict); conflicts get a focused resolve dialog |
| High | No studio context | No account, no studio name, no team | App shell: sign-in, studio switcher, Projects, Clients, Catalogue, Settings |
| Medium | Home leads with two long forms and an empty list | Built app at 1440 and 390 px | Lead with the projects list (search, client, owner, updated); "New project" as one primary action with templates |
| Medium | Mobile is incidental | Editor is desktop-only; site capture lives inside the editor | A mobile-first site-capture route; editor stays desktop |

### CI/CD

| Severity | Finding | Evidence | Fix |
| --- | --- | --- | --- |
| High | No database in CI; migrations reach no environment | `ci.yml` has no Postgres step | `supabase start`, `supabase db reset`, pgTAP policy tests and adapter integration tests on every PR |
| High | Two long-lived branches with diverging code | 034.2.2 implemented twice (PR #8 to `main`, PR #9 to `integration`) | Trunk: `main` is production; short branches; delete `integration` after merging the better half |
| Medium | No gated migration deploy | Merging to `main` deploys the app; nothing deploys the schema | One workflow: `supabase db push` to production, then promote the Vercel build |
| Medium | No supply-chain or size checks | None in CI | Bundle-size budget, secret scan, dependency audit, Renovate |

## Target architecture

A modular monolith with no custom API server: the browser talks to Supabase directly with the user's token, and Postgres row-level security decides every read and write. Vercel functions exist only where a secret is needed. This is the cheapest shape to run at 5,000 users, and every piece has a known next step past 50,000.

&#91;embedded content: target architecture · 3 Supabase services, 2 function tiers, 1 worker\]

Every call from the browser, and every call the AI functions make into Postgres, carries the signed-in user's token, so the same policies judge both. Provider keys never leave the functions.

### Decisions

| Decision | Choice | Why it fits 5,000 users | Revisit when |
| --- | --- | --- | --- |
| Security boundary | Postgres RLS and RPCs; never browser code | One place to test; works for every client (web, mobile capture, worker) | Never; it only gets more tests |
| Backend | Supabase (Auth, Postgres, Storage) plus Vercel functions for secrets | No servers to run; one founder can operate it | Long multi-step workflows, or a second team owns an API |
| Identity | Supabase Auth, Google sign-in, studio invites by email | Already worked in Phase 0; data still exists | Enterprise customers ask for SAML SSO |
| Tenancy | One schema; `org_id` on every row; membership checked in policies | Simplest isolation that RLS can prove | A customer needs data residency or its own database |
| Design storage | Snapshots as jsonb in Postgres at launch; cold versions move to object storage, named by content hash, past about 20 GB | Measured scenes are 2 to 5 KB gzipped, so Postgres is cheapest and simplest now | Real-time co-editing (then CRDT updates per room) |
| Writes | Plain RLS-checked inserts and updates; RPCs only for multi-row writes (commit revision, import) | Fewer `SECURITY DEFINER` functions, so less to audit | — |
| AI | Server-only calls; org credit ledger debited in a transaction before each call; provider spend caps | Bounds the largest variable cost; ledger table already exists live | Usage pricing per seat |
| Long jobs | `jobs` table (or Supabase Queues) polled by a Cloud Run render worker that scales to zero | Pay only for renders made | Thousands of jobs a day |
| Frontend | One Vite app; route-level code splitting; TanStack Query for server data; IndexedDB as offline cache | Fast first screen; offline editing kept | Public marketing site needs server rendering (separate small site) |
| Repository | One package with feature folders | Removes Turborepo and empty packages | A second deployable shares code |
| Observability | Sentry for browser and functions; Supabase and Vercel logs; uptime check | Errors reach you before users do | An on-call rota exists |

## Refactor plan

Six phases over about eight weeks get you from a local-only editor to a multi-tenant foundation you can sell; feature work resumes in Phase 6. Durations are my estimates for one founder working with coding agents. Each phase ends at a gate you can check in a browser or in CI, not at a completion report.

&#91;embedded content: refactor roadmap · 6 phases, each ending at a gate (diamonds); durations are estimates\]

The feature freeze lifts at the Phase 3 gate: from then on, CI rejects any change that weakens tenant isolation.

### Phase 0 — Freeze and decide (2 days)

- [ ] Freeze new specs (035 onward) until the Phase 3 gate passes.
- [ ] Pick the trunk: merge the better parts of PR #8 and PR #9 into `main`; delete `integration`.
- [ ] Record the decision: the live Supabase schema is the baseline; 034.x patterns are ported onto it.
- [ ] Back up the live database (`pg_dump`) and store it outside Supabase.
- [ ] Set a monthly spend cap on the Gemini key today; the endpoints stay open until Phase 2.

Gate: one branch, one written decision record, a backup file, a spend cap.

### Phase 1 — Identity and one database (2 weeks)

- [ ] `supabase init` and `supabase db pull` the live schema into `supabase/migrations` as the baseline. Move `00001` to `00012` to `docs/archive/`.
- [ ] Add `@supabase/supabase-js`. Google sign-in, session persistence, sign-out.
- [ ] App shell: sign-in, studio switcher, Projects, Settings. Invites reuse the live `org_invites` table.
- [ ] New persistence adapter on `supabase-js` that saves the editor scene to the live `projects` and `project_versions` tables.
- [ ] Port the good 034.x ideas as forward migrations: an expected-head check on save (compare-and-swap), an idempotency key, one append-only audit table.
- [ ] One-time "Move to studio" import for projects already in a user's IndexedDB.
- [ ] Delete: the fetch-based client, `persistenceFactory`'s in-memory production path, `actorResolver`, `jwtVerifier`, dev actor and org UUIDs, client-side permission decisions.

Gate: on a preview URL, sign in with Google, create and save a project, open it on a second device. A user in another studio cannot read it (proven by a pgTAP test). The 129 existing versions open in the editor.

### Phase 2 — Lock down (1 week)

- [ ] Every `/api/*` function verifies the Supabase token against the project's JWKS, checks studio membership, and debits AI credits in one RPC before calling a provider.
- [ ] Vercel firewall rate rule on `/api/*`. Remove reliance on the in-memory limiter.
- [ ] RLS on every table in `public`. Revoke default function `EXECUTE` from `public`, `anon` and `authenticated`; grant per function. `search_path = ''` on every definer function.
- [ ] Fix the 3 live advisor warnings; turn on leaked-password protection.
- [ ] Switch to publishable and secret API keys and asymmetric JWT signing keys.
- [ ] Storage buckets with policies scoped to `org_id/` paths. CSP, HSTS and Permissions-Policy headers.

Gate: Supabase security advisor shows zero warnings. An anonymous `curl` to `/api/assistant` returns 401. A test user with no credits gets 402 and the provider is never called.

### Phase 3 — CI/CD gate (1 week, overlaps Phase 2)

- [ ] PR workflow adds a database job: `supabase start`, `supabase db reset`, `supabase test db` (pgTAP), adapter integration tests against the local stack.
- [ ] Policy tests per table: own studio read and write allowed; other studio denied; anonymous denied.
- [ ] Environments: local (CLI), staging (second Supabase project), production.
- [ ] Deploy workflow on `main`: migrate staging, run Playwright against the preview, migrate production, promote the Vercel build.
- [ ] Bundle-size budget, secret scan, dependency audit, Renovate.

Gate: a PR that disables RLS on any table, or breaks a policy, fails CI.

### Phase 4 — Product shell and performance (2 weeks)

- [ ] Route-level code splitting; the projects list loads without three.js.
- [ ] TanStack Query for server data; Zustand keeps editor state only.
- [ ] Editor toolbar keeps design and output; org settings move to the shell.
- [ ] Autosave with a status indicator; a focused conflict dialog.
- [ ] Home leads with the projects list; a mobile-first site-capture route.
- [ ] Accessibility checks (axe) in Playwright.

Gate: first screen under 250 KB gzipped; Lighthouse LCP under 2.5 s on simulated 4G; toolbar fits 1280 px; no serious axe violations.

### Phase 5 — Scale readiness (2 weeks)

- [ ] Version retention keeps named versions and thins autosaves older than 30 days; cold versions move to object storage once the database passes about 20 GB.
- [ ] `jobs` table and the Cloud Run render worker (restored from history); results by signed URL.
- [ ] Sentry, an uptime check, Supabase and Vercel spend alerts.
- [ ] Load test on staging: 500 simulated editors saving every 30 s.
- [ ] Restore drill from backup; decide on point-in-time recovery.

Gate: the restore drill succeeds; save p95 stays under 500 ms in the load test.

### Phase 6 — Resume features behind the gate

Bring back 035 (lifecycle, approvals) and the parked domains one at a time: billing with a server-side Razorpay webhook, client portal on share links, manufacturing exports. Each ships with its migration, its policy tests and a preview a real user signed into.

### Keep, change, delete

| Area | Keep | Change | Delete |
| --- | --- | --- | --- |
| Editor, engine, geometry, drawings, BOM | All of it | Lazy-load per route | — |
| Persistence | Port interface, IndexedDB cache, revision CAS idea | Adapter on `supabase-js` | Fetch client, in-memory production default |
| Auth and permissions | Permission names and role model | Decisions in Postgres; UI reads them | `actorResolver`, `jwtVerifier`, client evaluator as a gate |
| Database | Live schema and data; CAS, idempotency, audit patterns | Forward migrations on the baseline | Unapplied `00001` to `00012` (archived) |
| AI functions | Handlers, schemas, provider choice | Token check and credit debit first | In-memory limiter as the only control |
| Repo | `specs/` as history | One package | Empty workspace packages, Turborepo, `pnpm-workspace.yaml` |

## Cost at 5,000 users

Fixed infrastructure comes to about $60 a month at 5,000 users; AI calls and renders are the only costs that grow with use, and both get hard caps. Prices are list prices in USD as published in 2026 (sources at the end).

| Item | Plan | Monthly cost | What it covers at 5,000 users |
| --- | --- | --- | --- |
| Supabase production | Pro, Small compute | $30 ($25 plan + $15 Small − $10 included credit) | 100,000 MAU, 8 GB disk, 100 GB storage, 250 GB egress, daily backups for 7 days |
| Supabase staging | Second project on the same org | $10 | Never pauses, unlike a Free project after a week idle |
| Vercel | Pro, 1 seat | $20 (includes $20 of usage) | 1 TB transfer; the SPA is static, AI functions mostly wait on providers |
| Object storage beyond 100 GB | Supabase Storage, or Cloudflare R2 for renders | $0 to $3 | R2 is $0.015 per GB-month with free egress, useful once 4K and 360° renders pile up |
| **Fixed total** |  | **about $60 to $65** |  |
| AI calls | Pay per token | Capped by credits | Each studio gets a monthly credit pool; the provider account has a hard spend cap |
| Render worker | Cloud Run, scales to zero | Per render | Charged only while rendering |

**Design data is small.** I measured scenes saved by the current editor: a furnished kitchen is 14 KB (1.8 KB gzipped) and a whole 2BHK home is 125 KB (5 KB gzipped). Saved versions in the live database average 1.8 KB per row. At 5,000 users with 10 projects each and 30 kept versions, that is up to about 20 GB in Postgres after its built-in compression if every project were a whole home, about $2 a month over the 8 GB included. So snapshots can stay in Postgres at launch. Move cold versions to object storage only when the database passes about 20 GB. Renders and site photos, not designs, will drive storage.

**At 50,000 users** the plan changes in three places: a larger compute size (priced on Supabase's compute page), point-in-time recovery ($100 a month per 7 days of retention), and MAU still inside the 100,000 included. Vercel stays on Pro unless traffic passes 1 TB a month.

Guardrails to set on day one: Supabase spend cap on (the default), Vercel spend alert, provider spend caps, and an alert when any studio uses 80% of its AI credits.

## How to work with coding agents from here

The 034.x loop happened because "done" meant a report, and nothing the agent wrote ever ran against a real database or a signed-in user. Change what counts as done, and the loop stops.

1. **Done means green CI on `main`, plus a preview you signed into.** A pasted test summary is not evidence; a link to the CI run and the preview URL is.
2. **Every schema change ships in the same PR as its pgTAP policy tests.** CI applies it to a fresh local Supabase and runs them.
3. **One trunk.** Branches live a day or two. No spec-only branches; the spec, code and tests land together.
4. **Small slices.** One agent task is one user-visible change, roughly under 400 changed lines, with its gate written first.
5. **Rules in `AGENTS.md` the agent cannot argue with:** use `supabase-js`, never a hand-rolled client; no hand-written crypto or JWT code; every new table gets RLS and policy tests; no `SECURITY DEFINER` without a revoke and a test; no default IDs for users or studios outside tests.
6. **Review the running thing, not the diff summary.** Before merging, open the preview, sign in, do the feature, and check the Supabase advisor.
7. **Freeze new domains until the Phase 3 gate.** New areas (billing, manufacturing, MEP) multiply the surface that the foundation must later secure.

## Sources and checks

Code findings come from the `integration` branch at `1863f0b` and `main` at `2068765` of [ajha23/interior-studio](https://github.com/ajha23/interior-studio/tree/integration). Deployment, environment and database facts come from the Vercel and Supabase accounts, read on Nov 5, 2026. Build, tests, bundle sizes, screenshots and scene sizes come from running the app locally.

- [Supabase pricing](https://supabase.com/docs/pricing): Pro plan, compute sizes, included usage, PITR.
- [Supabase: Introducing JWT signing keys](https://supabase.com/blog/jwt-signing-keys): asymmetric keys, JWKS, `getClaims`, publishable and secret keys.
- [Supabase database functions](https://supabase.com/docs/guides/database/functions): `search_path` and revoking `EXECUTE` from `public` and `anon`.
- [Supabase advisor lint 0028](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0028_anon_security_definer_function_executable) and [lint 0029](https://supabase.com/docs/guides/observability/advisors?queryGroups=lint&lint=0029_authenticated_security_definer_function_executable): default `EXECUTE` grants to `anon` and `authenticated`.
- [Vercel cost in 2026 (MakerKit, May 2026)](https://makerkit.dev/blog/saas/vercel-cost): Pro seat price, included usage, Hobby's non-commercial limit.
- [Cloudflare R2 pricing (Upstash)](https://upstash.com/kb/cloudflare-r2-pricing-in-2026-storage-operations-and-real-monthly-bills): storage per GB-month and free egress.

Not verified here: AI provider token prices (they change often, and credits cap them anyway) and Cloud Run render costs (they depend on render volume).
