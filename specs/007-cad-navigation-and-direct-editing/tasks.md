# 007 — Tasks

- [x] Store: view settings, camera requests, transient preview
- [x] Snapping engine + tests
- [x] Camera maths + tests; animated CameraRig with focus/fit/presets, ortho, ViewCube
- [x] Wall cut-away; visual styles (realistic, edges, x-ray)
- [x] 3D drag-to-move and width grip with live dynamic-input label
- [x] Plan zoom/pan and drag-to-move
- [x] Command line parser + UI + tests
- [x] Shortcuts: F, Home, Tab/Shift+Tab, X, `/`, double-click focus
- [x] Docs, acceptance table, e2e

## Bugs found while building

- [x] Orbiting the camera from the floor cleared the selection (R3F fires `onClick` after a drag); floor and wall clicks now require `delta < 4`.
- [x] Dropping a dragged unit where it cannot go now snaps it back instead of reporting an error.
