# 010 — Design

- `rendering/scene/walk.ts` (pure, tested): poses (yaw 0 = towards the back wall), collision against
  floor-unit footprints and walls with a 200 mm body radius, sliding steps, start pose, stand-in-front.
- `WalkControls` replaces the orbit camera rig: 70° FOV perspective camera at eye height; keyboard,
  look-drag (window listener that yields to unit drags/grips/door pulls via `pointerClaim`), wheel
  steps, and eased glides for requests (`start`, `stand`, `goto`, `pose`). Publishes the pose ~8×/s.
- Store: `navMode`, `eyeHeight`, `walkPose`, `walk` request. Standard views/zoom extents end a walk;
  `focusSelection` means "stand at it" while walking.
- Viewpoints: `project.viewpoints` (optional, defaulted — no schema bump), `save_viewpoint` /
  `delete_viewpoint` commands (undoable). UI: Views menu; mini-map overlay.
