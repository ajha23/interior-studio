# 024 Tests — Technical MEP Sheets, Tile Calculator, Shop Drawings & Factory Part Labels

## Acceptance Criteria & Test Scenarios

### 1. MEP Service Sheet (DR-03, DR-04)
- A project with 2 electrical points (hob 16A, microwave 16A) and 2 plumbing points (sink water inlet, drain) produces:
  - An MEP drawing sheet with symbols `E16`, `W_IN`, `W_OUT`.
  - Dimension arrows locating each service point from the wall corner datum.
  - A bottom schedule table with 4 rows specifying Point ID, Type, Wall, Distance (mm), and Height AFF (mm).

### 2. Tile Calculator Engine (DR-05)
- Given an L-shaped kitchen with Wall A (3000mm) and Wall B (2400mm):
  - Dado height 600mm -> Gross dado area: $(3.0 + 2.4) \times 0.6 = 3.24\text{ m}^2$.
  - Window opening of 1200×600mm deducted -> Net area: $3.24 - 0.72 = 2.52\text{ m}^2$.
  - 300×600mm tile (area $0.18\text{ m}^2$): $2.52 / 0.18 = 14$ tiles.
  - With 10% wastage: $\lceil 14 \times 1.10 \rceil = 16$ tiles.
  - With 8 tiles/box: 2 full boxes.

### 3. Module Shop Drawings (DR-06)
- Generating a shop drawing for a standard 600mm base unit outputs:
  - Exploded panel views for Left Gable, Right Gable, Bottom, Front/Back Stretchers, Shelf, Back, and Shutter.
  - Exact finished dimensions matching `explodeCabinet()`.
  - 32mm system line boring coordinates callouts (37mm front setback, 32mm pitch).

### 4. Part Labels (MF-04)
- Generating thermal part labels for a production package produces:
  - Exact 100mm × 50mm SVG bounding box per label.
  - 4 edge-banding indicators (e.g. `EB-0.8-PVC` on front edge, blank on hidden edges).
  - Valid QR matrix resolving to `https://studio.interior/parts/...`.

