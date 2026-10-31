# 002 — Tests

- Unit: right-wall unit moves with the wall; shrinking below the run is rejected; width 1000 is
  rejected by the schema (`domain/domain.test.ts`).
- Unit: room labels follow `set_room` (`rendering/selection/labels.test.ts`).
- E2E: create a 4500 mm room, check status bar and 3D label; reject width 3000 (`e2e/kitchen.spec.ts`).
