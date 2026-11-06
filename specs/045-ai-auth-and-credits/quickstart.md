# Quickstart: 045 — Signed-in, Credit-Metered AI Endpoints

## Locally

```sh
npm run db:start && npm run db:reset && npm run db:test   # includes 07_ai_metering
node scripts/test-ai-concurrency.mjs                       # 10 parallel starts, credit for 5 → 5 ok, 5 PT402, balance 0
npm run dev
```

1. Anonymous calls get **401**:
   - `curl -s -X POST localhost:5173/api/assistant -H 'content-type: application/json' -d '{}'`
   - `GET /api/assistant` without a token behaves the same way.
2. Sign in as `designer.a@example.test` (local password form). Open a project and ask the assistant something. The panel shows "Alpha Studio · 500 credits". Locally the rules provider answers, which costs 0, so the number stays.
3. As `viewer.b@example.test`: the panel says "Viewers can't use AI." Calling the endpoint directly → **403**.
4. As a new user, whose studio is Free with 0 credits: any paid call → **402**, "Your studio has no AI credits left…".

## Automated

```sh
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

- Vitest: the wrapper (401/503/400 paths; `charge` → 403/402 mapping; refund on provider failure; no charge on 400) and each handler with a fake provider and a fake RPC.
- Playwright `e2e/ai-access.spec.ts`: anonymous 401 on all five endpoints, viewer 403, Free studio 402, and the panel's studio name and balance.

## Production (founder, after merge)

1. Back up, then run a dry run (`npx supabase db push --remote --dry-run` shows only the new migration).
2. `npx supabase db push --remote --yes`.
3. The agent checks, read-only, that the migration list matches, the diff is empty, the grants are right and `ai_debit` is gone.
4. Add the Vercel Firewall rule described in `docs/operations/ai-endpoints.md` (60 requests per minute per IP on `/api/*`, then a 10-minute block).

## Gate

- From a terminal, `curl -X POST https://interior-studio-two.vercel.app/api/assistant` returns **401**, and so do the other four endpoints.
- Signed in on the preview as the founder, the assistant answers and "Interior Studio · 490 credits" drops by 1 for a paid assistant message.

Record the curl output, the preview URL and the before and after balance in the PR.
