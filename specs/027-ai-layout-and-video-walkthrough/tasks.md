# 027 Tasks — AI Layout Suggester, Cost-Down Advisor & Walkthrough Video Outbox Worker

## Task List

- [x] Task 1: Cost-Down Optimization Engine (`AI-03`, `CP-05`)
  - File: `src/engine/commercial/costDown.ts`
  - Detect adjacent pairs of narrow cabinets (e.g., 2x 300mm or 2x 450mm) that can be merged into a single wide unit (600mm or 900mm).
  - Calculate exact material, hardware, and edge-banding cost savings in integer paise.
  - Unit tests: `src/engine/commercial/costDown.test.ts`.

- [x] Task 2: Standard Module Catalog Layout Suggester (`AI-01`)
  - File: `src/ai/layout/moduleSuggester.ts`
  - Map high-level room intent (e.g., "straight kitchen", "L-shape", "wardrobe wall") into valid sequences of `STANDARD_MODULES`.
  - Validate against standard widths (300, 450, 600, 900, 1200mm) and snap to wall constraints.
  - Unit tests: `src/ai/layout/moduleSuggester.test.ts`.

- [x] Task 3: Walkthrough Video Path & Job Engine (`PR-04`)
  - File: `src/domain/platform/walkthroughVideo.ts`
  - Generate smooth 30-second camera waypoints through the room interior.
  - Job simulation transitions with progress calculation.
  - Unit tests: `src/domain/platform/walkthroughVideo.test.ts`.

- [x] Task 4: Walkthrough Video State Store (`PR-04`)
  - File: `src/state/walkthroughStore.ts`
  - Manage active rendering jobs, progress updates, and simulated async render pipeline.
  - Unit tests: `src/state/walkthroughStore.test.ts`.

- [x] Task 5: UI Integration — Cost-Down Card & Video Walkthrough Modal
  - File: `src/features/commercial/CostDownCard.tsx`
  - File: `src/features/deliverables/WalkthroughVideoModal.tsx`
  - Integrate Cost-Down Card in Presentation Portal / Quotation.
  - Integrate Video Walkthrough trigger button in `PresentationPortal.tsx`.
  - Unit tests: `src/features/commercial/CostDownCard.test.tsx`, `src/features/deliverables/WalkthroughVideoModal.test.tsx`.

- [x] Task 6: Playwright E2E Test & DoD Verification
  - File: `e2e/ai-layout-and-video-walkthrough.spec.ts`
  - Verify: Open presentation portal -> View Cost-Down recommendations and apply savings -> Trigger 30s 1080p video render -> Observe progress bar reach 100% (ready) -> Download video asset.
  - Full DoD check: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/ai-layout-and-video-walkthrough.spec.ts`.

