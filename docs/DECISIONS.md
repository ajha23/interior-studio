# Decision records

## D-001 — Rewrite on the blueprint stack (2026-10-30)

**Context.** The previous app (a Vite monorepo with a µm-based core package, Supabase auth, cloud
saves, AI edge functions, quotes and a Blender render worker) had grown well past the blueprint's
Phase 1, but it didn't follow the blueprint's stack, structure or spec-driven workflow.

**Decision.** Rebuild from the blueprint's first vertical slice (M0–M5) on a branch:
React + TypeScript + Vite, R3F + Drei, Tailwind + shadcn/ui, Zustand + Immer, Zod, IndexedDB,
Vitest + RTL + Playwright, with `AGENTS.md`, `docs/` and `specs/`.

**Consequences.** Cloud persistence, sign-in, AI, quotes, elevations and cut lists are gone from this
branch until rebuilt in later phases. The previous app is still on `main` at commit `eaf7d0f`
(plus the uncommitted open sign-up work in that checkout); use it as a reference when porting
features. Do not merge this branch over `main` without deciding how to handle existing Supabase
users and data.

## D-002 — Integer millimetres in the domain

Store every length as an integer number of millimetres; convert to metres only in
`src/rendering/units.ts`. This keeps construction measurements exact and makes "never silently
change a measurement" enforceable: non-integers are rejected by the schema. (The previous app used
micrometres; millimetres match how designers and workshops quote sizes.)

## D-003 — Commands with validation, history as snapshots

All edits are `DesignCommand`s run by `executeCommand`, which validates with Zod and the project
invariants. Undo/redo stores immutable project snapshots rather than inverse commands: with Immer's
structural sharing they are cheap, and they cannot drift out of sync with complex commands such as
resize ripple or layout presets.

## D-004 — Derived data is never stored

Worktops, geometry, labels and the BOM are recomputed from the project. That way resizing a
cabinet automatically updates its worktop and BOM, and saved files can't contain stale derived
data.

## D-005 — Explicit module sizes in Phase 1 (superseded by D-008)

Units accept only listed widths and bounded heights/depths. Unsupported sizes are rejected with the
supported list, so nobody gets a configuration the workshop can't build. Custom sizes are a later
decision.

## D-006 — DOM label overlay instead of drei `<Html>`

drei's `<Html>` creates a separate React root per label, which raced with React 19 StrictMode
(labels went missing, unmount errors appeared). Labels are now plain DOM nodes positioned each frame
by projecting domain anchors (`rendering/selection/LabelProjector.tsx`).

## D-007 — Local-first persistence

Phase 1 stores projects in IndexedDB and exports versioned JSON files. A backend (Node + PostgreSQL
per the blueprint, or the existing Supabase project) is a Phase 4 decision. It should reuse the
same file envelope and migrations.

## D-008 — Custom widths with standard snap sizes (2026-10-30)

Supersedes D-005 for cabinets. Designers asked to size units freely, so cabinets accept any
whole-millimetre width inside their type's range (`widthRange`), and the old list becomes the
standard sizes that grips and the catalogue snap to. Appliances keep fixed widths because real
appliances come in fixed sizes. Heights and depths were already ranges.

## D-009 — Footprint centres on half millimetres

Positions are footprint centres. With odd widths (e.g. 651 mm) a unit whose edges sit on whole
millimetres has its centre on a half millimetre, so `x`/`z` are validated as multiples of 0.5 mm.
Edges, dimensions and every value shown to users remain whole millimetres.

## D-010 — Interiors as sections and fittings, never auto-moved

A cabinet interior is a list of vertical sections (fixed or auto width) holding fittings positioned
by height above the inside floor. Like Blum's configurator, a resize that would cut through a
fitting is blocked rather than moving the fitting silently; the message names the fitting. Presets
generate an interior for the current size. Schema 2 added `interior` and `frontStyle`; the 1→2
migration is self-contained so later changes to defaults cannot change how old files load.

## D-011 — Free-standing units

Units without `wallId` stand free (islands) with rotation 0/90/180/270 and get their own worktop.
Dragging captures a unit onto a wall when its back comes within 250 mm of it; wall-hung units must
always be on a wall.

## D-012 — Opening doors and drawers is view state

How open each door or drawer is lives in the editor store (`state/openings.ts`), like the camera:
it is not part of the project, not saved, not undoable and never marks the project dirty. Moving
parts are described by the geometry builder (`movers`), so the same hinge/slide maths drives the
animation, drag-to-pull and tests. Real-life ordering (doors before inner drawers) is enforced there.

## D-013 — Walk mode and saved viewpoints

Walking is a second camera rig (`WalkControls`) rather than a constrained orbit camera, so keyboard
movement, collisions and eye height behave like being in the room. The walker's position is view
state; named viewpoints are design data (`project.viewpoints`, optional with a default, so no schema
bump) changed through commands, because designers present them to clients.
