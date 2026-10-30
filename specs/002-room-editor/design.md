# 002 — Design

- `RoomSchema` (Zod) carries the limits and readable messages.
- Command `set_room { room }`: shifts `wallId === 'right'` units by Δwidth on x and `'front'` units by
  Δlength on z, then the invariant check rejects anything outside the room.
- UI: `features/projects/ProjectsHome` (create form) and `features/room-editor/RoomPanel` (shown when
  nothing is selected) both use `MmField`, which commits on Enter/blur and reverts on Escape.
- Rendering: `rendering/scene/RoomShell` (walls, floor, grid); labels from
  `rendering/selection/labels.ts`.
