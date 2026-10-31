# 004 — Materials and selection

**Status:** Done (M3–M4)

## User stories
- As a designer, I change a cabinet's shutter finish without the unit changing size or position.
- As a designer, I apply one finish to every cabinet.
- As a designer, I set the worktop, carcass, floor and wall finishes for the whole room.

## Requirements
- Finishes are project data (`project.materials`), copied from the starter library at creation.
- Categories: shutter, carcass, countertop, floor, wall. Using a finish in the wrong category is
  rejected. Appliance finishes are fixed.
- Swatch pickers are radio groups (keyboard and screen-reader accessible).
- Selection works from the 3D view, the plan and the scene list; Esc clears it.

## Acceptance criteria
- Picking "Natural oak" changes `materialId` only; dimensions and position are identical.
- Picking a floor finish for a shutter is rejected with a readable message.
