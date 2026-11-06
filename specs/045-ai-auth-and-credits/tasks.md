---
description: "Task list for 045 — Signed-in, Credit-Metered AI Endpoints"
---

# Tasks: 045 — Signed-in, Credit-Metered AI Endpoints

**Input**: Design documents from `specs/045-ai-auth-and-credits/`

**Prerequisites**: [plan.md](plan.md), [spec.md](spec.md), [research.md](research.md), [data-model.md](data-model.md), [contracts/ai-endpoints.md](contracts/ai-endpoints.md), [contracts/ai-rpc.md](contracts/ai-rpc.md), [quickstart.md](quickstart.md)

**Tests**: Requested (spec SaaS §8, SC-001–SC-003). Database first: pgTAP and the concurrency script before the migration. The wrapper and handler tests come before their code; Playwright before the browser work.

**Organization**: US1 (only members) and US2 (credits) are P1 and share the wrapper and the database function, which are built in Phase 2. US3 (the panel) is P2.

**Evidence rule (constitution 2.3.0)**: a task is checked only when its command was run and its output recorded. **Founder-only**: the production `db push` and the Vercel Firewall rule.

## Format: `[ID] [P?] [Story] Description`

---

## Phase 1: Setup

- [X] T001 Baseline from `/Users/akhil/WorkSpace/interior-studio-045`: `npm run db:reset && npm run db:test` (expect 452), `npm test` (expect 921), and record. Run the live check (research R12) again before the production push, not now. — **Done 2026-11-06**: `db:reset` exit 0; `db:test` → `Files=7, Tests=452`, PASS; `npm test` → 158 files, **921** passed.
- [X] T002 [P] Write `docs/operations/ai-endpoints.md`: — **Done**: `docs/operations/ai-endpoints.md` (checks, costs, operator SQL, the firewall steps, quick curl check).
  - the cost table (contracts/ai-endpoints.md);
  - the order of checks and status codes;
  - how the operator reads jobs and the ledger for a studio, in SQL;
  - **founder steps for the Vercel Firewall rule**: Vercel → Project → Firewall → Configure → New rule; "If Request Path starts with `/api/`" → Rate Limit, fixed window 60 s, 60 requests, key IP; action Deny for 10 minutes; Save and Publish;
  - a note that the in-memory limiter is a courtesy only.

---

## Phase 2: Foundational (database + wrapper; blocks all stories)

### Tests first

- [X] T003 Write `supabase/tests/07_ai_metering.test.sql`. Use the `t045` helper schema and the impersonation pattern from `03_roles.test.sql`/`06_self_serve.test.sql`, seeded Alpha/Beta users, and a Free test studio with 0 credits. Cover: — **Done**: 43 assertions; seen failing before the migration (`function "public.ai_start_call(uuid, text)" does not exist`, 43/43 failed).
  - **grants:** `ai_start_call` and `ai_finish_call` are executable by `authenticated` only (not `anon`, not `public`); `ai_debit` no longer exists; `ai_credit_balance` and both private bodies have `search_path=""`; `private.ai_costs` and `private.ai_call_tokens` are not selectable by `authenticated`;
  - **roles:** anon → `PT401`; Beta's owner on Alpha → `PT403`; Alpha viewer → `PT403`; Alpha designer, admin and owner → ok;
  - **costs:** after `ai_start_call(alpha, 'assistant')`, the balance drops by exactly 1, with one `debit` row (`-1`, same `job_id`) and one `running` job of kind `command`; each op's cost matches the table (`render` 10, `live` 5, …); `assistant_rules` writes a job and no ledger row; an unknown op → `22023`;
  - **402:** the Free studio (0 credits) → `PT402` for `assistant` and still ok for `assistant_rules`; a balance of `cost − 1` → `PT402`; a balance of exactly `cost` → ok, then `PT402`;
  - **finish:** `ai_finish_call(ok)` → `succeeded`, no refund; `(not ok)` → `failed` plus one `refund` row `+cost` with the same `job_id`; a wrong token, another user or a second call → `PT409`, with no extra rows;
  - **stale:** a `running` job backdated 16 minutes is failed and refunded by the next `ai_start_call` for that studio; a 14-minute-old one is not;
  - **isolation:** an Alpha member can't start or finish a job for Beta.

  Run `npm run db:test` and see it fail (functions missing).
