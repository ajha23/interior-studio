# 013 — Drawings and production outputs (completes M6)

**Status:** Done · completes spec 006

## User stories
- I open **Drawings** and get a set of A3 sheets: the dimensioned plan, an elevation of every wall that
  has something on it, the cabinet schedule and the cut list, each with a title block.
- Elevations show units as seen from inside the room: carcass outlines, door and drawer fronts,
  handles, plinths, worktops, wall units, appliances, windows and doors, interior shelves dashed,
  a dimension chain of unit widths, the overall wall length, and height marks (plinth, worktop,
  wall-unit bottom and top, ceiling).
- Every unit has a reference (C1… for cabinets, A1… for appliances) used on the plan, the elevations
  and the schedule.
- The cut list gives every panel (material, thickness, length × width, quantity, edge banding),
  glass, worktops, hardware (hinges by door height, drawer runners, handles, shelf supports, rails,
  legs, racks, baskets) and an estimate of full boards; it downloads as CSV for the workshop.
- I print a sheet or save it as PDF (browser print), or download it as SVG.

## Rules
- Everything is derived from the domain model and the same procedural parts as the 3D model; nothing
  is typed in twice. Free-standing units appear on the plan and in the schedule, not on wall elevations.
- The cut list is a production aid generated from illustrative construction rules; it must be checked
  by the workshop (as stated on the sheet).

## Acceptance
- The back-wall elevation of the straight kitchen shows every back-wall unit at its offset, a width
  chain that adds up to the run, and the 860 mm worktop mark.
- A 600 × 720 × 560 base cabinet with one shelf yields: 2 sides 720 × 542, top and bottom 564 × 542,
  a back 564 × 684 (8 mm), one shelf, one door, 2 hinges, 1 handle, 4 shelf supports, 4 legs.
- The cut list CSV downloads with one line per panel group.
