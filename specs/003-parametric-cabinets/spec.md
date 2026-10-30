# 003 — Parametric cabinets

**Status:** Done (M2–M3)

## User stories
- As a designer, I start from a straight or L-shaped kitchen with realistic units.
- As a designer, I add units from a library; they land in the first free spot on a wall.
- As a designer, I select a unit and change its width, height and depth; the unit, its neighbours,
  its worktop, its dimension labels and the BOM update together.

## Requirements
- Unit types: base, drawer, sink, blind corner, wall, tall; appliance placeholders: fridge, range,
  dishwasher, hood. Supported sizes per `docs/DOMAIN_MODEL.md`.
- Geometry is procedural and dimension-driven: carcass, fronts with 3 mm shadow gaps, handles,
  plinths for floor units, drawer bands, blind-corner filler.
- Resizing keeps the id, the start along the wall, the back on the wall and the elevation; units
  further along the same wall shift by the change in width.
- Invalid sizes are rejected with the supported list; the previous valid state remains.

## Acceptance criteria
- Resizing a selected base cabinet from 600 to 900 mm updates its geometry, label, the following
  units, the worktop length (+300 mm) and the BOM row; the id is unchanged.
- Entering 650 mm shows "Width 650 mm is not a supported base cabinet size. Supported widths: …".
- A 600 × 720 × 560 mm cabinet's body geometry measures exactly 600 × 720 × 560 mm.
