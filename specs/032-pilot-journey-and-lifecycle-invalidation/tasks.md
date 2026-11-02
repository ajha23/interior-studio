# Tasks 032: End-to-End Pilot Journey, Lifecycle Invalidation & Cut-List Part Traceability

## Task List

- [x] Task 1: Project Lifecycle State Machine & Invalidation Evaluator (`UX-07`)
  - File: `src/domain/project/lifecycle.ts`
  - Implement `ProjectLifecycleStateSchema`, `evaluateLifecycleInvalidation()`, and tests in `src/domain/project/lifecycle.test.ts`.

- [x] Task 2: 100% Part-to-Module Lineage Traceability in Manufacturing Explode (`MFG-01`)
  - File: `src/engine/manufacturing/explode.ts`
  - Verify and populate complete module lineage (`moduleId`, `moduleType`, `moduleDefinitionVersion`, `rulePackId`, `rulePackVersion`, `generationAlgorithmVersion`) on every single part.
  - Unit tests: `src/engine/manufacturing/explodeTraceability.test.ts`.

- [x] Task 3: Versioned Rate Card Schema & Pricing Snapshotting (`COST-01`)
  - File: `src/domain/commercial/rateCard.ts`
  - File: `src/engine/commercial/gst.ts`
  - Add versioned `DEFAULT_RATE_CARD_V1` and snapshot rate card id/version into `QuotationCalculation`.
  - Unit tests: `src/domain/commercial/rateCard.test.ts`.

- [x] Task 4: UI Invalidation Banners in Deliverables & Presentation Views
  - File: `src/features/deliverables/DeliverablesView.tsx`
  - File: `src/features/deliverables/PresentationPortal.tsx`
  - Display invalidation warning when active revision differs from approved revision.

- [x] Task 5: Vertical-Slice End-to-End Pilot Journey Playwright E2E Test (`PRD-13.3`)
  - File: `e2e/pilot-journey-vertical-slice.spec.ts`
  - Full 12-step pilot workflow from site capture to factory-validated immutable production package.

- [x] Task 6: Definition of Done Check & Documentation
  - Run `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/pilot-journey-vertical-slice.spec.ts`.
  - Update `docs/ACCEPTANCE_TESTS.md`.
