# 028 Tasks — Site Measurement Capture & Wall-Tagged Photos

## Task List

- [x] Task 1: Domain Models & Zod Schemas (`MT-01`, `MT-03`)
  - File: `src/domain/measurement/siteCapture.ts`
  - Define `SitePhotoSchema`, `WallMeasurementSchema`, and types.
  - Unit tests: `src/domain/measurement/siteCapture.test.ts`.

- [x] Task 2: Room Closure Solver (`MT-04`)
  - File: `src/engine/measurement/closureSolver.ts`
  - Implement loop closure calculation ($\le 10$ mm pass, $> 10$ mm warning).
  - Unit tests: `src/engine/measurement/closureSolver.test.ts`.

- [x] Task 3: Site Capture Zustand Store (`MT-03`, `MT-05`)
  - File: `src/state/siteCaptureStore.ts`
  - Manage photos per wall, measurements, and modal state.
  - Unit tests: `src/state/siteCaptureStore.test.ts`.

- [x] Task 4: Wall Photo Gallery Component (`MT-03`)
  - File: `src/features/measurement/WallPhotoGallery.tsx`
  - Render wall-filtered photos, add photo action, and thumbnail previews.
  - Unit tests: `src/features/measurement/WallPhotoGallery.test.tsx`.

- [x] Task 5: Mobile-Responsive Site Capture Wizard (`MT-04`, `MT-05`)
  - File: `src/features/measurement/SiteCaptureModal.tsx`
  - TopBar launcher in `src/components/layout/TopBar.tsx`.
  - Responsive down to 360px viewport.
  - Live closure error badge with real-time feedback.
  - Unit tests: `src/features/measurement/SiteCaptureModal.test.tsx`.

- [x] Task 6: Playwright E2E Test & DoD Verification
  - File: `e2e/site-measurement-and-photos.spec.ts`
  - Verify: Open Site Capture modal -> Enter wall measurements -> Verify ±10mm closure diagnostic -> Attach photo to 'back' wall -> Verify thumbnail appears.
  - Full DoD check: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/site-measurement-and-photos.spec.ts`.