- [X] T004 [P] Write `scripts/test-ai-concurrency.mjs`. It works only on local URLs (same guard as `e2e/support/localAdmin.ts`). It: — **Done**: seen failing before the migration (10 × `PGRST202`, balance left at 5).
  1. creates a fresh studio and owner through the local admin API and service key (setup only), and sets the balance to exactly 5 with a `topup` ledger row;
  2. signs in as that owner and fires 10 parallel `rpc('ai_start_call', { p_org, p_op: 'assistant' })` from 10 separate clients;
  3. asserts exactly 5 ok and 5 `PT402`, a final balance of 0 and exactly 5 jobs;
  4. cleans up.

  Add the npm script `"db:test:concurrency": "node scripts/test-ai-concurrency.mjs"`. Run it and see it fail.
- [X] T005 [P] Write `src/server/aiCall.test.ts` for the wrapper `withAiCall(handler, deps)`, with a fake `getClaims` and a fake RPC client: — **Done**: 22 cases (plus 1 added with T007 for the default verifier); seen failing (import missing).
  - no header, an empty `Bearer`, or `getClaims` returning `data: null` → 401 `unauthorized`;
  - `AuthInvalidJwtError` → 401;
  - any other `getClaims` error → 503 `unavailable`;
  - missing Supabase env → 503 before the token is checked;
  - a POST without `x-studio-id` or with a non-uuid → 400;
  - `charge('assistant')` mapping `PT403`→403 and `PT402`→402 with the contract messages, and the handler never reaching the provider;
  - after a 2xx, `ai_finish_call(ok=true)` is called and `x-ai-credits` is set;
  - after a provider-error status, `ai_finish_call(ok=false)` is called;
  - a handler that never charges → no finish call;
  - a `PT409` from finish is logged, not surfaced;
  - a body carrying `user_id`, `cost`, `credits` or `studio` fields changes nothing: the RPC is called with the header studio and the handler's op only (spec edge case);
  - the per-request client gets `Authorization: Bearer <token>`, and no secret key appears in the deps.

  Run it and see it fail.

### Implementation

- [X] T006 Create the migration `npx supabase migration new ai_metered_calls` per `contracts/ai-rpc.md` and `data-model.md`: — **Done**: `supabase/migrations/20261106163231_ai_metered_calls.sql`. `db:reset` exit 0; `db:test` → `Files=8, Tests=495`, PASS (452 + 43). Each assertion shown passing with psql in the db container (43/43). **Mutation check**: setting the render cost to 9 made 5 assertions fail (costs, both boundaries, then empty, refund); restored to 10. `db:test:concurrency` → `{"calls":10,"credit":5,"charged":5,"refusedNoCredits":5,"otherErrors":[],"jobs":5,"balance":0}` PASS. `db:types` regenerated (`ai_debit` gone, `ai_start_call`/`ai_finish_call` added); `db:types:check` → current. **Correction to the design**: an invoker wrapper runs with the caller's privileges, so `authenticated` also executes the private bodies (revoked from `public`/`anon`); `private` is not exposed through the API. `contracts/ai-rpc.md` and this task were updated.
  - `private.ai_costs`, seeded `assistant command 1`, `assistant_rules command 0`, `speech audio 1`, `reference image 3`, `render image 10`, `live live 5`;
  - `private.ai_call_tokens`;
  - the `ai_jobs_kind_check` constraint becomes `('image','model','command','audio','live')`;
  - `private.ai_start_call` and `private.ai_finish_call`: `security definer`, `set search_path = ''`, qualified names, `auth.uid()` only, `SQLSTATE` `PT401`/`PT403`/`PT402`/`PT409`/`22023`, `for update` on `public.organizations`, the stale-job refund, and `private.ensure_monthly_grant`;
  - the public invoker wrappers `public.ai_start_call(uuid, text)` and `public.ai_finish_call(uuid, text, boolean, text, text)`;
  - on the private bodies and the public wrappers alike, `revoke all … from public, anon` and `grant execute … to authenticated` (an invoker wrapper needs the caller to be able to execute the body; `private` is not exposed through the API); no grants on `private.ai_costs` or `private.ai_call_tokens`;
  - drop `public.ai_debit(uuid, int, uuid, uuid, text)`;
  - recreate `public.ai_credit_balance` with `search_path = ''`.

  Then `npm run db:reset && npm run db:test`: T003 passes and the earlier suites stay green. Then `npm run db:test:concurrency`: T004 passes. Then `npm run db:types && npm run db:types:check`.
