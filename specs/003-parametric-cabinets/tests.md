# 003 — Tests

- Geometry: body bounds equal dimensions for every supported width of every type; plinth reaches
  the floor and only floor units have one (`engine/geometry/geometry.test.ts`).
- Domain: resize ripple and worktop update; unsupported, non-integer and out-of-range sizes; wall
  overflow; auto-placement; moves into overlaps; floor units can't be raised (`domain/domain.test.ts`).
- Component: width field resize, 650 rejection, non-numeric input, remove (`ElementInspector.test.tsx`).
- E2E: select in plan, set 900, verify plan and BOM; click 3D geometry to select (`e2e/kitchen.spec.ts`).
