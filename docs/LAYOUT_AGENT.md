# Layout design agent (Phase 4)

Whole-layout goals ("convert this L-shaped kitchen into a U", "maximise storage", "give me three
alternatives", "find and fix all collisions") go through the same assistant as single edits, by text
or voice. Reasoning and geometry are separate:

```
request ─► provider (rules or Claude) ─► DesignObjective (Zod)            interpretation only
        ─► planner (src/ai/layout/planner.ts)                              deterministic
             resolve references; ask if something is missing or contradictory
             generators propose DesignCommand lists ─► executeBatch on an isolated copy
             constraint engine (hard/soft) ─► reject / score ─► dedupe ─► rank
        ─► layout options in the panel: interpretation, comparison, previews (plan + 3D)
        ─► Apply: revision check (stale → regenerate) ─► re-validate ─► applyTransaction (one undo step)
```

The model never touches geometry: it fills the objective (`plan_layout` tool), and only the planner
and the existing command engine create, check and commit changes. Candidates are not saved; the
project changes only when one is applied.

## Objective (`DesignObjectiveSchema`, src/ai/schema.ts)
`topology` (keep, straight, l-shaped, u-shaped, galley), `keepSinkWall`, `preserve` (references),
`preserveAppliances`, `preserveWalls`, `scope` (all, upper-only, base-only), `priorities` (storage,
counter, workflow, budget, accessibility), `minWalkway` (a length from the designer), `clearances`
(hard or soft), `moveNear`, `fixIssues`, `roomSize` (from the designer), `repositionIsland`,
`alternatives` (1–5), `budget`. Refinements (`refine.option`, `refine.another`) build on the last
options: "show me another option with more storage", "I prefer option two, but keep the refrigerator
where it is", "use the previous layout, but change only the upper cabinets". "Apply option two" applies
directly (typed or spoken).

## Constraints (src/ai/layout/constraints.ts)
| Rule | Kind | Source |
| --- | --- | --- |
| Inside the room / below the ceiling; no overlaps | hard | geometry |
| Supported unit sizes | hard | catalogue (`furniture/specs.ts`) |
| Doors, windows and door swings clear | hard | geometry (700 mm zone, inward swing) |
| Cabinet doors and drawers open freely | hard (or soft on request) | design guidance, swept from the 3D hinge/slide geometry |
| Walkway in front of every run (900 mm default) | hard (or soft) | design guidance, configurable; a designer value is always hard |
| Preserved objects, sink wall, preserved walls, scope, room size | hard | the designer |
| Wall-cabinet/hood heights, landing space, work triangle | soft | design guidance |

Not checked (reported as such): appliance installation clearances (need model data), local
building/electrical/gas/fire regulations, plumbing routes beyond "sink stays on its wall".

## Transformations (src/ai/layout/generators.ts)
- **Extend runs**: single-wall → L or U, L → U. Each U orientation that contains the current runs is
  tried (e.g. "opening to the front" or "to the right"); for each, strategies (most storage: drawers,
  wall cabinets and a tall unit; most worktop: base units and wall cabinets; lowest cost: fewest, wider
  base units), corner clearances (0–900 mm extra to clear neighbouring doors/drawers) and depths (560,
  450, 350 mm) are searched through the constraint engine. Doors split a wall into free stretches.
  A new run opposite an existing one is pre-checked: if even 350 mm units leave less than the walkway,
  the reason is reported with the numbers.
- **Remove a run**: U → L, L → single-wall; never a run holding something preserved or the sink.
- **Storage in place**: wall cabinets over runs where the wall is free (windows excluded), runs
  extended into free wall.
- **Fix issues**: move each unit in a hard problem to the nearest offset that clears it; or remove.
- **Move towards the entrance** (or sink/range/fridge): a free spot, or a swap with base units.
- **Reposition islands**: grid search for the widest walkways.
- **New layouts** for a designer-given room size (or an empty room): single-wall, L and U with sink,
  dishwasher, range + hood and refrigerator, a blind corner unit where its blind side meets the other leg.

## Scores (src/ai/layout/score.ts)
Each 0–100 from measured metrics (src/ai/layout/metrics.ts); shown on every option with the method:
storage (inside cabinet volume, sink units half), worktop length, workflow (sink–hob–fridge legs and
total against 1.2–2.7 m / 4.0–7.9 m), accessibility (narrowest walkway; 70 at the required width, 100
at 1.2 m), compliance (100 − 10 per soft warning), your priorities (50/30/20 % in your order).
Total = 40 % priorities + 15 % each of storage, workflow, accessibility, compliance. Costs use a
placeholder price table (indicative, configurable). Options breaking a hard rule are listed as
"not offered" with reasons, never scored.

## Safety and limits
Candidates run on immutable copies; previews use the editor's transient `preview` (banner: "the active
design is unchanged"); any real edit ends a preview. Applying checks the revision (stale options are
regenerated, not applied), re-validates against the current design, and commits with
`applyTransaction` (all or nothing, one undo step). Planning yields between steps, reports progress,
stops on Cancel, caps checks (4,000) and time (8 s), and drops results if the project or
conversation changed meanwhile. Ids of new units are random by default, deterministic in tests.

## Limitations
- Rectangular rooms only; no peninsulas, no new islands, no galley conversion yet.
- Existing appliances stay where they are except when moving one towards the entrance; the planner
  does not re-sequence appliances inside a run.
- Where a new run meets an existing run with a door or drawer at the corner, the new run starts
  further along (searched) rather than substituting a blind corner unit.
- Heuristic search, not an exhaustive constraint solver; the generator interface allows one later.
- Storage and cost figures are comparative indicators, not specifications or quotes.
