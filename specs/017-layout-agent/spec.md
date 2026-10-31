# 017 — Autonomous layout design (Phase 4)

**Status:** Done (deterministic planner, first set of transformations). Guide: [docs/LAYOUT_AGENT.md](../../docs/LAYOUT_AGENT.md)

A designer states a whole-layout goal by text or voice ("convert this L into a U, keep the sink wall,
keep the fridge, maximise storage"). The assistant turns it into a `DesignObjective`; a deterministic
planner generates candidate layouts as ordinary `DesignCommand`s on isolated copies, checks them
against hard constraints, scores the valid ones and shows them for preview, comparison and approval.

## Requirements
1. Zod `DesignObjective` (topology, preserved objects/walls, sink wall, scope, priorities, walkway,
   clearance mode, move-near, fix issues, room size, alternatives, budget); never invents measurements;
   asks when information is missing or contradictory.
2. Constraint engine with explicit hard rules (geometry, catalogue sizes, openings, door/drawer
   clearance, walkway, preserved objects, sink wall, preserved walls, scope, room size) and soft ones
   (heights, landing, work triangle); sources stated; codes not asserted; unknowns listed.
3. Generators: L/straight → U/L (extend runs), U → L / L → straight (remove a run), storage in place,
   fix collisions/clearances, move a unit towards the entrance, reposition islands, fresh layouts for a
   room size. Variant search through the constraint engine.
4. Metrics from geometry (storage volume, worktop, walkway, triangle, indicative cost); normalised,
   documented scores; hard violators never ranked; duplicates removed; limits; cancellation; progress.
5. Infeasible requests explained with the measurement, relaxations suggested (never applied), and
   alternatives in the current shape flagged as such.
6. UI: interpretation, comparison table, cards with plan thumbnails, preview in the real plan/3D views
   via an uncommitted `preview` (banner), apply/reject; refine (another option, option N but…).
7. Apply: revision check (stale → regenerate), re-validation, atomic `applyTransaction`, one undo step.
8. Tests for intent, constraints, transformations, infeasibility, preservation, ranking, dedupe,
   cancellation/stale, previews, apply/undo, 2D/3D agreement; Playwright acceptance.
