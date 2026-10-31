# 014 — Phase 1 gaps: units, split view, walls, room presets, furniture, responsive layout

**Status:** Done

Closes the gaps found when checking the build against the "Phase 1 — Precision Foundation" prompt.

## Requirements
1. **Measurement system.** Display and entry in mm, cm, m, in, ft and ft-in. Storage stays integer
   millimetres. Entry is parsed exactly, then rounded once to the nearest millimetre (halves away from
   zero): 100 cm → 1000 mm; 12 ft → 3657.6 mm → stored 3658 mm; 12 ft 6 in → 3810 mm. Imperial
   display is shown to the nearest 1/16". The unit is a project preference; changing it never changes
   geometry. Every length field accepts any unit (`12' 6"`, `381 cm`, `3.81 m`); bare numbers use the
   display unit (inches in ft-in mode, as in CAD).
2. **Split view** — plan and 3D side by side, both interactive.
3. **Plan grid** (100 mm cells, 1 m lines) and **wall labels** on the plan.
4. **Walls as selectable entities** with stable ids (`wall-back`, …): click in the plan or 3D to
   inspect length, height, thickness and what is on the wall; add a door or window to it.
5. **Room-size presets** on the new-project screen and the room panel.
6. **Furniture**: dining table, chair and sofa as free-standing, resizable, finishable entities.
7. **Responsive layout**: side panels collapse below 1280 px and open as drawers.
8. Tests: conversions and parsing, unit switching without geometry change, plan↔3D agreement, and an
   end-to-end run of the Phase 1 acceptance criteria (12 ft × 10 ft room).
