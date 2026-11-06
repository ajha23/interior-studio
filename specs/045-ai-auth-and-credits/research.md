# Research: 045 — Signed-in, Credit-Metered AI Endpoints

Checked on 2026-11-06 against the local stack (CLI 3.0.0, `@supabase/supabase-js@2.118.0`), the repo at `bda5761`, and the live project (read-only).

## R1. Token verification: `supabase.auth.getClaims`, no hand-written JWT code

- **Decision**: verify the bearer token with `createClient(url, anonKey).auth.getClaims(token)` inside the function. No `jose`, no new package.
- **Evidence**:
  - locally, a valid access token returned `sub` and `role=authenticated`;
  - the same token with its signature altered → `AuthInvalidJwtError: Invalid JWT signature`;
  - local tokens are ES256, and the **live project's JWKS also publishes an ES256 key** (`/auth/v1/.well-known/jwks.json`), so `getClaims` verifies locally against cached public keys. For a legacy HS256 token it falls back to asking Auth (`getUser`), which is still verification by Supabase.
- **Gotcha**: `getClaims('')` returns `data: null` **without an error**. The wrapper treats "no claims" as 401, not just "error".
- **Fail closed**: an error that is not an invalid-JWT error (JWKS or Auth unreachable) → 503, never "skip verification" (spec edge case).

## R2. Per-request client, user's token, no secret key

- **Decision**: after verification, `createClient(url, anonKey, { global: { headers: { Authorization: 'Bearer <token>' } }, auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })`. Every RPC runs as that user under RLS.
- **Evidence**: such a client called `ai_credit_balance` for Alpha as `designer.a` and got `500`.
- **Env**: `SUPABASE_URL`/`SUPABASE_ANON_KEY`, falling back to `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY`. Vercel exposes project env vars to functions at runtime, and both are already set for Production and Preview (042 T040). Missing → 503 "AI is not configured", fail closed. No service or secret key is read anywhere in `src/server`.

## R3. Who can refund? A finish token only the server sees

- **Problem**: any function callable with the user's token is also callable by that user from the browser. A plain `ai_finish(job, ok=false)` would let a user refund a job while our server is still waiting on the provider, and get AI for free.
- **Decision**: `ai_start_call` returns a random **finish token** together with the job id. It is stored in `private.ai_call_tokens`, a private table that is not exposed through the API. The server never sends it to the browser. `ai_finish_call(job, token, ok)` needs it.
  - A user who calls `ai_start_call` directly gets a token, but for a job that no provider ever served, so refunding it only returns their own debit.
  - They can't obtain the token of a job the server started.
- **Generation**: `extensions.gen_random_bytes(24)` hex-encoded, as `share_links.token` already does. Nothing is hand-rolled.
- **Alternatives**: a service key for refunds (rejected, FR-003); no refunds (rejected, FR-008); refunds only by a scheduled job (rejected, slow, and needs `pg_cron`).

## R4. One transaction per charge, serialised per studio

- **Decision**: `private.ai_start_call` does the following in one statement's transaction:
  1. `select … from public.organizations where id = p_org for update` (the lock the old `ai_debit` used);
  2. refund that studio's stale `running` jobs older than 15 minutes (spec edge case "provider times out", done "on next call" with no cron);
  3. `private.ensure_monthly_grant`;
  4. read the balance (`sum(delta)`);
  5. compare with the cost from `private.ai_costs`;
  6. insert the `ai_jobs` row, the `debit` ledger row and the finish token.
- **Why the row lock**: concurrent calls for the same studio queue on it, so the balance read is always current and never goes negative (SC-002). Different studios don't block each other.
- **Concurrency test**: pgTAP runs in one transaction and can't open independent connections, so the 10-concurrent test is a node script against the local stack (`scripts/test-ai-concurrency.mjs`, CI `db` job): 10 parallel `ai_start_call`s with credit for 5 → exactly 5 jobs, 5 `PT402`, balance 0.

## R5. Error mapping through SQLSTATE

- **Decision**: the private functions raise custom SQLSTATEs:
  - `PT401` not signed in;
  - `PT403` not a member, or a viewer;
  - `PT402` not enough credits;
  - `22023` unknown operation;
  - `PT409` job already finished or wrong token.

  supabase-js returns them as `error.code`, and the wrapper maps them to HTTP 401/403/402/500/409. PostgREST also maps `PTxyz` to HTTP `xyz` for direct callers.
- **Messages** (contract):
  - 402: "Your studio has no AI credits left. Contact Interior Studio to add credits." (042: only the operator grants credits);
  - 403 viewer: "Viewers can't use AI. Ask a studio owner for designer access.".

## R6. Costs live in the database

