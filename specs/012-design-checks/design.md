# 012 — Design

- `engine/checks/designChecks.ts` (pure, tested): `designChecks(project)` → `{ id, severity, code, entityIds, message, zone? }`. Door/drawer sweeps come from the geometry movers (`moverPoint` sampled up to 90° / fully open) transformed to the room; walkways from facing box gaps; heights from worktop slabs.
- UI: Checks panel (bottom), status bar count, inspector section, amber sweep zones in plan and 3D for the selection.
