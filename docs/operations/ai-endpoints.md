# AI endpoints: access, credits and the firewall (spec 045)

The five AI endpoints spend the studio's provider keys: `/api/assistant`, `/api/speech`, `/api/live-token`, `/api/render` and `/api/reference`. Since spec 045, every call must come from a signed-in member of a studio who is not a viewer, and paid calls spend that studio's credits **before** the provider is called.

## Order of checks

| Step | Fails with |
| --- | --- |
| Supabase URL and key present on the server | 503 `unavailable` (fail closed) |
| `Authorization: Bearer <access token>` verified with `supabase.auth.getClaims` | 401 `unauthorized`; 503 if Auth or JWKS can't be reached |
| `x-studio-id` present and a uuid (POST) | 400 `bad_request` |
| Request body valid (size, JSON, schema) | 400/413 (no credits spent) |
| `ai_start_call(studio, op)` in the database: member? not a viewer? enough credits? | 403 `forbidden` / 402 `no_credits` |
| Provider call | the provider's error status; the job is **refunded** |

The server talks to the database as the signed-in user (RLS applies) and never uses a secret key. The in-memory per-user rate limit is a courtesy only; the firewall rule below and the credits are the controls.

## Costs (`private.ai_costs`)

| Endpoint | op | Credits |
| --- | --- | --- |
| `/api/assistant` (paid provider) | `assistant` | 1 per message |
| `/api/assistant` (built-in rules answered) | `assistant_rules` | 0 |
| `/api/speech` | `speech` | 1 per reply |
| `/api/reference` | `reference` | 3 per photo or video read |
| `/api/render` | `render` | 10 per render |
| `/api/live-token` | `live` | 5 per live voice session (up to 30 minutes), charged when issued |

To change a cost (operator, SQL editor):

```sql
update private.ai_costs set credits = 2 where op = 'reference';
```

Credits are granted per studio with `private.set_ai_credits` (`docs/operations/ai-credits.md`). Free studios get 0 a month by default.

## Reading a studio's usage (operator, SQL editor)

```sql
-- Balance
select coalesce(sum(delta), 0) from public.ai_credit_ledger l
join public.organizations o on o.id = l.org_id where o.slug = 'interior-studio';

-- Last 20 calls
select j.created_at, j.op, j.status, j.cost_credits, j.provider, j.error
from public.ai_jobs j join public.organizations o on o.id = j.org_id
where o.slug = 'interior-studio' order by j.created_at desc limit 20;
```

A job stuck in `running` for more than 15 minutes is marked failed and refunded the next time anyone in that studio calls AI.

## Vercel Firewall rule (founder, once)

1. Vercel → project **interior-studio** → **Firewall** → **Configure** → **+ New Rule**.
2. Name: `AI endpoints rate limit`.
3. **If**: *Request Path* → *Starts with* → `/api/`.
4. **Then**: **Rate Limit**. Algorithm *Fixed Window*, window **60 seconds**, limit **60 requests**, key **IP**.
5. Action when exceeded: **Deny**, for **10 minutes**.
6. **Save**, then **Review Changes** → **Publish**.

To check it: Firewall → the rule's traffic graph shows requests. A script that sends more than 60 requests a minute from one IP gets `429` from Vercel before the functions run.

## Quick checks

```sh
# Anonymous calls are refused (expect 401 for each)
for p in assistant speech live-token render reference; do
  printf '%s ' $p; curl -s -o /dev/null -w '%{http_code}\n' -X POST https://interior-studio-two.vercel.app/api/$p -H 'content-type: application/json' -d '{}'
done
```
