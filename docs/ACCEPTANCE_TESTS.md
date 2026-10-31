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
| Add a window / door | Lands on a free wall, cut into the 3D wall, drawn on the plan | `e2e/openings.spec.ts`; `engine/geometry/walls.test.ts` |
| Unit in a doorway or door swing | Rejected, naming the opening | `e2e/openings.spec.ts`; `domain/openings.test.ts` |
| Wall cabinet over a window / base unit under it | Rejected / allowed | `domain/openings.test.ts` |
| Drag an opening on the plan | Slides along its wall with snapping; undoable | `e2e/openings.spec.ts` |
| Room door leaf | Swings in or out on the chosen hinge side; opens in Interact | `engine/geometry/walls.test.ts`; `e2e/openings.spec.ts` |
| Default layouts and example kitchen | No design warnings | `engine/checks/designChecks.test.ts` |
| Island too close to a run | Walkway and door/drawer clearance warnings; edit not blocked; undo clears | `e2e/checks.spec.ts`; `engine/checks/designChecks.test.ts` |
| Wall cabinet low over worktop / hood height / tall unit beside hob | Warned with the measured distance | `engine/checks/designChecks.test.ts` |
| Back-wall elevation | Units at their offsets, width chain sums to the wall, 860 mm worktop mark | `engine/production/production.test.ts`; `e2e/drawings.spec.ts` |
| Elevations drawn from inside the room | Left wall: back corner on the right | `engine/production/production.test.ts` |
| Cut list for a 600 × 720 × 560 base | Sides, top, bottom, back, shelf, door, plinth; 2 hinges, 1 handle, 4 supports, 4 legs | `engine/production/production.test.ts` |
| Cabinet schedule and references | C1… / A1… in reading order; shown on plan, elevations and schedule | `engine/production/production.test.ts`; `e2e/drawings.spec.ts` |
| Cut list CSV | Downloads with one line per panel group | `e2e/drawings.spec.ts` |
| Phase 1 brief, criteria 1–8 | 12 × 10 ft room; ft-in ↔ cm ↔ mm with geometry unchanged; split 2D/3D; door, window, cabinet; edit in ft-in; both views update; undo/redo; save and reload | `e2e/phase1-acceptance.spec.ts` |
| Unit conversion and parsing | 100 cm = 1000 mm; 12 ft = 3657.6 → 3658 mm; 12 ft 6 in = 3810 mm; feet-inch forms; errors | `engine/measurement/units.test.ts` |
| Unit switching | Geometry identical in every unit | `domain/domain.test.ts` › measurement preferences |
| Plan and 3D agree | Every element's 3D body matches its plan footprint, also after edits | `engine/geometry/sync.test.ts` |
| Walls | Selectable in the plan; inspector edits room size; add an opening to that wall | `e2e/phase1-acceptance.spec.ts` |
| Furniture | Added on free floor, resized, finished, removed; loads from older files | `domain/domain.test.ts` › furniture |
| Phase 2 A: "Create a 900 mm base cabinet" | Real cabinet in the project, shown in plan and 3D, inspectable | `state/assistant.test.ts` › A; `e2e/assistant.spec.ts` |
| Phase 2 B: "Make it 750 mm high" | That cabinet only is resized | `state/assistant.test.ts` › B; `e2e/assistant.spec.ts` |
| Phase 2 C: "Move the refrigerator 600 mm to the right" | Exactly 600 mm along its wall; blocked moves rejected | `state/assistant.test.ts` › C; `e2e/assistant.spec.ts` |
| Phase 2 D: "Change all measurements to feet and inches" | Display changes, geometry identical | `state/assistant.test.ts` › D; `e2e/assistant.spec.ts` |
| Phase 2 E: "Add a cabinet that overlaps the door" | Rejected, collision explained, verified alternatives | `state/assistant.test.ts` › E; `ai/ai.test.ts`; `e2e/assistant.spec.ts` |
| Phase 2 F: "Undo the last operation" | Whole preceding transaction reverted | `state/assistant.test.ts` › F; `e2e/assistant.spec.ts` |
| Assistant schema, conversion, references, ambiguity | Invalid output rejected; units → mm; ambiguity asks | `ai/ai.test.ts`; `ai/providers/rules.test.ts` |
| Batch rollback, locks, stale previews, approve/reject, auto-apply | No partial commits; locked walls refused; stale previews re-checked | `ai/ai.test.ts`; `state/assistant.test.ts` |
| Provider errors and server endpoint | Rate limits, timeouts, malformed output, refusals; limits, origin, rate limiting | `server/assistantHandler.test.ts`; `state/assistant.test.ts` |
| Phase 3: speak a change | Transcript shown live, sent once (duplicate finals ignored), normal preview, "apply" commits, undo by voice | `e2e/voice.spec.ts`; `state/voice.test.ts`; `features/assistant/VoiceControls.test.tsx` |
| Voice states and fallbacks | Permission → listening → processing → speaking; unsupported browser = text only; blocked/missing microphone explained | `state/voice.test.ts`; `VoiceControls.test.tsx`; `e2e/voice.spec.ts` |
| Interim, cancel, timeout, partial | Never submitted; partial goes to the message box | `state/voice.test.ts` |
| Spoken dimensions | Units and values kept (12.5 ft ≠ 12 ft 5 in); nothing invented | `voice/normalize.test.ts` |
| Ambiguity, invalid geometry, selection/project changes | Question asked; model unchanged; request-time selection; stale replies dropped | `state/voice.test.ts` |
| Phase 4 acceptance: L → U in a 12 × 10 ft room, sink wall and fridge kept, storage, clearances | Several valid U options with scores and changes; preview in plan/3D without changing the design; one applied atomically; undo/redo | `ai/layout/layout.test.ts`; `state/layouts.test.ts`; `e2e/layout.spec.ts` |
| Infeasible U | Explained with the measurement; relaxations suggested; L-shape alternatives flagged | `ai/layout/layout.test.ts`; `e2e/layout.spec.ts` |
| Intent → objective; missing/contradictory information | Structured objective; questions instead of guesses | `ai/layout/layout.test.ts` |
| Hard vs soft constraints; overlap, boundary, opening, clearance, walkway detection | Hard violators never offered | `ai/layout/layout.test.ts` |
| Preserved appliances / walls / scope; U → L; fix issues; move towards entrance; new layouts for a room size | Constraints held in every option | `ai/layout/layout.test.ts` |
| Ranking, determinism, dedupe, limits, cancellation, stale options, refinement | As described in docs/LAYOUT_AGENT.md | `ai/layout/layout.test.ts`; `state/layouts.test.ts` |
| Phase 5 acceptance (12 × 10 ft L kitchen) | Dimensioned plan and elevation; schedule; BOM for verified rules (blind corner left out); readiness; PDF and CSV exports; edit → stale; regenerate; drawings and schedule match the model | `e2e/deliverables.spec.ts`; `engine/deliverables/deliverables.test.ts`; `state/deliverables.test.ts` |
| Plan proportions, overall/segment dimensions, unit formatting, elevation positions | From canonical geometry | `engine/deliverables/deliverables.test.ts` |
| Missing measurements | Reported, drawing left out, not invented | `engine/deliverables/deliverables.test.ts` |
| BOM rules, unsupported types, no double counting, verified cut-list fixture | As in docs/DELIVERABLES.md | `engine/deliverables/deliverables.test.ts`; `e2e/drawings.spec.ts` |
| PDF / SVG / CSV structure and escaping | Valid PDF with xref and vector content; SVG well-formed, paper viewBox, escaped; CSV quoting and formula safety | `engine/deliverables/deliverables.test.ts` |
| Revisions, stale outputs, approved revisions, readiness per output | Blocking incomplete manufacturing | `engine/deliverables/deliverables.test.ts`; `state/deliverables.test.ts` |
| Chat/voice deliverable requests; presentation mode | Typed requests; replies from the engine; editing hidden | `state/deliverables.test.ts`; `e2e/deliverables.spec.ts` |
| 020 client package: create, rename/reorder pages, title block, note, move a dimension label (value unchanged), undo/redo, design edit → only affected pages stale, regenerate keeps edits, package PDF, reopen | As in docs/DELIVERABLES.md › Client packages | `e2e/package.spec.ts`; `engine/package/package.test.ts`; `persistence/projectDb.test.ts` |
| 020 chat/voice package edits (notes, orientation, dimension label moves, image size, new elevation, title block, regenerate from approved, outdated pages) | Typed edits; questions when ambiguous; Apply for broad or destructive ones; design untouched | `state/packageAssistant.test.ts`; `e2e/package.spec.ts` |
| Package file safety; edits whose element changed; boards, snapshots, missing images | Sanitised or rejected; flagged, never misapplied; reported on the page | `engine/package/package.test.ts` |

Run everything: `npm run check && npm run e2e`.
