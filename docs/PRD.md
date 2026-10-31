# Product requirements — Interior Studio

## Vision

A professional design workspace where interior designers lay out rooms and custom furniture with
exact, editable dimensions, see the result in realistic 3D, and get drawings and a bill of
materials that agree with the design. It starts with modular kitchens.

## Users

- **Designer** (primary): measures a site, lays out the kitchen with a client, iterates on sizes
  and finishes, and hands numbers to the workshop.
- **Workshop / estimator** (secondary, later phases): reads schedules, BOM and drawings.
- **Client** (later phases): reviews a presentation; never edits.

## Phase 1 scope — working 3D kitchen (this release)

| # | Requirement | Status |
| --- | --- | --- |
| P1.1 | Create a project with room width, length, ceiling height and wall thickness | Done |
| P1.2 | Start from a straight, L-shaped or empty layout; re-apply a preset later | Done |
| P1.3 | Procedural base, drawer, sink, blind-corner, wall and tall cabinets; fridge, range, dishwasher and hood placeholders | Done |
| P1.4 | Worktops derived automatically from runs of base units | Done |
| P1.5 | Orbit, pan, zoom; camera presets (3D, top, front, reset); grid toggle | Done |
| P1.6 | Select by clicking rendered geometry, the plan, or the scene list | Done |
| P1.7 | Inspector: width/height/depth, wall, offset along wall, elevation, shutter finish, remove | Done |
| P1.8 | Room-wide finishes: worktop, carcass, floor, walls | Done |
| P1.9 | Readable validation errors; invalid edits leave the design unchanged | Done |
| P1.10 | Undo/redo for every edit (toolbar and keyboard) | Done |
| P1.11 | Save to the browser, reopen after reload, list/delete projects, export/import files | Done |
| P1.12 | Dimensioned 2D plan and a basic BOM (from Phase 2, pulled forward) | Done (basic) |

## Essential workflow (acceptance)

1. Create a project and enter room dimensions.
2. Choose a straight or L-shaped kitchen.
3. Add, move, select and resize individual units.
4. Change finishes without recreating objects.
5. Undo and redo changes.
6. Save and reopen the project.
7. Inspect a dimensioned layout and a basic BOM.

Each step maps to automated tests in `docs/ACCEPTANCE_TESTS.md`.

## Out of scope for Phase 1

Image-to-3D, video interpretation, path-traced rendering, manufacturing drawings, accounts,
cloud persistence, multi-user editing and the AI copilot. These are later phases in `ROADMAP.md`.

## Supported sizes

Phase 1 supports an explicit list of module widths and bounded heights/depths per unit type
(`src/domain/furniture/specs.ts`). Anything else is rejected with a message listing what is
supported. Appliance heights and depths are fixed placeholders.
