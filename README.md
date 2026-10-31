# Interior Studio

A browser-based, dimension-driven modular kitchen designer: the first vertical slice of a wider
interior-design and custom-furniture platform (see `docs/ROADMAP.md`).

Create a room, start from a straight or L-shaped kitchen, click any unit in the 3D view or plan,
edit its width/height/depth, position and finish, undo/redo, read a live bill of materials, and
save projects locally.

CAD-style working: double-click a unit (or **F**) to fly to it, **Home** for zoom extents, ViewCube,
perspective/parallel projection, walls that cut away automatically, Realistic / Edges / X-ray
styles, drag units along walls (3D or plan) with snapping, a grip to drag widths, **Tab** to cycle
units, and a command line (**/**): `w 900`, `m 1200`, `m +50`, `e`, `u`, `ze`, `f`, `finish oak`,
`add base 600`, `help`.

Free design: drag any unit anywhere — near a wall it snaps onto it, elsewhere it becomes a
free-standing island (**R** rotates). Blue / green / amber grips resize width, height and depth in
3D (any millimetre in range; standard sizes snap). Each cabinet has a configurable **interior**:
sections, shelves (wood or glass), internal drawers, hanging rails, plate racks, bottle racks and
baskets, with solid, glass or open fronts and presets (crockery, wardrobe, pantry, drawers, bottles,
split, N shelves). Drag shelves and dividers in the interior elevation; **I** shows interiors in 3D.

Real-life interaction: press **H** (Interact) and click any door, drawer, basket or appliance door to
open it — doors swing on their hinges, drawers slide out with their boxes, oven and dishwasher doors
fold down — or grab a handle and pull. Inner drawers open their door first. Opening things is not a
design change (not saved or undoable).

Walk through it: press **V** to stand in the room at eye height (standing, seated or child). Walk with
**W A S D**, turn with **Q / E** or by dragging, click the floor or the mini-map to go somewhere, and
press **F** (or double-click) on a unit to stand right in front of it — e.g. at the cooktop. Open,
drag and edit everything from where you stand, and save named viewpoints to come back to.

Doors, windows and openings: add them from the library (or `add door 900`), drag them along a wall on
the plan, set width, height, sill, swing and hinge side. They cut into the 3D walls, show on the plan
with door swings, and units are kept out of doorways, door swings and from covering windows.

Design checks: the **Checks** panel (and the status bar) warns about doors, drawers and appliance
doors that would hit something when opened, walkways under 900 mm, wall cabinets less than 450 mm
above the worktop, a hood outside 650–750 mm above the hob, tall units beside the hob, and shows the
sink–hob–fridge work triangle. Warnings never block an edit; the amber area shows the space involved.

Units and views: show and type lengths in mm, cm, m, inches, feet or feet & inches (top bar);
every field accepts any unit (`12' 6"`, `381 cm`, `3.81 m`) and geometry is always stored in whole
millimetres. **Split** shows the plan and 3D side by side; the plan has a grid and wall labels; click
a wall (plan or 3D) to inspect it. Room presets, plus dining tables, chairs and sofas. Below 1280 px
the side panels become drawers.

Drawings: the **Drawings** view is a set of A3 sheets with a title block — the plan, an elevation of
every wall in use (fronts, handles, worktops, windows and doors, dimension chains and height marks),
the cabinet schedule (units numbered C1…, A1… on every sheet) and the cut list with panels, edge
banding, glass, worktops, hardware and a board estimate. Print or save as PDF, download SVG, or
download the cut list as CSV for the workshop.

## Quick start

```bash
npm install
npm run dev            # http://localhost:5173
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Typecheck and production build to `dist/` |
| `npm run lint` | ESLint (includes the domain-purity import rule) |
| `npm run typecheck` | `tsc -b` |
| `npm test` | Vitest: domain, geometry, persistence, store and component tests |
| `npm run e2e` | Playwright end-to-end tests (first run: `npx playwright install chromium`) |
| `npm run check` | lint + typecheck + test + build |
| `npm run build:vercel` | Build plus `.vercel/output` (static app and the `/api/assistant` function) |

## Stack

React 19, TypeScript, Vite · Three.js with React Three Fiber and Drei · Tailwind CSS v4 with
shadcn/ui-style components · Zustand + Immer · Zod · IndexedDB · Vitest, React Testing Library, Playwright.

## How it fits together

```
features/ (UI)  ──dispatch(DesignCommand)──▶  state/editorStore  ──▶  domain/commands/executeCommand
      ▲                                              │                       │ Zod parse → size rules →
      │                                              ▼                       │ Immer draft → invariants
rendering/ (R3F) ◀── project (immutable) ── undo/redo snapshots              ▼
engine/geometry/parts (procedural parts, mm)                     new project or readable errors
persistence/ (IndexedDB, versioned JSON files)
```

Lengths are integer millimetres everywhere in the domain and are converted to metres only in
`src/rendering/units.ts`. Read `AGENTS.md` before changing code, and `docs/` for the product,
architecture and domain model.

## Design assistant

**Assistant** in the top bar opens a chat panel that edits the design from plain language (“Add a
600 mm dishwasher next to the sink”). Every change is previewed (sizes and positions before → after,
validation, warnings) and applied only when you approve, as one undo step. Out of the box the
`/api/assistant` endpoint uses a deterministic rule-based provider; to use Claude, set
`ASSISTANT_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` on the server (`.env.local` for `npm run dev`,
project environment variables on Vercel; see `.env.example`). Details: `docs/AI_ASSISTANT.md`.

The microphone button in the panel lets you **speak** requests instead (Chrome, Edge, Safari); they
go through exactly the same previews and approval, and you can say “apply” or “reject”. No setup
or keys are needed. Details, browser support and privacy: `docs/VOICE.md`.

Whole-layout goals work too (“Convert this L-shaped kitchen into a U-shaped kitchen, keep the sink
wall, maximise storage”): a deterministic planner generates and checks alternatives you can compare,
preview in the plan and 3D, and apply as one undoable step. See `docs/LAYOUT_AGENT.md`.

## Deliverables

**Deliverables** turns the design into a dimensioned floor plan, wall elevations, a cabinet schedule
and a bill of materials, checks readiness for presentation, drawings and manufacturing, and exports
PDF, SVG and CSV. Every file names the design revision it came from and shows as stale after a change.
Manufacturing outputs need a construction method (Readiness › Manufacturing settings). Presentation
mode shows the 3D model without editing tools. See `docs/DELIVERABLES.md`.

## Project files

Projects are saved in this browser (IndexedDB). **Export** downloads a `.kitchen.json` file with a
schema version; **Import project file** on the home screen loads one, running migrations and
validation first. Clearing site data deletes local projects, so export anything you want to keep.

## Status

Phase 1 (M0–M6), the Phase 1 gaps, Phase 2 (chat-driven design editing), Phase 3 (voice) and a
first version of Phase 4 (layout design agent) and Phase 5 (production deliverables) are implemented. Not yet: cloud persistence and accounts. See
`docs/ROADMAP.md` and `docs/DECISIONS.md` (including where the previous Supabase-based app lives).
