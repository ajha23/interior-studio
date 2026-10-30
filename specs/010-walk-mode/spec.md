# 010 — Walk through the room

**Status:** Done

Inspired by walkthrough modes in interior and BIM tools: Coohom's 3D Walk (WASD + drag to look),
RoomSketcher Live 3D camera mode, SketchUp/KeyShot eye height, plan-based start points and Planner 5D
360 walkthrough camera positions.

## User stories
- I switch to Walk (`V`) and stand inside the room at eye height (standing 1.6 m, seated, child, or
  typed with `eye 1150`).
- I walk with W A S D, turn with Q / E or by dragging, hurry with Shift, step with the wheel, or click
  the floor / the mini-map to go there. I cannot walk through floor units or walls.
- I select a unit (e.g. the range) and press F or double-click it: I stand in front of it, an arm's
  length away, looking at its working height (the cooktop).
- From where I stand I can open doors and drawers (Interact, `H`), drag units and grips, and edit in
  the side panel or command line.
- I save where I stand as a named viewpoint ("At the hob") and jump back to it later; viewpoints are
  saved with the project.

## Acceptance
- F on the range stands in front of it; S steps back; the mini-map click moves me there.
- In walk mode a click on a drawer front opens it; the width field still edits the unit.
- A saved viewpoint brings me back to the same spot after Home.
