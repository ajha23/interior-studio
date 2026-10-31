# 011 — Tasks

- [x] Domain: opening schema, specs, rules, commands + tests
- [x] Wall pieces and opening geometry + tests
- [x] 3D walls with holes, door/window models, selection, door leaves in Interact
- [x] Plan drawing and drag; inspector; library; command line
- [x] Example kitchen gets a window and a door
- [x] E2E and docs

## Found while building

- [x] The new front wall, hidden from the default camera, still caught 3D clicks (raycasting ignores visibility): cut-away walls now move to a layer clicks never test.
- [x] Base units on a 100 mm plinth slipped past the door-swing check: the check now covers floor and plinth-height units.
- [x] The middle of a door symbol on the plan was not clickable: the swing wedge is now a click target.
