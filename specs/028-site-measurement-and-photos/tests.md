# Tests 028 — Site Measurement Capture & Wall-Tagged Photos

## Unit Test Matrix
1. `src/domain/measurement/siteCapture.test.ts`:
   - Validates valid SitePhoto with wallId, url, and optional compass heading.
   - Rejects invalid wallIds or missing image URLs.
2. `src/engine/measurement/closureSolver.test.ts`:
   - Reports `acceptable` status for orthogonal loop with $\Delta \le 10$ mm (e.g. Back 4000, Front 4005, Left 3000, Right 3002 -> $\Delta = 5.4$ mm).
   - Reports `warning` status for closure error $> 10$ mm (e.g. Back 4000, Front 4025 -> $\Delta = 25$ mm) with actionable diagnostic message.
3. `src/state/siteCaptureStore.test.ts`:
   - Adds photo tagged to specific wallId.
   - Deletes photo.
   - Updates wall measurements and computes closure.
4. `src/features/measurement/WallPhotoGallery.test.tsx`:
   - Renders photos filtered by active wall.
   - Shows empty state prompt when no photos exist for that wall.
5. `src/features/measurement/SiteCaptureModal.test.tsx`:
   - Opens modal and switches between Back, Left, Right, Front walls.
   - Updates wall measurement and recalculates closure badge.

## E2E Scenario (`e2e/site-measurement-and-photos.spec.ts`)
- Open Site Capture from TopBar.
- Enter wall dimensions with 5mm discrepancy -> Verify green "Closure error: 5mm (Acceptable)" badge.
- Enter wall dimensions with 25mm discrepancy -> Verify amber "Closure error: 25mm (Warning: Re-measure)" badge.
- Attach a photo to the Back wall -> Verify thumbnail appears under Back wall gallery.