- [X] T007 Implement `src/server/aiCall.ts` (`withAiCall`, `AiCall` with `charge(op)`, and an `AiOp` type of the six ops): — **Done**: `src/server/aiCall.ts`. It also rejects a verified token without `role = authenticated` and a `sub` (the anon key is itself a signed JWT). `ProviderErrorCodeSchema` gains `unauthorized`, `forbidden`, `no_credits`. `aiCall.test.ts` → 23 passed.
  - read `SUPABASE_URL ?? VITE_SUPABASE_URL` and `SUPABASE_ANON_KEY ?? VITE_SUPABASE_ANON_KEY`;
  - `getClaims` on a verifier client;
  - the per-request client per research R2;
  - status mapping per research R5;
  - finish after the handler;
  - set `x-ai-credits`.

  Add the new codes `unauthorized`, `forbidden` and `no_credits` to `ProviderErrorCodeSchema` in `src/ai/schema.ts`. T005 passes.
- [X] T008 Wire the Supabase env through `ServerEnv` (`src/server/assistantHandler.ts`), `src/server/node.ts`, `src/server/vercel*.ts` and the dev-server plugin in `vite.config.ts`. `scripts/build-vercel-output.mjs` is unchanged (env comes from Vercel at runtime). `npm run typecheck` exit 0. — **Done**: `ServerEnv extends AiCallEnv`; the dev-server plugin passes `SUPABASE_URL`/`SUPABASE_ANON_KEY`/`VITE_SUPABASE_*`; `node.ts` and `vercel*.ts` unchanged (they pass `process.env`). `npm run typecheck` exit 0; `npm run lint` exit 0; `npx vitest run src/server` → 61 passed; `npm test` → 159 files, 944 passed.

**Checkpoint**: the database refuses and charges correctly, and the wrapper is tested. No endpoint is wrapped yet.

---

## Phase 3: User Story 1 — Only studio members can call AI (Priority: P1) 🎯 MVP

**Goal**: all five endpoints refuse anonymous callers, non-members and viewers before any provider call.

**Independent Test**: `curl -X POST localhost:5173/api/assistant` → 401, and likewise for the other four.

### Tests first

- [X] T009 [P] [US1] Extend `src/server/assistantHandler.test.ts`, `speech.test.ts`, `liveToken.test.ts` and `vision.test.ts`: — **Done, order changed**: the wrapping (T011) was written first, so these tests were not seen failing beforehand. To compensate, a mutation check: removing the render handler's `charge` made 4 of them fail (403, 402, charge, refund); restored. Existing handler tests now build handlers with `allowAiCall()` from `src/server/testAiCall.ts` and send `AUTH_HEADERS`; the new cases are in `src/server/aiGate.test.ts` (39 cases across all five endpoints).
  - each handler built through `withAiCall` with a fake auth that rejects returns 401 for POST, and for GET on assistant, and the fake provider records **zero** calls;
  - with a fake auth plus a `charge` that throws 403, the response is 403 and the provider has zero calls.

  Update the existing tests to build handlers with an "allow" fake so they keep testing their own logic. See the new cases fail.
- [X] T010 [P] [US1] Write the API part of `e2e/ai-access.spec.ts`, using Playwright `request` with no storage state: — **Done**: `e2e/ai-access.spec.ts` "API" tests. Also covers the public anon key used as a bearer → 401. Viewer and non-member checks use `/api/live-token` (the smallest valid body); the 403 comes from the charge, before any provider. Helpers `localAccessToken`, `localRpc`, `localStudioIds`, `localPublicKey` added to `e2e/support/localAdmin.ts` (local-only guard).
  - `POST` to each of the five endpoints with no token → 401 with code `unauthorized`;
  - `GET /api/assistant` → 401;
  - a tampered token → 401;
  - the public anon key sent as the bearer token → 401 (it verifies, but is not a signed-in user);
  - signed in as `viewer.b@example.test`, using its access token from the page's session, `POST /api/assistant` with Beta's id → 403;
  - `designer.a`'s token with Beta's id → 403.

  See them fail.

### Implementation

- [X] T011 [US1] Wrap all five handlers in `withAiCall` (`src/server/assistantHandler.ts`, `speech.ts`, `liveToken.ts`, `vision.ts`). Remove the `Origin`-based checks as security (they may stay as a harmless same-origin courtesy). Key the courtesy `RateLimiter` by the verified user id instead of the IP. T009 passes; `npx vitest run src/server` green. — **Done**: all five handlers return `withAiCall(handle, { env, log, ...options.aiCall })`; the courtesy limiter is keyed by `call.userId` (a test supplies `clientKey`); the Origin check stays as a same-origin courtesy. `npx vitest run src/server` → 100 passed; `npm run typecheck` exit 0.
- [X] T012 [US1] Run `npx playwright test e2e/ai-access.spec.ts -g "API"` and record the output. T010 passes. — **Done**: `npx playwright test e2e/ai-access.spec.ts` → **6 passed** (setup + 3 API access + 2 credits). The Playwright web server sets `GEMINI_API_KEY: ''`, so no real provider can be reached.