- **Decision**: `private.ai_costs (op text primary key, kind text, credits int ≥ 0)`, seeded with the clarified costs:

  | op | kind | credits |
  | --- | --- | --- |
  | assistant | command | 1 |
  | speech | audio | 1 |
  | reference | image | 3 |
  | render | image | 10 |
  | live | live | 5 |
  | assistant_rules | command | 0 |

- **Rationale**: one place (FR-007), changeable by a migration or by the operator in SQL, never in the request. The server passes only the op name.
- **`assistant_rules`**: when no paid provider answers (no key configured, or the user picked the built-in rules), nothing is spent. The call still needs a signed-in, non-viewer member and is recorded as a 0-credit job.
- **`ai_jobs.kind`** gains `audio` and `live` (it has `image`, `model`, `command` since `20261024190725_ai_commands.sql`).

## R7. Replace `ai_debit`; fix `ai_credit_balance`

- `public.ai_debit(p_org, p_cost, p_job, p_user, p_note)` takes a caller-supplied user and cost, is granted to `service_role`, and is called by nothing in `src`. **Dropped.**
- `public.ai_credit_balance` is `security definer` with `search_path = public, private`. It is recreated with `search_path = ''` and schema-qualified names. Execute stays `authenticated` only, and the "not a member → error" check is kept.
- Spec 046 later does the general invoker/definer split; 045 makes its own functions compliant now: public invoker wrappers → private definer bodies.

## R8. Where the charge happens in each handler

The wrapper authenticates first, for every method including `GET /api/assistant` (provider status). Each handler then calls `call.charge(op)` only **after** validating its request, so a 400 never costs credits. After the handler returns, the wrapper finishes the job: a 2xx response → succeeded; a 4xx/5xx from the provider path → failed and refunded.

| Endpoint | Charged after | op |
| --- | --- | --- |
| `POST /api/assistant` | schema validation and provider selection | `assistant`, or `assistant_rules` when the rules provider answers |
| `POST /api/speech` | validation | `speech` |
| `POST /api/reference` | validation | `reference` |
| `POST /api/render` | validation | `render` |
| `POST /api/live-token` | validation; token issued once | `live` (no refund once the token is issued) |

Responses are buffered (`node.ts` reads `arrayBuffer`), so "streaming" doesn't arise. The balance after the charge goes back in an `x-ai-credits` header so the panel updates without another call.

## R9. Browser side

- One `aiFetch(path, init)` in `src/infrastructure/ai/aiFetch.ts`:
  - takes the access token from `supabase.auth.getSession()`, which refreshes it if needed;
  - takes the paying studio from `src/features/ai/payingStudio.ts`;
  - sets `Authorization` and `x-studio-id`;
  - with no session or no studio, it throws `AiNotReadyError` and sends nothing.
- The paying studio is set by a small `PayingStudioSync` component inside `SessionProvider`: the studio last opened in the shell (`interior-studio:last-studio`), or the only one (clarification 2). It also loads `ai_credit_balance` for the panel.
- Call sites (5): `HttpAssistantProvider` (`src/ai/providers/http.ts`, used by `assistantStore`), `visionStore` (render, reference), `voice/synthesis.ts` (speech), `voice/live/session.ts` (live-token). The voice modules already take a `fetchImpl`, so they get `aiFetch` injected.
- `ProviderErrorCodeSchema` gains `unauthorized`, `forbidden` and `no_credits`, so the existing error UI can show the new messages.

## R10. The rate limiter and the firewall

- The in-memory `RateLimiter` stays as a courtesy limit, now keyed by user id instead of IP (FR-009).
- The founder adds a Vercel Firewall rule: `/api/*`, 60 requests per minute per IP, then a 10-minute block. Steps go in `docs/operations/ai-endpoints.md`. Agents don't change firewall settings.

## R11. Local development and e2e

- The dev server (`vite.config.ts`) mounts the same handlers. It gets `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from the local `.env`, so local AI also requires sign-in.
- The seed grants Alpha and Beta 500 credits this month. E2E signs in as `designer.a` (Alpha only), so Alpha pays.
- `e2e/assistant.spec.ts` uses the rules provider locally (no keys) → `assistant_rules`, 0 credits.
- New e2e: an anonymous `request.post('/api/assistant')` → 401; a viewer → 403; a Free studio (0 credits) → 402 for a paid op, using the stranger's own Free studio. Locally only the rules provider is available, so paid-path coverage comes from unit tests with a fake provider, plus pgTAP.

## R12. Live state (read-only)

`interior-studio` (in-house) has no `ai_settings` row, so the grant falls back to 500 a month. Its balance is **490**, with 16 jobs from the earlier editor (`command`, `image`, `model`) and the last one on 2026-10-27. There are no other studios yet. After the push, the gate's "credit count drops" will show 490 → 489 for one assistant message, unless a new month's grant arrives first.
