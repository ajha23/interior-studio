# 009 — Real-life interaction (open doors and drawers)

**Status:** Done

## User stories
- In Interact mode (hand tool, `H`) I click a door, drawer or appliance door and it opens like the real
  thing: doors swing on their hinges, drawers slide out with their box, inner drawers and baskets pull
  out, oven and dishwasher doors fold down, fridge and freezer doors swing.
- I grab a handle and drag: the part follows my hand along its real path, and stays where I let go.
- Pulling an inner drawer behind a closed door opens the door first; closing a door more than half-way
  pushes the drawers behind it back in.
- I open or close everything at once (toolbar, `open all` / `close all`), or one unit from the side panel,
  where every door and drawer is also listed as a toggle (keyboard-accessible).
- Opening things never changes the design: it is not saved, not undoable and does not mark the project dirty.

## Acceptance
- A click on a drawer opens it; a second click closes it; Undo stays disabled and the project stays "Saved".
- Opening an inner drawer opens its door; closing the door closes the drawer.
- Open all opens the fridge; `close all` closes it.
