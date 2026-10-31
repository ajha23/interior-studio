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
| M6 | 2D plan, elevations, BOM, exportable drawings | Reports agree with the domain model | Done: plan, elevations, drawing sheets, schedule, cut list, hardware | 006, 013 |
| M7 | AI command adapter | Validated commands edit the same scene | Done: chat assistant with previews, approval, atomic commits (rule-based + Anthropic providers) | 015 |
| — | CAD navigation and direct editing | Focus, zoom extents, ViewCube, projections, cut-away walls, visual styles, drag/grip editing, command line | Done | 007 |
| — | Production deliverables (Phase 5) | Dimensioned plan/elevations, schedule, BOM/cut list from verified rules, readiness, PDF/SVG/CSV, revisions, presentation | Done (first slice) | 018 |
| — | Layout design agent (Phase 4) | Whole-layout goals → validated, scored alternatives; preview, apply, undo | Done (first transformations) | 017 |
| — | Voice (Phase 3) | Speak requests into the assistant; same preview/approval/undo; spoken apply/reject and replies | Done | 016 |
| — | Phase 1 gaps | Units (mm…ft-in), split view, plan grid, wall labels, selectable walls, room presets, furniture, responsive layout | Done | 014 |
| — | Design checks | Door/drawer clearances, walkways, heights, landing space, work triangle (warnings) | Done | 012 |
| — | Wall openings | Doors (swing, hinge, opening leaf), windows, archways; units kept clear of them | Done | 011 |
| — | Walk through the room | First-person walk at eye height, stand at a unit, mini-map, saved viewpoints | Done | 010 |
| — | Real-life interaction | Interact mode: doors swing, drawers/baskets slide, appliance doors drop; drag to pull | Done | 009 |
| — | Free placement, 3D resizing, cabinet interiors | Drag anywhere (wall capture / islands), W/H/D grips, custom widths, interiors with presets and a draggable elevation | Done | 008 |

## Next up (Phase 2 — designer-grade precision)

1. ~~Wall openings (doors, windows) as domain entities; units must not block them~~ (done in 011).
2. ~~Snapping, drag-to-move, moving between walls and islands~~ (done in 007/008). Still to do: snap to openings, corner-aware blind units on islands.
3. ~~Clearance checks as warnings~~ (done in 012).
4. ~~Elevations per wall and printable/exportable drawings~~ (done in 013).
5. ~~Cabinet schedule and a workshop cut list~~ (done in 013). Next: review construction rules with a workshop; nesting/optimised cutting layouts.
6. ~~Interior fittings and hardware~~ (in the cut list, 013).

## Later phases

- ~~**Phase 3 — Voice**~~ (done in 016, `docs/VOICE.md`). Next: cloud speech provider option,
  reference images and style extraction.
- **Phase 4 — Full studio:** bedrooms, wardrobes, living rooms, reusable catalogue, custom furniture
  drawings, accounts and multi-user projects, client presentations, production integrations. Port
  what's useful from the previous app on `main` (see `DECISIONS.md` D-001).
