# Granting AI credits (operator guide)

Spec 042, FR-019–FR-021. Studios cannot change their own AI credits. Only the operator (the founder)
grants them, per studio, from the Supabase SQL editor.

## Defaults

- **Free studios** (every self-serve studio created at first sign-in): **0** AI credits a month.
- **In-house and other plans** with no setting of their own: 500 a month (the original behaviour).
- The monthly grant tops a studio's balance up to its allowance once per calendar month (India time),
  the first time AI credits are checked that month.

## Find the studio

Supabase dashboard → SQL editor (it runs as the database owner):

```sql
select slug, name, plan, last_active_at from public.organizations order by created_at desc limit 20;
```

## Give a studio a monthly allowance

```sql
-- 200 credits a month from next month's grant onwards:
select private.set_ai_credits('solo-s-studio-ab12cd', 200);
```

## Give credits now (one-off top-up)

```sql
-- Keep the allowance at 0 but add 100 credits today:
select private.set_ai_credits('solo-s-studio-ab12cd', 0, 100, 'Trial for the Sharma project');
```

Arguments: `p_studio_slug`, `p_monthly_credits` (0–100000), `p_top_up` (0–100000, default 0),
`p_note` (shown in the ledger). An unknown slug or an out-of-range number is refused with a message.

## Check a balance

```sql
select o.slug, coalesce(sum(l.delta), 0) as balance
from public.organizations o left join public.ai_credit_ledger l on l.org_id = o.id
where o.slug = 'solo-s-studio-ab12cd'
group by o.slug;
```

## Take credits away

Set the allowance to 0. Credits already granted stay until they are spent; to remove them, add a
negative ledger row in the SQL editor (`reason = 'debit'`, with a note), which only the operator can do.