**Checkpoint**: no anonymous, non-member or viewer call reaches a provider (SC-001 locally).

---

## Phase 4: User Story 2 — Every call is paid for from studio credits (Priority: P1)

**Goal**: paid calls charge the clarified cost before the provider; failures refund; zero credits → 402 with zero provider calls.

**Independent Test**: with a fake provider, a Free studio gets 402 and the provider records nothing; Alpha's balance drops by the op's cost.

### Tests first

- [X] T013 [P] [US2] Add charge tests to each handler test file, with a fake RPC that records `ai_start_call` and `ai_finish_call`: — **Done** (with T009, same file `aiGate.test.ts`): per-endpoint op, charge only after validation (invalid body → no RPC), `assistant_rules` when the rules answer, provider failure → `finish(false)`, 402 with zero provider calls, body injection ignored, the per-user courtesy limit.
  - **assistant:** with a paid provider it charges `assistant` **after** schema validation (an invalid body → 400 and **no** `ai_start_call`); when the rules provider answers it charges `assistant_rules`; a provider error → `ai_finish_call(ok=false)`;
  - **speech:** charges `speech`;
  - **reference:** charges `reference`;
  - **render:** charges `render`;
  - **live:** charges `live` and finishes ok when the token is issued; no refund afterwards;
  - **402:** `PT402` from `charge` → 402 `no_credits` with the contract message, and the fake provider has zero calls (SC-003).

  See them fail.
- [X] T014 [P] [US2] Add to `e2e/ai-access.spec.ts`: a brand-new user (local admin + password, gets a Free studio with 0 credits) calls `POST /api/speech` with a valid body → 402 `no_credits`. Calling `POST /api/assistant` with the local rules provider → 200 (0 credits, `assistant_rules`). See it fail. — **Done in part**: a new Free studio (0 credits) → `POST /api/speech` → 402 `no_credits`, balance still 0. The "assistant rules → 200 for a Free studio" case is **not** in e2e (it needs a full project body); it is covered by pgTAP (`assistant_rules` works for the 0-credit studio) and `aiGate.test.ts`. Also added: a designer passes the gate and, with no provider key locally, the live-token call fails 503 and is **refunded in the real database** (balance unchanged).

### Implementation

- [X] T015 [US2] Add the `charge(op)` calls at the points in research R8 in each handler. In the assistant, pick the op after `providerFor`: `rules` → `assistant_rules`, otherwise `assistant`. T013 passes; `npx vitest run src/server` green. — **Done, pulled forward into T011**: the 403 for viewers and non-members (US1) comes from `charge`, so the charge points went in with the wrapping. Ops: assistant → `assistant` or `assistant_rules`; speech → `speech`; reference → `reference`; render → `render`; live-token → `live`.
- [X] T016 [US2] Run `npx playwright test e2e/ai-access.spec.ts` and `npm run db:test:concurrency`, and record the output (SC-002, SC-003). — **Done**: `npx playwright test e2e/ai-access.spec.ts` → 6 passed; `npm run db:test:concurrency` → PASS (T006).

**Checkpoint**: credits bound every paid call; the concurrency script and pgTAP prove a balance ≥ 0.

---

## Phase 5: User Story 3 — Designers see their credits (Priority: P2), plus the browser sending credentials

**Goal**: every browser AI call carries the token and the paying studio; the panel shows "<studio> · N credits", updates after calls, and explains 402, viewers and having no studio.

**Independent Test**: signed in as `designer.a`, the assistant panel shows "Alpha Studio · 500 credits"; as a Free-studio user, a paid action shows the 402 message.

### Tests first

- [X] T017 [P] [US3] Write `src/infrastructure/ai/aiFetch.test.ts`: — **Done**: `src/infrastructure/ai/aiFetch.test.ts`, 6 cases (token + studio + caller headers kept; balance from `x-ai-credits`; nothing sent without a session, without a studio, or for a viewer; GET needs only the sign-in). Seen failing (import missing). `createAiFetch` is the testable factory; `aiFetch` wires supabase-js `getSession`.
  - it sets `Authorization` from a fake `getSession` and `x-studio-id` from the paying studio;
  - it throws `AiNotReadyError` with no session or no studio, without calling `fetch`;
  - it reads `x-ai-credits` into the paying-studio balance.
