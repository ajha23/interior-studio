# Architecture

## Layers

```
src/
├── app/            Entry, hash router, global styles (Tailwind + shadcn tokens)
├── features/       Feature UI: projects, room-editor, kitchen-layout, cabinet-catalog,
│                   material-editor, drawings (plan + BOM)
├── components/     Shared UI: ui/ (shadcn-style primitives, mm-field), layout/ (top bar, status bar)
├── state/          Zustand + Immer editor store: project, history, selection, view
├── rendering/      React Three Fiber: scene, cabinets/appliances, materials, selection, labels
├── ai/             Framework-free assistant: schema, references, compiler, transactions, providers,
│                   layout/ (objective → constraints → candidates → scores)
├── server/         /api/assistant handler (dev middleware + Vercel function)
├── voice/          Framework-free speech input/output and normalisation (feeds the assistant)
├── engine/         Framework-free maths: geometry (boxes, procedural parts), measurement,
│                   deliverables/ (drawing model, plan/elevations, schedule, BOM, readiness, PDF/SVG/CSV)
├── domain/         Framework-free model: schema (Zod), specs, walls, constraints, commands,
│                   presets, serialization, BOM
├── persistence/    IndexedDB project store
└── test/           Test setup and helpers
```

Dependency direction is strictly downward: `features → state → domain`, `features → rendering →
engine → domain`, `persistence → domain`. `domain` and `engine` never import React, Three.js or
Zustand; ESLint enforces this.

## Data flow

1. A control (inspector field, catalogue entry, keyboard shortcut, layout button) builds a
   `DesignCommand` and calls `useEditorStore.dispatch`.
2. `executeCommand(project, command)`:
   - parses the command with Zod (`DesignCommandSchema`), so malformed input is rejected first;
   - checks domain rules (supported sizes, finish categories, wall bounds);
   - applies the change to an Immer draft (structural sharing, immutable result);
   - runs `validateProject` and rejects the command if it introduces a new issue
     (outside the room, overlap, unsupported size, unknown finish).
3. On success the store pushes the previous project onto the undo stack and replaces the project.
   On failure the project object is returned unchanged and the errors are shown.
4. Everything visible is derived from the project: procedural parts (`engine/geometry/parts.ts`),
   worktops (`domain/furniture/countertops.ts`), labels (`rendering/selection/labels.ts`), the plan
   and the BOM (`domain/bom/bom.ts`).

The design assistant (Phase 2, `docs/AI_ASSISTANT.md`) plugs in at step 1: its operations are
compiled to `DesignCommand`s and committed with `applyTransaction` (all-or-nothing, one undo step),
so a chat edit and an inspector edit produce identical results.

## Rendering boundary

`src/rendering/units.ts` is the only place millimetres become world units (1 unit = 1 m). Elements
are rendered from their procedural parts in a local frame (origin at the bottom centre, front at
+z) and placed with their domain position and rotation. Materials are created once per project
finish. Dimension labels are plain DOM nodes positioned each frame by projecting domain anchors,
which avoids a second React root and keeps them testable.

The 3D canvas stays mounted while the plan is shown (its frame loop pauses), so switching views is
instant and keeps the camera.

## Persistence

`persistence/projectDb.ts` stores each project in IndexedDB as the same versioned JSON envelope
used for export (`domain/project/serialization.ts`), plus a summary for the projects list. Loading
always goes through `parseProjectFile`: JSON parse → format check → migrations → Zod → invariants.

## Testing

| Level | Tool | Where |
| --- | --- | --- |
| Domain, geometry, persistence, store | Vitest (+ fake-indexeddb) | `src/**/*.test.ts` |
| Components | React Testing Library | `src/**/*.test.tsx` |
| Workflows incl. WebGL picking | Playwright (Chromium, SwiftShader) | `e2e/` |

## Deviations from the original blueprint layout

- Collision lives in `engine/geometry/box.ts` (axis-aligned boxes are all Phase 1 needs); there is
  no separate `engine/collision`. Snapping along walls lives in `engine/snapping/alongWall.ts`.
- Cabinets and appliances share one renderer (`rendering/cabinets/ElementModel.tsx`) because both
  are built from procedural parts.
- The assistant lives in `src/ai` (framework-free, lint-enforced) with its panel in
  `features/assistant` and state in `state/assistantStore.ts`; see `docs/AI_ASSISTANT.md`.

## Walk mode (spec 010)

- `navMode: 'walk'` swaps `CameraRig` for `WalkControls` (first-person camera at `eyeHeight`).
  Pure maths in `rendering/scene/walk.ts`; the walker's pose is view state, viewpoints are project data.
- Look-dragging is a window listener that yields when a 3D handler claimed the press
  (`rendering/selection/pointerClaim.ts`), so drags on units, grips and doors keep working while walking.

## Real-life interaction (spec 009)

- `buildModel(el)` returns parts and `movers` (hinge, drop, slide). `ElementModel` renders each mover
  in a pivot group and eases it towards its target opening each frame.
- Openness is view state in the store (`state/openings.ts`), never part of the project or history.
- In Interact mode, `rendering/selection/interaction.ts` toggles on click and, on drag, follows the
  pointer along the grab point's projected closed → open path.

## Navigation and direct editing (spec 007)

- Camera requests (`preset | fit | focus`) live in the store; `rendering/scene/cameraViews.ts`
  computes goals (pure, tested) and `CameraRig` animates to them in perspective or parallel
  projection. A ViewCube (drei `GizmoViewcube`) sits top right.
- Drags and grips (`rendering/selection/directEdit.ts`, `features/drawings/PlanView.tsx`) snap via
  `engine/snapping`, dry-run each step through `executeCommand` into a transient `preview` (rendered
  instead of the project while dragging), and commit one command on release.
