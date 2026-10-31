# 011 — Design

- Schema: `project.openings: Opening[]` (optional, defaulted; no version bump). `Opening = { id, kind:
  door|window|opening, wallId, offset, width, height, sill, swing: in|out|none, hinge: left|right }`.
- Specs per kind (width/height/sill ranges and defaults) in `domain/room/openings.ts`, with geometry
  helpers: the wall rectangle an opening occupies, and the floor zone an inward door sweeps.
- Invariants: openings inside their wall and below the ceiling, not overlapping each other; no
  element intersects an opening's wall rectangle (within its depth of the wall) or an inward door's
  swing zone (floor units).
- Commands: `add_opening` (auto-placed if no position), `update_opening` (any of wall/offset/size/
  sill/swing/hinge), `remove_opening`. Snapping: units snap before/after openings they would block.
- Geometry: `engine/geometry/walls.ts` splits each wall into solid pieces around its openings;
  `buildOpeningModel` gives frames, glazing, sills and a hinged door leaf (a mover).
- Rendering: walls as pieces (front wall now rendered too, cut away from outside); openings selectable;
  door leaves open in Interact mode.
- UI: library section, opening inspector, plan drawing + drag, command line `add door|window|opening`.