- [X] T018 [P] [US3] Write `src/features/ai/payingStudio.test.ts` and `PayingStudioSync.test.tsx`: — **Done**: `src/features/ai/payingStudio.test.ts` (8) and the `PayingStudioSync` cases in `AiCreditsBar.test.tsx` (3). Seen failing.
  - the paying studio is the `interior-studio:last-studio` slug's membership, else the only membership, else `null`;
  - switching the last studio switches the payer;
  - the balance comes from `rpc('ai_credit_balance', { p_org })`;
  - it is cleared on sign-out.
- [X] T019 [P] [US3] Add `AssistantPanel` tests in `src/features/assistant/AssistantPanel.test.tsx`: — **Done, moved**: the panel's credits line is its own component, `src/features/ai/AiCreditsBar.tsx`, tested in `AiCreditsBar.test.tsx` (6 cases: name + balance, "…" while loading, update after a paid call to 499, "1 credit", no credits, viewer, no studio). `AssistantPanel` has no unit-test file of its own; it renders the bar, and its e2e is in T020.
  - the header shows "Alpha Studio · 500 credits" ("…" while loading);
  - a viewer sees "Viewers can't use AI." with the input disabled;
  - no studio → "Open or join a studio to use AI.";
  - a `no_credits` reply shows "Your studio has no AI credits left. Contact Interior Studio to add credits.";
  - after a paid reply whose response carries `x-ai-credits: 499`, the header reads "Alpha Studio · 499 credits" (US3 scenario 3; locally only the 0-credit rules provider answers, so this is covered here rather than in e2e).
- [X] T020 [P] [US3] Add the browser part of `e2e/ai-access.spec.ts`: signed in as `designer.a`, open a project and the assistant → the header reads "Alpha Studio · 500 credits", and sending a message (rules, 0 credits) keeps 500. See it fail. — **Done**: seen failing (`ai-credits` not found).

### Implementation

- [X] T021 [US3] Implement `src/features/ai/payingStudio.ts` (a small external store with `useSyncExternalStore`; no new library) and `src/features/ai/PayingStudioSync.tsx`. Mount `PayingStudioSync` inside `SessionProvider` in `src/app/App.tsx`. T018 passes. — **Done**: `payingStudio.ts` (external store, `useSyncExternalStore`), `PayingStudioSync.tsx` (re-evaluated on every route change, so opening another studio switches the payer), mounted in `App.tsx` inside `SessionProvider`. Also `aiAccess.ts` (the three "why not" messages).
- [X] T022 [US3] Implement `src/infrastructure/ai/aiFetch.ts`, then switch the five call sites to it: — **Done**: `aiFetch.ts`; `HttpAssistantProvider`'s default fetch, `visionStore` (render, reference), `voice/synthesis.ts` and `voice/live/session.ts` default to `aiFetch` (tests that inject `fetchImpl` are unchanged). `AiNotReadyError` becomes `ProviderError('unauthorized')` in the assistant. `VoiceControls.test.tsx` now sets a paying studio, as the app does. `npm test` → 163 files, **1006** passed; `npm run typecheck` exit 0; `npm run lint` exit 0.
  - `src/ai/providers/http.ts`;
  - `src/state/visionStore.ts` (render and reference);
  - `src/voice/synthesis.ts` and `src/voice/live/session.ts` via their `fetchImpl`.

  Update those modules' tests to inject a fake `aiFetch`. T017 passes; `npm test` green.
- [X] T023 [US3] Update `src/features/assistant/AssistantPanel.tsx` per the contract's "Assistant panel" section (header, viewer, no studio, 402). T019 passes. Run `npx playwright test e2e/ai-access.spec.ts e2e/assistant.spec.ts e2e/panels.spec.ts` and record: T020 passes and the existing assistant e2e tests still pass. — **Done**: `AssistantPanel` renders `AiCreditsBar` under its header and disables the message box for viewers and people without a studio. `npx playwright test e2e/ai-access.spec.ts e2e/assistant.spec.ts e2e/panels.spec.ts` → exit 0, **11 passed**. The request carries `Authorization: Bearer …` and `x-studio-id` = Alpha, the reply is 200, and the 0-credit rules answer leaves "Alpha Studio · N credits" unchanged.

