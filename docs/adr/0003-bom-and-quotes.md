# ADR 0003 — BOM, studio price list and client quotes

**Status:** accepted · 2026-10-25

## Decision

- **One engine, two views** (`packages/core/src/commerce/pricing.ts`). The *workshop BOM* buys what's needed: whole 2440 × 1220 sheets per board/finish (15% waste), edge banding metres from each part's banding code (+10%), worktop area in sq ft, hardware counts, catalogue products — at internal cost. The *client quote* has one line per piece (size, finish, room), boards priced by area with the same waste so each unit carries its share, labour %, installation per unit and the studio margin folded into unit prices, and GST added on the total.
- **Price list per studio** (`price_lists`, admin-write, member-read). Stored rates are merged over sample defaults and clamped (`sanitizePriceList`), so older lists keep working as new rate keys appear.
- **Saved quotes are snapshots** (`quotes`): lines without internal costs, totals, and the exact rates used; numbered `Q-YYYYMMDD-XXXX`. Re-pricing later never changes a quote already sent.
- **Margin is never printed**; the internal summary is screen-only.
- The command bar answers cost questions from the same quote (read-only).

## Consequences

- Quote totals are reproducible from (scene, rates) in tests and on the server.
- BOM sheet counts round up globally, so BOM cost ≥ the area-priced materials in the quote; the difference is the offcut risk the margin covers.
- Sheet nesting (actual cutting layouts) is a later optimisation; the waste factor stands in for it.

## Sprint 6 addendum: factory order export and style presets

- `buildOrder` (core/commerce/order.ts) produces one versioned document (`interior-studio.order/1`): units with finishes, parameters and hardware, per-board cut-list, worktop slabs with cut-outs and joints, and the BOM quantities (no prices — a workshop or ERP gets what to build, not what the studio charges). Sizes are mm. The caller passes the timestamp so the document is deterministic and testable. `orderXml` renders the same object as plain XML. Both download from the BOM and Cut-list tabs.
- `apply_style` applies shutter/carcass/worktop finishes to every manufactured unit as one undoable batch; worktops go to base cabinets only. It is also an AI tool, and the deterministic parser handles "make all the units walnut".
