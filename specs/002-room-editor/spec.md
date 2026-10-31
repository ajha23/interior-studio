# 002 — Room editor

**Status:** Done (M1)

## User stories
- As a designer, I create a project by entering the room's inside width, length, ceiling height and
  wall thickness, and choosing a starting layout.
- As a designer, I change the room size later and the kitchen stays consistent.

## Requirements
- Room limits: width/length 1500–12000 mm, height 2100–4000 mm, wall thickness 50–400 mm.
- Inputs accept whole millimetres only; anything else is refused before reaching the project.
- Changing the room keeps units on the right and front walls against their wall.
- A room change that would leave a unit outside the walls is rejected with a message; the room stays
  as it was.
- The 3D view shows floor, back/left/right walls (front open), a 100 mm / 1 m grid and labels with
  the room width and length. The status bar shows W × L × H.

## Acceptance criteria
- Entering 4500 mm width updates the 3D label, status bar and plan dimension to 4500.
- Setting width 3000 on a 3900 mm straight run is rejected and the field shows the previous value.
