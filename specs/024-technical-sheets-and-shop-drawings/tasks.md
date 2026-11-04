# 024 Tasks — Technical MEP Sheets, Tile Calculator, Shop Drawings & Factory Part Labels

## Task List

- [x] Task 1: Dedicated MEP Service Layout Sheet Generator
  - File: `src/engine/deliverables/mepSheet.ts`
  - Implement `buildMepServiceSheet(project, config)` producing dimensioned technical sheet with MEP point symbols and schedule table.
  - Add unit tests in `src/engine/deliverables/mepSheet.test.ts`.

- [x] Task 2: Tile Layout & Quantity Calculator Engine
  - File: `src/engine/deliverables/tileSheet.ts`
  - Implement `calculateTileLayout(project, tileConfig)` calculating net dado backsplash area, tile counts, and boxes needed.
  - Add unit tests in `src/engine/deliverables/tileSheet.test.ts`.

- [x] Task 3: Module Orthographic Shop Drawing Generator
  - File: `src/engine/deliverables/shopDrawing.ts`
  - Implement `buildModuleShopDrawing(cabinet, rulePack)` generating dimensioned exploded panel views with 32mm boring coordinates.
  - Add unit tests in `src/engine/deliverables/shopDrawing.test.ts`.

- [x] Task 4: Factory Part Labels Generator (Thermal & A4)
  - File: `src/engine/deliverables/partLabels.ts`
  - Implement `generatePartLabelsSvg(parts, options)` generating thermal 100×50mm and A4 21-up printable label sheets with QR codes and edge-band maps.
  - Add unit tests in `src/engine/deliverables/partLabels.test.ts`.

- [x] Task 5: Integration into Deliverables Studio UI & Store
  - File: `src/state/deliverablesStore.ts`
  - File: `src/features/deliverables/DeliverablesView.tsx`
  - Add `'part-labels'` and `'tile-schedule'` to deliverable generation exports and navigation sheets.

- [x] Task 6: Playwright E2E Test & Verification
  - File: `e2e/technical-deliverables.spec.ts`
  - Verify MEP technical sheets, tile schedule, and part labels download in browser.
  - Run full suite: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/technical-deliverables.spec.ts`.
