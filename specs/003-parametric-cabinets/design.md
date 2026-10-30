# 003 — Design

- Specs table: `domain/furniture/specs.ts` (`CABINET_SPECS`, `APPLIANCE_SPECS`, `dimensionErrors`).
- Factory and auto-placement: `domain/furniture/factory.ts` (`makeCabinet`, `makeAppliance`,
  `findFreePlacement`: candidate offsets are the wall start, ends of units on that wall, and far
  edges of all units along the wall axis, to clear corners).
- Presets: `domain/project/presets.ts` (slot tables per layout; L-shaped left run starts at
  base depth + overhang so worktops meet).
- Commands: `add_cabinet`, `add_appliance`, `resize_cabinet`, `resize_appliance`, `move_entity`,
  `remove_entity` in `domain/commands/execute.ts`.
- Geometry: `engine/geometry/parts.ts` → `Part[]` in a local mm frame; `body` parts make up the
  nominal box. Rendered by `rendering/cabinets/ElementModel.tsx`.
- Selection: click (R3F raycast), plan SVG, or scene list → `select(id)`; highlight box + DOM labels.
