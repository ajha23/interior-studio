# 022 — Tests

## Unit Tests
- `src/engine/checks/mepChecks.test.ts`:
  - Detects electrical socket within 300mm of sink / water outlet.
  - Passes when electrical socket is at 450mm safe distance.
  - Verifies sink contains water and drain points.
  - Detects misaligned chimney exhaust duct.
- `src/engine/deliverables/dxf.test.ts`:
  - Generates valid AutoCAD DXF ASCII structure (`SECTION`, `HEADER`, `TABLES`, `BLOCKS`, `ENTITIES`, `EOF`).
  - Verifies layer definition for `WALLS`, `CABINETS`, `MEP_PLUMBING`, `MEP_ELECTRICAL`.
  - Verifies geometry coordinates match room and cabinet dimensions in millimetres.

## Integration & E2E Tests
- `e2e/dxf-export.spec.ts`:
  - Opens project in browser, navigates to Deliverables, exports DXF floor plan, checks downloaded file content.

