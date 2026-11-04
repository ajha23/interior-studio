# 022 — Design

## Data Structures & Schemas

1. **MEP Points (`src/domain/mep/schema.ts`)**:
   - `MepKind`: `'electrical_16a' | 'electrical_6a' | 'water_inlet' | 'water_drain' | 'gas_point' | 'chimney_duct'`
   - `MepPoint`:
     - `id`: string
     - `kind`: MepKind
     - `wallId`: `'back' | 'left' | 'right' | 'front'`
     - `offset`: integer mm along the wall
     - `elevation`: integer mm above finished floor level (AFFL)
     - `label`: optional string
     - `elementId`: optional string (reference to connected appliance or cabinet)

2. **MEP Design Checks (`src/engine/checks/mepChecks.ts`)**:
   - `checkMepSafety(project: KitchenProject): MepIssue[]`
   - Checks:
     - `MEP_WATER_ELECTRICAL_PROXIMITY`: Electrical point within 300mm of water outlet or sink element.
     - `MEP_SINK_UNCONTAINED_PLUMBING`: Plumbing point located outside sink cabinet bounds.
     - `MEP_HOOD_CHIMNEY_MISALIGNMENT`: Chimney exhaust duct misaligned with hood/hob by more than 75mm.

3. **DXF Exporter (`src/engine/deliverables/dxf.ts`)**:
   - Pure framework-free ASCII DXF writer (AutoCAD R12 compatible).
   - Generates `HEADER`, `TABLES` (Layer table with colors: 1=Red, 2=Yellow, 3=Green, 4=Cyan, 5=Blue, 7=White), `BLOCKS`, and `ENTITIES`.
   - Supports `LINE`, `LWPOLYLINE`, `CIRCLE`, and `TEXT` entities.
   - Layers: `0`, `WALLS`, `CABINETS`, `WORKTOPS`, `APPLIANCES`, `MEP_PLUMBING`, `MEP_ELECTRICAL`, `DIMENSIONS`.

4. **Deliverables Store & UI Integration**:
   - DeliverableKind: `'dxf-plan'` and `'dxf-elevation'`.
   - Toolbar button in `DeliverablesView.tsx` when viewing drawings.

