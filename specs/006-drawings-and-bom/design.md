# 006 — Design

- `domain/bom/bom.ts` → `computeBom(project)`; panel areas are labelled as estimates.
- `features/drawings/PlanView.tsx`: SVG in millimetre user units (viewBox = room + margin), back wall
  at the top. Wall-hung units only take clicks on their outline so floor units below stay selectable.
- `features/drawings/BomPanel.tsx`: toggled under the viewport.
- Next: `engine/drawings` to produce elevation geometry from `buildParts`, shared by SVG/PDF export.
