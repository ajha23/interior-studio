# Data Model: 045 — Signed-in, Credit-Metered AI Endpoints

## Existing (kept)

| Table | Used for | Change |
| --- | --- | --- |
| `public.ai_credit_ledger` (`org_id`, `delta`, `reason` ∈ monthly_grant/topup/debit/refund, `period`, `job_id`, `note`, `created_by`) | balance = `sum(delta)` per studio | none. Debits are `-cost` with `reason = 'debit'`; refunds `+cost` with `reason = 'refund'`, same `job_id` |
| `public.ai_jobs` (`org_id`, `kind`, `op`, `status` ∈ running/succeeded/failed, `provider`, `cost_credits`, `error`, `created_by`, `created_at`, `finished_at`) | one row per call | `kind` check gains `audio`, `live` (now `image, model, command, audio, live`) |
| `public.ai_settings` (`org_id`, `monthly_credits`) | the monthly grant (042) | none |

RLS stays as is: members read their studio's jobs and ledger; nobody inserts or updates them through the API (042 dropped the top-up policy). All writes go through the private functions.

## New (private schema, not exposed through the API)

### `private.ai_costs`

| Column | Type | Rule |
| --- | --- | --- |
| `op` | text, primary key | one of: `assistant`, `assistant_rules`, `speech`, `reference`, `render`, `live` |
| `kind` | text | written to `ai_jobs.kind`: `command`, `command`, `audio`, `image`, `image`, `live` |
| `credits` | int, `>= 0` | 1, 0, 1, 3, 10, 5 (clarification 1) |

### `private.ai_call_tokens`

| Column | Type | Rule |
| --- | --- | --- |
| `job_id` | uuid, primary key, references `ai_jobs(id)` on delete cascade | one per running job |
| `token` | text, not null | `encode(extensions.gen_random_bytes(24), 'hex')`; returned once by `ai_start_call`; deleted when the job finishes |

## Job lifecycle

```text
ai_start_call ──▶ running ──ai_finish_call(ok)────▶ succeeded
                     │    └─ai_finish_call(!ok)───▶ failed + refund (+cost)
                     └─ older than 15 min, seen by the next ai_start_call for that studio ─▶ failed + refund
```

- A 0-credit op (`assistant_rules`) writes a job and no ledger rows.
- `live` jobs are finished as succeeded when the token is issued. No refund after issue.

## Errors (SQLSTATE → HTTP)

| SQLSTATE | Meaning | HTTP |
| --- | --- | --- |
| `PT401` | no `auth.uid()` | 401 |
| `PT403` | not a member of `p_org`, or a viewer | 403 |
| `PT402` | balance < cost (detail: balance and cost) | 402 |
| `22023` | unknown op | 500 (a server bug, never a user input) |
| `PT409` | finish: wrong token, other user, or already finished | 409 (logged; the response to the user is unaffected) |

## Browser state (`src/features/ai/payingStudio.ts`)

| Field | Source |
| --- | --- |
| `orgId`, `name` | from the session memberships: the studio in `interior-studio:last-studio`, else the only studio; `null` if none |
| `balance` | `ai_credit_balance(orgId)` on change, then the `x-ai-credits` header after each paid call; `null` while unknown |

Cleared on sign-out together with the session (042).
