# 008 — Free placement, 3D resizing and cabinet interiors

**Status:** Done

## Problem
Units could only slide along their own wall; moving to another wall or into the room, and changing
height or depth, required the side panel. Cabinets had no interior: shelves, drawers, rails or a
crockery layout could not be designed.

## User stories
- I drag a unit anywhere in the room (3D or plan). Near a wall it snaps onto that wall, facing the
  room; elsewhere it stands free (an island), aligned to other units' edges. The side panel follows.
- I rotate a free-standing unit by 90° (button, `R`, or `rot 90`).
- I resize a cabinet in 3D with three grips: width (side), height (top), depth (front-bottom). Widths
  snap to standard module sizes but any whole millimetre in the type's range is allowed.
- I design the inside of a cabinet: vertical sections, shelves (wood or glass), internal drawers,
  hanging rails, plate racks, bottle racks and pull-out baskets; solid, glass or open fronts.
- I start from presets (crockery unit, wardrobe, pantry, drawers, bottle rack, split, N shelves)
  and fine-tune by dragging shelves and dividers in an interior elevation, or typing millimetres.
- I can see the interior in 3D (fronts become see-through).

## Rules
- Fittings may not overlap or leave the inside of the carcass; section widths must fit. A resize
  that would cut through a fitting is rejected and names the fitting (no silent moves).
- Wall cabinets and hoods must hang on a wall; dragging them moves them between walls only.
- Saved files from schema 1 load through a migration that adds the default interior and solid fronts.

## Acceptance criteria
- Dragging a base unit from the back wall to the middle of the room makes it free-standing; dragging
  it near the left wall snaps it onto the left wall facing the room. Undo restores each step.
- The height grip changes height in 10 mm steps within the type's range.
- Applying "crockery" to a wall cabinet gives glass doors, a plate rack and glass shelves.
- Lowering a cabinet below a shelf is rejected with the shelf named.
- A schema-1 file loads with default interiors.
