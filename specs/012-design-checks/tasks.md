# 012 — Tasks

- [x] Checks engine + tests
- [x] Checks panel, status bar, inspector section
- [x] Sweep zones in plan and 3D
- [x] E2E and docs

## Found while building

- [x] The checks caught a real flaw in the L-shaped preset: the 900 mm blind corner's 450 mm door hit
  the perpendicular run when opened. Blind corner units now keep 600 mm blind, and the L preset uses
  a 1000 mm corner unit.
- [x] Walkway gaps only count when the corridor between two units is empty (not the corner of an L).
- [x] Overlaps up to 35 mm are absorbed by real hinge geometry and not reported.
