# Acceptance tests

Every scenario is an executable test. "Looks right" in the viewport is not acceptance; dimensions
are checked against the domain model independently of rendering.

| Scenario | Expected result | Covered by |
| --- | --- | --- |
| Enter a room dimension | Room, status bar and 3D scale labels update consistently | `e2e/kitchen.spec.ts` › create a room…; `rendering/selection/labels.test.ts` |
| Create a 600 × 720 × 560 mm cabinet | Domain dimensions and generated geometry match exactly | `engine/geometry/geometry.test.ts` |
| Every supported size of every unit type | Body geometry equals the domain dimensions | `engine/geometry/geometry.test.ts` |
| Resize a cabinet to 900 mm | Same id, new dimensions, run shifted, worktop and BOM updated | `domain/domain.test.ts` › resizing; `ElementInspector.test.tsx`; e2e |
| Set an invalid width (650 mm) | Edit rejected with the supported list; previous state kept | `domain/domain.test.ts`; `ElementInspector.test.tsx`; e2e › invalid edits |
| Non-integer or non-numeric input | Rejected before reaching the project | `domain/domain.test.ts`; `ElementInspector.test.tsx` |
| Resize that overflows the wall | Rejected, naming the unit pushed out and by how much | `domain/domain.test.ts` |
| Shrink the room below the kitchen | Rejected; room unchanged | `domain/domain.test.ts`; e2e › invalid edits |
| Change shutter finish | Material changes; dimensions and position do not | `domain/domain.test.ts`; `ElementInspector.test.tsx` |
| Overlapping or out-of-room move | Rejected | `domain/domain.test.ts` › adding, moving and removing |
| L-shaped corner | Worktops meet without overlapping | `domain/domain.test.ts` › countertops |
| Save and reload | Entities and material assignments preserved | `persistence/projectDb.test.ts`; e2e › save and reopen |
| Undo a resize (and a sequence of dependent edits) | Previous dimensions and worktop restored; redo re-applies | `state/editorStore.test.ts`; e2e |
| Apply a command (AI-ready path) | Command is Zod-validated before any state change | `domain/domain.test.ts` › malformed commands |
| Generate BOM | Counts and dimensions match the project model | `domain/domain.test.ts` › BOM; e2e |
| Invalid project files | Bad JSON, wrong format, newer schema, bad values rejected with readable errors | `domain/project/serialization.test.ts` |
| Select by clicking 3D geometry | Inspector opens with live W/H/D labels | `e2e/kitchen.spec.ts` › clicking rendered 3D geometry |
| Focus a unit (F / double-click) | Camera frames it; clicking the viewport centre selects it | `e2e/navigation.spec.ts` › focus; `rendering/scene/cameraViews.test.ts` |
| Drag a unit along its wall in 3D | Live readout; one undo step restores it | `e2e/navigation.spec.ts` › drag a unit |
| Drag in the plan | Snaps to wall end/neighbours within 12 px; undo restores | `e2e/navigation.spec.ts` › drag in the plan; `engine/snapping/alongWall.test.ts` |
| Width grip | Width changes only to supported module widths | `e2e/navigation.spec.ts` › width grip; `engine/snapping/alongWall.test.ts` |
| Command line | Aliases edit the selection, validation errors shown, Enter repeats | `e2e/navigation.spec.ts` › command line; `features/command-line/parseCommandLine.test.ts` |
| Orbiting the camera | Does not clear the selection | `e2e/navigation.spec.ts` › width grip (selection survives the drag) |
| Drag a unit into the room / onto another wall | Becomes free-standing; near a wall it snaps on facing the room; undo restores | `e2e/placement-and-interiors.spec.ts`; `engine/snapping/placement.test.ts` |
| Rotate a free unit | 90° steps; wall-hung units refuse | `e2e/placement-and-interiors.spec.ts`; `domain/domain.test.ts` › free placement |
| Height/width/depth grips | 10 mm steps within range; width snaps to standard sizes nearby | `e2e/placement-and-interiors.spec.ts`; `e2e/navigation.spec.ts` |
| Custom width (650 mm) | Accepted; out-of-range rejected with the range | `domain/domain.test.ts` › custom widths |
| Crockery preset | Glass doors, plate rack, glass shelves | `domain/domain.test.ts`; `ElementInspector.test.tsx`; e2e |
| Drag a shelf in the interior elevation | Moves it; overlapping drops rejected | e2e › crockery; `ElementInspector.test.tsx` |
| Every preset on every type and height | Valid interior | `domain/domain.test.ts` › cabinet interiors |
| Lower a cabinet through a shelf | Rejected, naming the shelf | `domain/domain.test.ts` › blocks a resize |
| Schema-1 file | Loads with default interiors and solid fronts | `domain/domain.test.ts` › migrates |
| Open a drawer by clicking it (Interact) | Opens, second click closes; project stays Saved, Undo disabled | `e2e/interact.spec.ts` |
| Inner drawer behind a door | Door opens first; closing the door pushes the drawer in | `e2e/interact.spec.ts`; `state/openings.test.ts` |
| Every moving part | Belongs to a mover with correct hinge side / slide / drop direction | `engine/geometry/mechanics.test.ts` |
| Open all / close all | Every door and drawer, from toolbar and command line | `e2e/interact.spec.ts` |
| Stand at the range (walk, F) | In front of it, an arm's length away, looking down at the cooktop | `e2e/walk.spec.ts`; `rendering/scene/walk.test.ts` |
| Walk with the keyboard / mini-map | Moves; never through units or walls | `e2e/walk.spec.ts`; `rendering/scene/walk.test.ts` |
| Interact and edit while walking | Drawer opens by hand; inspector edits apply | `e2e/walk.spec.ts` |
| Saved viewpoint | Returns to the same spot; saved with the project; undoable | `e2e/walk.spec.ts`; `domain/domain.test.ts` › viewpoints |

Run everything: `npm run check && npm run e2e`.