---

## Phase 6: Polish & Gate

- [X] T024 Update `specs/FOUNDATION-PLAN.md`: 045 in review (PR number). — **Done**: the plan row reads "in review 2026-11-06; production migration and firewall rule pending" (PR number added when opened).
- [X] T025 Run the five-stage gate plus the database checks and record each exit code separately (no pipes hiding exits): — **Done**: lint, typecheck, test (163 files, **1006** passed), build → exit 0; `db:reset` exit 0; `db:test` → `Files=8, Tests=495`, PASS; `npm run e2e` → exit 1, **94 passed, 1 failed**: the known flaky `e2e/package.spec.ts` 3D-capture test (FOUNDATION-PLAN "Known issues"), which passes alone (`npx playwright test e2e/package.spec.ts` → 3 passed). `db:test:concurrency` **failed the first time** in its setup ("Could not query the database for the schema cache"): it ran seconds after `db:reset`, before PostgREST reloaded. The script now waits for the API (up to 30 s); re-run straight after a fresh reset → PASS (5 charged, 5 refused, balance 0).
  - `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run e2e`;
  - `npm run db:reset && npm run db:test && npm run db:test:concurrency`.

  The known flaky 3D e2e tests (`specs/FOUNDATION-PLAN.md` "Known issues") are reported as such if they fail, with a solo re-run.
- [X] T026 Add `npm run db:test:concurrency` to the CI `db` job in `.github/workflows/ci.yml`, after `db:test`. — **Done**: `.github/workflows/ci.yml` `db` job runs `npm run db:test:concurrency` after `db:test`.
- [ ] T027 Push the branch and open a **draft** PR. Record the links for green `check`, `db` and `e2e`.
- [ ] T028 **Founder**, production database: a fresh backup of schema and data with row counts → `npx supabase db push --remote --dry-run` lists only `<ts>_ai_metered_calls.sql` and no seeds → `npx supabase db push --remote --yes`. Then the agent verifies, read-only:
  - `migration list --remote` matches;
  - `db diff --remote --schema public,private,storage` is empty;
  - the grants on the new functions are right;
  - `ai_debit` is absent;
  - the `interior-studio` balance is unchanged (490 unless a new month began).
- [ ] T029 **Founder**: add the Vercel Firewall rule per `docs/operations/ai-endpoints.md`, and report "done".
- [ ] T030 **Gate** (spec Gate, SC-001):
  1. The agent runs `curl -s -o /dev/null -w '%{http_code}' -X POST https://<preview>/api/<each>` for all five endpoints and records five `401`s.
  2. The founder signs in on the preview, opens a project and sends one assistant message with the paid provider. The panel goes from 490 to 489.
  3. The agent confirms, read-only, one `succeeded` `assistant` job and one `-1` debit row for `interior-studio`.

  Record everything in the PR.
- [ ] T031 After the merge and the production deploy, the agent runs the same five-endpoint `curl` against `https://interior-studio-two.vercel.app` and records five `401`s (SC-001 on production). The PR description is completed, and the founder merges.

---

## Dependencies & Execution Order

- **Phase 1 → Phase 2 → US1 → US2 → US3 → Polish.** US2 builds on US1's wrapped handlers; US3 needs Phase 2 only, but its e2e needs US1/US2.
- T006 needs T003 and T004 written first; T007 needs T005.
- T028 (production push) must come **before** the gate (T030), because the preview uses the production database. T029 can happen any time.
- The production deploy of the app must not run before T028: once merged, the deployed endpoints call `ai_start_call`, and without the migration every AI call would fail with 500. The founder pushes the migration before merging, as in 042.

### Analysis (2026-11-06)

- No constitution conflicts. All 12 FRs have tasks; SC-004 is a post-release measurement (Google Cloud console, a week after release), so it has no task.
- Added: body-injection test (T005) and the balance-after-paid-call test (T019).
- `scripts/test-ai-concurrency.mjs` uses the **local** service key for setup only, behind the local-URL guard. The endpoints themselves never use a secret key (FR-003).

## Parallel Examples

- Phase 2 tests: T003, T004 and T005 together.
- US1: T009 and T010 together.
- US3 tests: T017, T018, T019 and T020 together.

## Implementation Strategy

MVP = Phase 2 + US1: the endpoints are closed to strangers, which is the main money risk. Then US2 (metering), then US3 (panel and browser headers). US3's browser changes must ship in the **same PR** as US1, or the signed-in app would get 401s. So the PR is one unit, built in this order.
