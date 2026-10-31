# 006 — Drawings and BOM

**Status:** Done (M6) — elevations, drawing sheets, cabinet schedule and cut list delivered in spec 013.

## User stories
- As a designer, I switch to a dimensioned 2D plan of the kitchen.
- As a designer or estimator, I read a bill of materials that always agrees with the design.
- (Not started) As a workshop, I get elevations per wall and a cut list I can print or export.

## Requirements
- Plan: room outline and wall thickness, worktops, floor units filled with their finish, wall
  units dashed, overall room dimensions, the selected unit's width dimension; click to select.
- BOM: cabinets grouped by type, size and finish with quantities; appliances; worktop segments
  (wall, length × depth × thickness, finish); front area per finish and carcass panel estimate.
- All figures come from the domain model; rows link back to their elements.

## Acceptance criteria
- After resizing a base cabinet to 900 mm the plan label and the BOM row show 900 and the worktop
  total grows by 300 mm.
- BOM quantities sum to the number of cabinets and appliances in the project.
