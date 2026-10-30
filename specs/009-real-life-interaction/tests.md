# 009 — Tests

- Unit: movers cover every moving part; door hinge sides and swing direction; drawers and drop doors
  move forward/down; inner drawers require the doors in front (`engine/geometry/mechanics.test.ts`).
- Unit: openness rules — toggle, open blockers first, close dependents, clamp, open/close all
  (`state/openings.test.ts`).
- E2E: click to open/close in 3D without dirtying the project; inner drawer + door; open/close all
  (`e2e/interact.spec.ts`).
