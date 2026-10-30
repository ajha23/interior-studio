# Domain model

Source of truth: `src/domain/schema.ts` (Zod schemas; TypeScript types are inferred from them).

## Units and frames

- All lengths are **integer millimetres**. Non-integers are rejected, never rounded. Exception:
  footprint-centre `x`/`z` may be a multiple of 0.5 mm so odd widths keep whole-millimetre edges (D-009).
- Room frame: origin at the inner corner of the back and left walls; **x** runs along the back wall,
  **z** runs from the back wall towards the front, **y** is up.
- An element's `position` is the centre of its footprint at its bottom face; `position.y` is its
  elevation above the floor.
- `rotationY` is 0, 90, 180 or 270 degrees. Elements stand square to a wall with their back against
  it: back → 0, left → 90, right → 270, front → 180. Local +z is the element's front.
- **Offset along a wall** = distance from the wall's start (the left wall for back/front, the back
  wall for left/right) to the element's nearest edge. The inspector edits position in these terms.

## Entities

```ts
KitchenProject {
  schemaVersion: 1; id; name;
  room: { width; length; height; wallThickness };          // inside dimensions
  surfaces: { floor; wall; countertop; carcass };         // material ids
  cabinets: KitchenCabinet[];
  appliances: Appliance[];
  materials: Record<id, KitchenMaterial>;                 // copied from the library at creation
}
KitchenCabinet { id; type: base|wall|tall|drawer|sink|corner; dimensions; position; rotationY; materialId /* shutter */;
                 wallId? /* absent = free-standing */; catalogItemId?; frontStyle: solid|glass|open; interior: Interior }
Interior       { sections: { width: mm | null /* auto */; fittings: Fitting[] }[] }   // 1–6 sections, 18 mm dividers
Fitting        = shelf{y, glass} | drawer{y, height} | rail{y} | plate-rack{y, height} | bottle-rack{y, height} | basket{y, height}
                 // y = underside above the inside floor; inside = W−36 × H−36 × D−26 (18 mm panels, 8 mm back)
Appliance      { id; type: fridge|range|dishwasher|hood; dimensions; position; rotationY; wallId? }
KitchenMaterial{ id; name; category: shutter|carcass|countertop|floor|wall; color; roughness; metalness }
```

Derived (never stored): worktops, procedural parts, labels, plan drawing, BOM, validation issues.

## Supported modules (`furniture/specs.ts`)

Cabinet widths: any whole millimetre in the range; standard sizes are snap points (D-008).

| Type | Width range (standard sizes) | Height | Depth | Elevation | Worktop |
| --- | --- | --- | --- | --- | --- |
| base | 150–1200 (300 … 1200) | 600–900 | 300–700 | 100 (plinth) | yes |
| drawer | 300–1200 (300 … 1200) | 600–900 | 300–700 | 100 | yes |
| sink | 600–1200 (600 800 900 1000 1200) | 600–900 | 500–700 | 100 | yes |
| corner (blind) | 900–1200 (900 1000 1200) | 600–900 | 500–700 | 100 | yes |
| wall | 150–1200 (300 … 1200) | 300–1000 | 250–450 | 1480 (editable) | no |
| tall | 300–900 (400 450 500 600 800 900) | 1800–2400 | 300–700 | 100 | no |
| fridge | 600 700 900 | 1800 | 650 | 0 | no |
| range | 600 900 | 860 | 600 | 0 | no |
| dishwasher | 450 600 | 820 | 560 | 0 | yes |
| hood | 600 900 | 690 | 500 | 1510 (editable) | no |

Worktop: 40 mm thick, 20 mm front overhang, top at 860 mm with standard units.

## Invariants (`constraints/validate.ts`)

1. Every element lies inside the room walls and below the ceiling.
2. No two elements share volume (touching is allowed).
3. Every element has a supported size for its type.
4. Every material reference exists and has the right category.
5. Ids are unique and stable: editing never recreates an element.

A command is rejected if the resulting project has an issue the previous one did not have.
Loaded files are checked against the same rules and their issues are reported.

## Commands (`commands/schema.ts`)

`set_room`, `apply_layout`, `rename_project`, `add_cabinet`, `add_appliance`, `resize_cabinet`,
`resize_appliance` (width only), `move_entity` (onto/along a wall), `place_entity` (free-standing
x/z/rotation), `rotate_entity`, `set_interior`, `set_front_style`, `apply_interior_preset`,
`set_material` (shutters, many targets), `set_surface_material`, `remove_entity`.

Behaviour worth knowing:

- **Resize** keeps the element's id, its start along the wall, its back on the wall and its
  elevation. Units further along the same wall shift by the change in width so the run stays
  closed; if that pushes a unit past the wall end the resize is rejected with the overflow in mm.
- **set_room** keeps units on the right and front walls against their wall.
- **add_*** without a placement uses the first free spot (back, left, right, then front wall).
- Floor-standing units have a fixed elevation; only wall-hung units can be raised or lowered.
- Free-standing units resize keeping their back and left side; wall units keep their start along the wall.
- Interior invariants: sections fit the inside width, fittings stay inside the inside height and do
  not overlap; drawer units have solid fronts and no fittings. A resize that breaks them is rejected.
- Wall-hung units (wall cabinets, hoods) must have a `wallId`.

## Schema versions

`SCHEMA_VERSION = 2` (1→2 adds `interior` and `frontStyle`). Files are `{ format: "interior-studio/kitchen", schemaVersion, savedAt, project }`.
To change the persisted shape: bump the version, add `MIGRATIONS[oldVersion]`, add a test that
loads an old file.
