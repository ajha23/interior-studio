# Contract: AI endpoints (HTTP)

Applies to `/api/assistant`, `/api/speech`, `/api/live-token`, `/api/render` and `/api/reference`, both on Vercel and on the Vite dev server.

## Request headers

| Header | Required | Rule |
| --- | --- | --- |
| `Authorization` | always, including `GET /api/assistant` | `Bearer <Supabase access token>` |
| `x-studio-id` | on every `POST` | the paying studio's `organizations.id` (uuid). The body never carries the user, the studio or the cost; if it does, they are ignored |

## Order of checks

1. **Method.** Wrong method → 405.
2. **Token.** Missing, empty, malformed, expired or wrongly signed → **401** `unauthorized`. JWKS or Auth unreachable → **503** `unavailable`.
3. **Studio.** `x-studio-id` missing or not a uuid → **400** `bad_request`.
4. **The handler's own checks**: courtesy rate limit (keyed by user id) → 429; size → 413; JSON and schema → 400. None of these costs credits.
5. **`charge(op)`.** Not a member → **403** `forbidden`; viewer → **403** `forbidden`; not enough credits → **402** `no_credits`. The provider is not called in any of these cases.
6. **Provider call.** Success → 2xx with header `x-ai-credits: <balance after the charge>`. Provider failure → the existing error status, and the job is refunded.

Missing `SUPABASE_URL`/`SUPABASE_ANON_KEY` (and `VITE_` fallbacks) on the server → **503** `unavailable` before anything else. Fail closed.

## Error body (existing shape, new codes)

```json
{ "ok": false, "error": { "code": "unauthorized" | "forbidden" | "no_credits" | …existing, "message": "…", "retryable": false } }
```

| Status | code | message |
| --- | --- | --- |
| 401 | `unauthorized` | "Sign in to use AI." |
| 403 | `forbidden` (not a member) | "You are not a member of this studio." |
| 403 | `forbidden` (viewer) | "Viewers can't use AI. Ask a studio owner for designer access." |
| 402 | `no_credits` | "Your studio has no AI credits left. Contact Interior Studio to add credits." |
| 503 | `unavailable` | "AI is not available right now. Try again shortly." |

## Costs (from `private.ai_costs`)

| Endpoint | op | credits |
| --- | --- | --- |
| `POST /api/assistant` (paid provider) | `assistant` | 1 |
| `POST /api/assistant` (built-in rules answered) | `assistant_rules` | 0 |
| `POST /api/speech` | `speech` | 1 |
| `POST /api/reference` | `reference` | 3 |
| `POST /api/render` | `render` | 10 |
| `POST /api/live-token` | `live` | 5 |

## Browser helper

```ts
aiFetch(path: '/api/…', init?: RequestInit): Promise<Response>
// adds Authorization (from supabase.auth.getSession) and x-studio-id (the paying studio),
// reads x-ai-credits into the paying-studio balance, and throws AiNotReadyError
// (no session, or no studio) without sending anything.
```

## Assistant panel

- **Header:** "<studio name> · <N> credits". "…" while loading; hidden for viewers, who see "Viewers can't use AI."
- **On 402:** the message above, and the input stays usable for a retry once credits are added.
- **With no studio:** "Open or join a studio to use AI." Nothing is sent.
