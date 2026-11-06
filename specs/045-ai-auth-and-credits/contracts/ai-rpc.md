# Contract: AI metering functions (database)

All public functions are `SECURITY INVOKER` wrappers. Execute is revoked from `public` and `anon` and granted to `authenticated` only. Each calls a `private` `SECURITY DEFINER` body with `search_path = ''` and schema-qualified names. The user is always `auth.uid()`; no argument names a user.

## `public.ai_start_call(p_org uuid, p_op text) returns jsonb`

Returns `{ "job_id": uuid, "finish_token": text, "balance": int, "cost": int }`. All steps run in one transaction:

1. `auth.uid()` is null → `PT401`.
2. The caller's role in `p_org` comes from `public.org_members`. None → `PT403`; `viewer` → `PT403`.
3. `select 1 from public.organizations where id = p_org for update` serialises charges per studio.
4. Running jobs of `p_org` older than 15 minutes → status `failed`, error `timed out`, a `+cost_credits` `refund` row, and their tokens deleted.
5. `private.ensure_monthly_grant(p_org)`.
6. The cost comes from `private.ai_costs` (unknown → `22023`). The balance is `sum(delta)`; balance < cost → `PT402`, with detail `balance=<b> cost=<c>`.
7. Insert the `ai_jobs` row (`kind` from the cost table, `op`, `status = 'running'`, `cost_credits`, `provider = 'pending'`, `created_by = auth.uid()`). If cost > 0, insert the `debit` ledger row `-cost`. Insert the token.

## `public.ai_finish_call(p_job uuid, p_finish_token text, p_ok boolean, p_provider text default null, p_error text default null) returns text`

Returns the final status, `succeeded` or `failed`.

- The job must exist, be `running` and have `created_by = auth.uid()`, and the token must match. Otherwise → `PT409`, and nothing changes.
- `p_ok` → `succeeded`; `finished_at = now()`; `provider` is recorded.
- `not p_ok` → `failed`; `error = left(p_error, 500)`; if `cost_credits > 0`, a `+cost_credits` `refund` ledger row with the same `job_id`.
- The token row is deleted either way, so a second call → `PT409`.

## `public.ai_credit_balance(p_org uuid) returns int` (changed)

The behaviour is unchanged (members only; applies the monthly grant; returns `sum(delta)`). The definer body now has `search_path = ''` and qualified names.

## Removed

`public.ai_debit(uuid, int, uuid, uuid, text)`: it took a caller-supplied user and cost and is used by nothing in `src`.
