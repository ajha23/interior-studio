# 009 — Design

- **Geometry** (`engine/geometry/parts.ts`): `buildModel(el)` returns parts plus `movers`
  (`hinge` about a vertical edge, `drop` about a bottom edge, `slide` along the front normal), each with
  pivot, signed amount, grab point, vertical span and `requires` (doors in front). Parts carry `mover`.
  `moverPoint(m, t, p)` is the shared pose maths. Drawer units gained drawer boxes; the oven gained a
  separate door and cavity; fridge and dishwasher gained visible shelves/racks.
- **State** (`state/openings.ts`): `openness` map `element/mover → 0…1`, pure rules (`setOpening`,
  `toggleOpening`, `setAll`), kept in the store outside the project and history.
- **Rendering**: `ElementModel` renders each mover in a pivot group and eases towards its target every
  frame. `rendering/selection/interaction.ts` handles click-to-toggle and drag-to-pull by projecting the
  grab point closed → open onto the screen and following the pointer along that vector.
- **UI**: Interact toggle + Open all / Close all in the viewport; "Doors & drawers" panel in the
  inspector; `H` shortcut; `interact`, `open all`, `close all`, `opendoors`, `closedoors` commands.
