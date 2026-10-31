# 011 — Wall openings (doors, windows, archways)

**Status:** Done

## User stories
- I add a door, a window or a plain opening to any wall from the library (or `add door 900`), and see
  it cut into the wall in 3D, drawn on the plan (door swing arc, window glazing), and walkable in walk mode.
- I select an opening and set its wall, position along the wall, width, height, sill height and,
  for doors, which side it hinges on and whether it swings into the room.
- I drag an opening along its wall in the plan; it snaps to the wall ends and the grid.
- Units cannot block openings: a base unit cannot stand in a doorway or in an inward door's swing,
  a wall cabinet cannot cover a window, a tall unit cannot stand in front of a window. Base units
  under a window are fine when the worktop is below the sill. Edits that would break this are rejected
  with a message naming the opening.
- In Interact mode, room doors open like the cabinet doors do.

## Acceptance
- Adding a window to the back wall cuts a hole in the 3D wall and draws it on the plan.
- Moving a base cabinet into a doorway is rejected: "Base cabinet 600 blocks the door on the right wall."
- A wall cabinet dragged over a window is rejected; a base cabinet under a 1000 mm sill is allowed.
- Files saved before openings existed load with no openings.
