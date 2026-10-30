# Roadmap

Each milestone leaves the repo runnable and passing `npm run check` and `npm run e2e`.

| Milestone | Work | Definition of done | Status | Spec |
| --- | --- | --- | --- | --- |
| M0 | Vite, React, TS, Tailwind/shadcn shell, lint, tests, CI | App starts and builds cleanly | Done | 001 |
| M1 | Room model, dimensions, grid | Room updates correctly from inputs | Done | 002 |
| M2 | Cabinet geometry, layout presets | Cabinets render to specified dimensions | Done | 003 |
| M3 | Selection and inspector | Click-to-select and edits work | Done | 003, 004 |
| M4 | Materials, dependent geometry (worktops) | Finish swaps and worktop updates work | Done | 004 |
| M5 | Save/load, undo/redo | Project survives reload; edits reversible | Done | 005 |
| M6 | 2D plan, elevations, BOM, exportable drawings | Reports agree with the domain model | Partial: plan + basic BOM | 006 |
| M7 | AI command adapter | Validated commands edit the same scene | Not started (contract ready; typed command line done) | — |
| — | CAD navigation and direct editing | Focus, zoom extents, ViewCube, projections, cut-away walls, visual styles, drag/grip editing, command line | Done | 007 |
| — | Walk through the room | First-person walk at eye height, stand at a unit, mini-map, saved viewpoints | Done | 010 |
| — | Real-life interaction | Interact mode: doors swing, drawers/baskets slide, appliance doors drop; drag to pull | Done | 009 |
| — | Free placement, 3D resizing, cabinet interiors | Drag anywhere (wall capture / islands), W/H/D grips, custom widths, interiors with presets and a draggable elevation | Done | 008 |

## Next up (Phase 2 — designer-grade precision)

1. Wall openings (doors, windows) as domain entities; units must not block them.
2. ~~Snapping, drag-to-move, moving between walls and islands~~ (done in 007/008). Still to do: snap to openings, corner-aware blind units on islands.
3. Clearance checks (e.g. door swing, dishwasher next to a corner, hob next to a tall unit) as warnings.
4. Elevations per wall and printable/exportable drawings (SVG/PDF).
5. Cabinet schedule and a workshop cut list derived from the procedural parts (now including interior shelves, dividers and internal drawers).
6. Interior fittings in the BOM (hardware: runners, rails, racks, baskets).

## Later phases

- **Phase 3 — AI copilot:** natural-language → `DesignCommand` via a provider adapter; preview and
  confirm multi-object or destructive changes; reference images and style extraction.
- **Phase 4 — Full studio:** bedrooms, wardrobes, living rooms, reusable catalogue, custom furniture
  drawings, accounts and multi-user projects, client presentations, production integrations. Port
  what's useful from the previous app on `main` (see `DECISIONS.md` D-001).
