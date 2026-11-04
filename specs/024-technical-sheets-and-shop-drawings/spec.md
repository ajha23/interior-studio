# 024 — Technical MEP Sheets, Tile Calculator, Shop Drawings & Factory Part Labels

**Status:** In Progress. Implements PRD v2 Phase 3.1 & Sprint 1 (DR-03, DR-04, DR-05, DR-06, MF-04).

## 1. Background & Business Value
Factories and on-site contractors cannot work from 3D visual renders alone. The factory saw controller needs part cut lists, the edge-bander and CNC operator need module shop drawings with drilling coordinates, assembly workers need printable thermal part labels, and on-site civil contractors need electrical/plumbing layout sheets with AFF (Above Finished Floor) heights and tile quantity schedules before cabinetry is installed.

## 2. Requirements

### 2.1 Dedicated MEP Layout Sheets (DR-03, DR-04)
- Generate dedicated technical sheets for:
  - **Electrical Layout**: 16A power points (hob, chimney, oven, microwave), 6A utility points, switchboard locations with AFF heights, distance from wall datum, and a circuit legend table.
  - **Plumbing Layout**: Water inlet (hot/cold), waste drain, and gas cylinder line positions with exact coordinates, heights, and sanitary clearances.
- Integrate into `buildDrawingSet` as selectable technical sheets in the Deliverables studio.

### 2.2 Tile Layout & Wastage Calculator (DR-05)
- Pure engine function `calculateTileLayout(room, wallAreas, tileConfig)`:
  - Computes net tileable area (total wall area minus doors/windows and base cabinet shadows).
  - Calculates tile pieces needed: $\lceil (\text{Net Area} / \text{Tile Area}) \times (1 + \text{Wastage } \%) \rceil$.
  - Generates a Tile Schedule & Layout Sheet with tile sizes (e.g. 300×600mm or 600×1200mm), joint widths (2mm/3mm), and total boxes needed.

### 2.3 Module Shop Drawings (DR-06)
- Auto-generate an exploded/orthographic shop drawing sheet per module type from `explodeCabinet()`:
  - Dimensioned panels: Left Gable, Right Gable, Bottom, Top Stretchers, Shelves, Back Panel, and Shutters.
  - 32mm system boring coordinates (5mm shelf pin holes at 37mm setback, 35mm hinge cup borings).
  - Edge-banding indicator callouts (e.g. EB-0.8-PVC / EB-2.0-ABS).

### 2.4 Printable Part Labels (MF-04)
- Generate production-ready part labels in two industry-standard formats:
  - **Thermal Roll (Single Label)**: 100mm × 50mm for direct thermal barcode/label printers (Zebra, TSC).
  - **A4 Sheet (21-Up)**: 3 columns × 7 rows (70mm × 42.4mm) for standard laser printers.
- Each label must display:
  - Project code & module reference (e.g. `PRJ-0042 / C1 Base 600`).
  - Part name & material code (e.g. `Left Side (Gable)` · `PLY18-WHT`).
  - Finished dimensions ($L \times W \times T$).
  - Edge-banding 4-side code map (`L1`, `L2`, `W1`, `W2`).
  - QR Code matrix resolving to read-only part inspection URL (`https://studio.interior/parts/{id}`).

## 3. Definition of Done
1. Zero framework imports in `src/engine/deliverables/` (pure TypeScript math and vector primitives).
2. All measurements stored and computed in integer millimetres.
3. Unit tests pass for MEP sheets, tile calculator, shop drawings, and part labels.
4. UI integration in `DeliverablesView` and Playwright E2E verification.
5. `npm run lint && npm run typecheck && npm test && npm run build` pass with 0 errors.

