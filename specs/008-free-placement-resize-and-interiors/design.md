# 008 — Design

- **Schema 2** (`domain/schema.ts`): cabinets gain `frontStyle: solid|glass|open` and
  `interior: { sections: { width: mm | null (auto), fittings: Fitting[] }[] }`; fittings are
  `shelf{y, glass}`, `drawer{y,height}`, `rail{y}`, `plate-rack{y,height}`, `bottle-rack{y,height}`,
  `basket{y,height}` with `y` = height above the inside floor. Migration 1→2 in `serialization.ts`.
- **Interior rules and presets** (`domain/furniture/interior.ts`): inside dimensions (18 mm panels,
  8 mm back), section widths (fixed + auto share), validation messages, preset generators.
- **Specs**: cabinets get a width range plus `widths` as standard snap sizes; appliances keep fixed lists.
- **Commands**: `place_entity` (free x/z/rotation), `rotate_entity`, `set_interior`,
  `set_front_style`, `apply_interior_preset`. Free units resize keeping their back and left side.
- **Worktops**: free-standing worktop units get their own slab with a front overhang.
- **Snapping** (`engine/snapping/placement.ts`): from a desired centre, snap to the nearest wall
  within 250 mm (wall-mount types always), then along-wall snapping; otherwise free with edge
  alignment and the 10 mm grid.
- **Geometry**: hollow carcass (sides, top, bottom, back) + dividers + fittings; glass and open fronts.
  Parts carry a `group` (`front`/`interior`) so the renderer can ghost fronts to show the inside.
- **UI**: W/H/D grips; drag anywhere; inspector placement (wall or free X/Z/rotation); interior
  editor with a draggable SVG elevation; command line `rot`, `free`, `at`, `shelves`, `glass`,
  `interior <preset>`.
