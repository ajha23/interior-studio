# 007 — Tests

- Unit: snapping candidates and tolerance; grid fallback; width snapping (`engine/snapping`).
- Unit: camera goals (fit contains the room; focus looks at the element from its front) (`cameraViews.test.ts`).
- Unit: command-line parser — aliases, relative moves, finishes by name, errors (`parseCommandLine.test.ts`).
- Component: command line resizes the selection; repeat-last with empty Enter.
- E2E: focus then centre-click selects the same unit; plan drag snaps and undoes; command line edits.
