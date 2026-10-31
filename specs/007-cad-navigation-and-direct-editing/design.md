# 007 — Design

- **View state** (`state/editorStore.ts`): `visualStyle`, `projection`, `autoHideWalls`, `camera`
  request (`preset | fit | focus`), and a transient `preview` (drag/grip in progress) that is never
  in history.
- **Camera maths** (`rendering/scene/cameraViews.ts`, pure): goal position/target for presets, fit
  (bounding sphere of the room) and focus (element box, viewed from its front, slightly above).
  `CameraRig` animates to the goal and stops if the user grabs the controls; it supports a
  perspective and an orthographic camera (zoom-based fit). ViewCube = drei `GizmoViewcube`.
- **Snapping** (`engine/snapping/alongWall.ts`, pure): candidate offsets = wall start/end, flush
  against each neighbour on the same wall, clear of units on the perpendicular walls; nearest within
  tolerance wins, otherwise the 10 mm grid. Width grips snap to the spec's supported widths.
- **Direct manipulation** (`rendering/selection/DragControls.tsx`, `Grips.tsx`): pointer capture, ray
  ∩ horizontal plane → along-wall coordinate → snap → `preview` (validated by a dry-run
  `executeCommand`) → commit `move_entity` / `resize_*` on release. Orbit controls pause while dragging.
- **Wall cut-away** (`RoomShell`): per frame, a wall hides when the camera is on its outside.
- **Visual styles**: material opacity for X-ray; drei `Edges` on parts for "edges".
- **Command line** (`features/command-line/`): pure parser → `design | view | history | select | help`
  actions; history with ↑/↓; Enter on empty repeats.
- **Plan** zoom/pan via viewBox state; drag uses the same snapping and preview.
