# 004 — Design

- Commands: `set_material { targetIds, materialId }` (shutters; many targets, one undo step) and
  `set_surface_material { surface, materialId }`.
- Library: `domain/materials/library.ts`; defaults in `DEFAULT_SURFACES`, `DEFAULT_SHUTTER`.
- Rendering: `rendering/materials/useSceneMaterials.ts` creates one `MeshStandardMaterial` per
  finish and disposes them on change. Metalness is low because there is no environment map yet.
- UI: `features/material-editor/FinishPicker.tsx`.
