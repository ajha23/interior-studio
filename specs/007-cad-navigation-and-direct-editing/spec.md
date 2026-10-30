# 007 — CAD-style navigation and direct editing

**Status:** Done

## Problem
Designers could not get to a unit in 3D and work on it: the camera had only fixed presets, walls
blocked the view when orbiting, and every edit had to go through the side panel.

## User stories
- I double-click a unit (or press **F**) and the camera flies to it and orbits around it.
- I press **Home** (or type `ze`) to see the whole room again (AutoCAD Zoom Extents).
- I click a ViewCube face/edge/corner to jump to a standard or isometric view.
- I switch between perspective and parallel (orthographic) projection for measured views.
- Walls between the camera and the room hide automatically, so I can always see inside.
- I switch visual style: Realistic, Shaded with edges, X-ray.
- I drag a unit along its wall in 3D or in the plan; it snaps to neighbours, wall ends and a 10 mm
  grid, shows the live offset, turns red where it cannot go, and commits as one undo step.
- I drag the grip at the end of the selected unit to change its width; it snaps to supported widths.
- I type AutoCAD-style commands (`w 900`, `m 1200`, `m +50`, `e`, `u`, `ze`, `f`, `top`, `xray`,
  `finish oak`, `add base 600`, `room 4500 3200`) and Enter on an empty line repeats the last one.
- I press **Tab** / **Shift+Tab** to cycle through units; the plan zooms with the wheel and pans by
  dragging empty space.

## Rules
- Every edit still goes through `executeCommand`; drags and grips preview with the same validation
  and commit once on release. Invalid drops are rejected with the usual message.
- Navigation and view settings are not part of the project and are not undoable.

## Acceptance criteria
- Focus: after focusing a unit, clicking the centre of the viewport selects that same unit.
- Drag in the plan moves a unit along its wall, snapping flush to its neighbour within tolerance; undo restores it.
- Grip drag changes width only to supported widths.
- `w 900` on a selected base cabinet resizes it; `w 650` shows the supported-size error.
