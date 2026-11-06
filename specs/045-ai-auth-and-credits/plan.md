# Implementation Plan: 045 — Signed-in, Credit-Metered AI Endpoints

**Branch**: `045-ai-auth-and-credits` | **Date**: 2026-11-06 | **Spec**: [spec.md](spec.md)
**Input**: Feature specification from `specs/045-ai-auth-and-credits/spec.md`

## Summary

Close the five open AI endpoints and make every paid call spend studio credits first.

- **One wrapper** in `src/server` does the following:
  - verifies the bearer token with `supabase.auth.getClaims`;
  - builds a per-request supabase-js client carrying that token;
  - gives the handler a `charge(op)` that calls one database function;
  - finishes or refunds the job after the handler returns.
- **In the database**, a public invoker RPC `ai_start_call` calls a private definer function. In one locked transaction it checks membership and role, refunds stale jobs, applies the monthly grant, checks the balance against the cost table, debits, records the job and returns a server-only finish token. `ai_finish_call` marks the job done, or failed and refunded.
- **In the browser**, every AI call goes through `aiFetch`, which adds the token and the paying studio. The assistant panel shows "Studio · N credits" and explains a 402.
- **Cleanup**: the old `ai_debit` is dropped, and `ai_credit_balance` gets `search_path = ''`.
- **Founder**: adds a Vercel Firewall rule.

## Technical Context

**Language/Version**: TypeScript 5 (strict), Node 22 functions (Vercel Build Output API), PL/pgSQL on Postgres 17
**Primary Dependencies**: `@supabase/supabase-js@2.118.0` (existing) and zod (existing). **No new package**
**Storage**: existing `ai_jobs`, `ai_credit_ledger`, `ai_settings`. New: `private.ai_costs` and `private.ai_call_tokens`, not exposed through the API
**Testing**:
- pgTAP `supabase/tests/07_ai_metering.test.sql`;
- a concurrency script against the local stack (`scripts/test-ai-concurrency.mjs`, CI `db` job);
- Vitest for the wrapper and handlers, with a fake provider and a fake RPC;
- Playwright for the 401/403/402 paths and the panel balance
**Target Platform**: Vercel Node functions plus the browser SPA; Supabase (local and live)
**Project Type**: web app (single Vite project, functions in `src/server`)
**Performance Goals**: auth plus charge adds ≤ 150 ms per call (JWKS cached by supabase-js; one RPC)
**Constraints**:
- fail closed: no token → 401, JWKS or Auth unreachable → 503, missing Supabase env → 503;
- costs from the database only;
- the balance never goes negative;
- no service or secret key in these endpoints
**Scale/Scope**:
- 1 migration;
- about 6 server files changed plus 1 new wrapper;
- 1 new browser helper plus 5 call sites;
- the assistant panel;
- 2 docs

## Constitution Check

*GATE: must pass before Phase 0 research; re-checked after Phase 1 design.*

| Principle | Check | Result |
| --- | --- | --- |
| XI — the database is the security boundary | Membership, role, balance and debit are decided in `private.ai_start_call` using `auth.uid()`; the browser and the wrapper only pass the studio id and op. Definer bodies use `search_path = ''` and qualified names. Execute is revoked from `public` and `anon` and granted to `authenticated` only on the public invoker wrappers. Refunds need a token only the server holds (R3) | ✅ |
| XII — official clients, no hand-written security code | `supabase.auth.getClaims` for verification; supabase-js for every database call; `extensions.gen_random_bytes` for the token. No `jose`, no JWT parsing, no HMAC. No new package, no new server | ✅ |
| No default ids | The paying studio comes from the user's memberships; none hard-coded | ✅ |
| Evidence-based Done | Gate: anonymous `curl` → 401 on production; signed in, the assistant works and the credits drop. CI runs pgTAP and the concurrency script | ✅ |
| SaaS section (X) | Present; §6 "not applicable" with a reason; §8 tests mapped to tasks | ✅ |
| Branches ≤ 3 days | 3-day estimate | ✅ |

Post-design re-check (after `research.md`, `data-model.md` and `contracts/`): all ✅. The one design risk, a user refunding their own in-flight job, is closed by R3.

## Project Structure

### Documentation (this feature)

```text
specs/045-ai-auth-and-credits/
├── spec.md · plan.md · research.md · data-model.md · quickstart.md
└── contracts/
    ├── ai-endpoints.md     # HTTP: headers, statuses, bodies, x-ai-credits
    └── ai-rpc.md           # ai_start_call / ai_finish_call / ai_credit_balance
```

### Source Code (repository root)

```text
supabase/migrations/<ts>_ai_metered_calls.sql   # costs, tokens, kinds, start/finish, drop ai_debit, fix ai_credit_balance
supabase/tests/07_ai_metering.test.sql          # pgTAP (grants, roles, 402, debit, refund, token, stale jobs)
scripts/test-ai-concurrency.mjs                 # 10 parallel starts, credit for 5 (local only)

src/server/aiCall.ts            # NEW wrapper: getClaims → per-request client → charge(op) → finish/refund
src/server/assistantHandler.ts  # wrapped; charge after validation; rules → assistant_rules
src/server/speech.ts · liveToken.ts · vision.ts   # wrapped; charge after validation
src/server/node.ts · vercel*.ts # pass Supabase env; unchanged otherwise
src/ai/schema.ts                # error codes: unauthorized, forbidden, no_credits

src/infrastructure/ai/aiFetch.ts      # NEW: token + x-studio-id; AiNotReadyError
src/features/ai/payingStudio.ts       # NEW: paying studio + balance (tiny external store)
src/features/ai/PayingStudioSync.tsx  # NEW: sets it from memberships + last studio
src/ai/providers/http.ts · src/state/visionStore.ts · src/voice/synthesis.ts · src/voice/live/session.ts  # use aiFetch
<assistant panel component>           # "Studio · N credits", 402 message

e2e/ai-access.spec.ts           # NEW: anonymous 401, viewer 403, Free studio 402, panel balance
docs/operations/ai-endpoints.md # NEW: firewall rule steps, costs, how to read jobs
```

**Structure Decision**:
- the server wrapper sits next to the handlers in `src/server` (FR-012);
- the browser helper is under `src/infrastructure` (talks to Supabase and the network);
- the paying-studio state is under `src/features/ai`;
- `src/domain` and `src/engine` are untouched.

## Complexity Tracking

No constitution violations. One deliberate addition: `private.ai_call_tokens`, which exists only to stop self-refunds (R3).
