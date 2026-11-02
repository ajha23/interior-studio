# Tests 027 — AI Layout Suggester, Cost-Down Advisor & Walkthrough Video Outbox Worker

## Unit Test Matrix
1. `src/engine/commercial/costDown.test.ts`:
   - Detects adjacent base units of width 300mm + 300mm and recommends 1x 600mm base unit.
   - Calculates positive integer paise savings (carcass panels + edge band + hinges).
   - Returns empty suggestions when layout is already optimized (e.g. all 600/900mm wide units).
2. `src/ai/layout/moduleSuggester.test.ts`:
   - Generates valid module placement sequence from `STANDARD_MODULES` for a given wall length.
   - Adheres to standard dimension increments and leaves room for corner or filler.
3. `src/domain/platform/walkthroughVideo.test.ts`:
   - Generates camera waypoints spanning 0s to 30s.
   - Interpolates camera height at eye-level (1500mm).
   - Validates job structure, timestamp formatting, and progress calculation.
4. `src/state/walkthroughStore.test.ts`:
   - Transitions job status: idle -> queued -> rendering -> ready.
   - Allows downloading completed video payload.
5. `src/features/commercial/CostDownCard.test.tsx`:
   - Renders suggestions with formatted ₹ savings.
   - Triggers `onApply` callback when "Apply Optimization" is clicked.
6. `src/features/deliverables/WalkthroughVideoModal.test.tsx`:
   - Opens modal, shows resolution/duration presets (30s 1080p).
   - Starts render, updates progress bar, displays Download button upon completion.

## E2E Scenario (`e2e/ai-layout-and-video-walkthrough.spec.ts`)
- Navigate to kitchen editor with sample layout.
- Open Client Presentation Portal.
- Review Cost-Down suggestions displaying estimated ₹ savings.
- Trigger "30s 1080p Walkthrough Video" render.
- Check rendering progress animation completes to "Ready".
- Click Download Walkthrough Video.

