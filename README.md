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

## Project files

Projects are saved in this browser (IndexedDB). **Export** downloads a `.kitchen.json` file with a
schema version; **Import project file** on the home screen loads one, running migrations and
validation first. Clearing site data deletes local projects, so export anything you want to keep.

## Status

Phase 1 (M0–M5) plus a basic plan and BOM from M6 are implemented. Not yet: snapping, wall
openings, elevations, cut lists, cloud persistence, accounts and the AI copilot. See
`docs/ROADMAP.md` and `docs/DECISIONS.md` (including where the previous Supabase-based app lives).
