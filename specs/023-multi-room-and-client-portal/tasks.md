# 023 Tasks — Multi-Room Packs, Wardrobe Parametric Modules & Client Presentation Portal

## Task List

- [x] Task 1: Domain Module Definitions for Wardrobes, Vanity, and Loose Furniture
  - File: `src/domain/manufacturing/moduleDefinition.ts`
  - Add `'wardrobe-hinged'`, `'wardrobe-sliding'`, `'vanity-bwp'`, `'loose-table'` to `ModuleKindSchema`.
  - Add factory seed definitions `WARDROBE_2DOOR_SEED`, `VANITY_BWP_SEED`, and `DINING_TABLE_SEED`.

- [x] Task 2: Pure Explode Logic Extension for Wardrobes and Loose Furniture
  - File: `src/engine/manufacturing/explode.ts`
  - Update `explodeCabinet` to handle wardrobe tall carcass with hanging rail, internal drawers, vanity cutout, and loose table parts (top, legs, aprons).
  - Add unit tests in `src/engine/manufacturing/explode.test.ts`.

- [x] Task 3: Quote Revision Diffing Engine
  - File: `src/engine/commercial/quoteDiff.ts`
  - Implement `diffQuotes(quoteA, quoteB)` calculating added, removed, and modified items with integer paise deltas.
  - Add unit tests in `src/engine/commercial/quoteDiff.test.ts`.

- [x] Task 4: Client Sign-Off Schema & Platform Audit
  - File: `src/domain/platform/signOff.ts`
  - Create `ClientSignOffSchema` and signature validation helper.
  - Add unit tests in `src/domain/platform/signOff.test.ts`.

- [x] Task 5: Client Presentation Portal UI & Action Bar
  - File: `src/features/deliverables/PresentationPortalModal.tsx`
  - File: `src/features/deliverables/DeliverablesView.tsx`
  - Add "Client Presentation" button opening locked client presentation view with digital sign-off and quote diffing.
  - Add test in `src/features/deliverables/PresentationPortalModal.test.tsx`.

- [x] Task 6: Playwright E2E Test & Verification
  - File: `e2e/client-portal.spec.ts`
  - Verify client presentation modal opens, shows locked presentation mode, allows digital quote acceptance, and stores sign-off status.
  - Run full suite: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/client-portal.spec.ts`.
