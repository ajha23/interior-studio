# 018 — Production deliverables (Phase 5)

**Status:** Done (first vertical slice). Guide: [docs/DELIVERABLES.md](../../docs/DELIVERABLES.md). Builds on 013.

Designers produce client- and workshop-facing outputs from the canonical model without redrawing:
dimensioned plan, wall elevations, schedule, BOM and cut list, readiness, PDF/SVG/CSV exports with
revision traceability, stale detection, approved revisions, presentation mode, chat/voice requests.

## Requirements (as implemented)
1. Framework-free `engine/deliverables`: drawing model (primitives in model mm, typed dimensions with
   value + text), projection (plan, elevations), dimensioning, schedule, construction rules, BOM,
   readiness, revisions, SVG/PDF/CSV writers, set assembly.
2. Plan: walls with thickness and opening gaps, doors (leaf + swing), windows, worktops, units,
   furniture, tags; tiers of opening chain, unit chain, internal overall, external overall; wall
   thickness; configurable annotations; scale fit to standard 1:n or chosen; A3/A4; title block.
3. Elevations of selected walls from the existing projection; missing measurements reported.
4. Schedule: typed fields (known / unspecified / n/a), runs, hardware references, manufacturing
   status, filters, sorting, grouping, column choice, revision.
5. Construction rules explicit (`frameless-18`), verified per cabinet type; cut list and BOM only for
   verified types; unsupported types flagged; calculated vs estimated; formulas; waste and prices only
   when configured; no double counting; fillers from real gaps.
6. Readiness per output (presentation, drawings, manufacturing): blocking / warning / info.
7. Revisions: content-hash ids; every file records revision, time, units, format, config, readiness;
   history with stale detection and regeneration; approved revisions (snapshots) as a source.
8. Exports: vector PDF (own writer), SVG (escaped), CSV (escaped, UTF-8, formula-safe).
9. Presentation mode on the existing 3D renderer; labelled PNG snapshots.
10. Chat/voice: typed `deliverables` tool; replies computed by the engine.
