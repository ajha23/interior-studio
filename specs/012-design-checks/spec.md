# 012 — Design checks (clearances and kitchen-planning rules)

**Status:** Done

Hard rules (overlaps, blocked doorways) reject an edit. Design checks are softer: they flag layouts
that would be awkward or unbuildable in use, and the designer decides.

## Checks
| Check | Rule (typical kitchen-planning guidance) |
| --- | --- |
| Door and drawer clearance | Every door must open to 90°, every drawer and pull-out must open fully, appliance doors must fold down, without hitting another unit or a wall. |
| Walkway | At least 900 mm between a unit front and the unit or island facing it. |
| Wall cabinet height | At least 450 mm between the worktop and the bottom of a wall cabinet above it. |
| Hood height | Cooker hood 650–750 mm above the hob. |
| Hob landing space | A tall unit or fridge directly beside the hob leaves no worktop to set pans down. |
| Work triangle | Sink, hob and fridge: each leg 1.2–2.7 m, total 4.0–7.9 m (information). |

## Experience
- Status bar and a **Checks** panel list every warning; "Show" selects the unit and frames it.
- The inspector lists the selected unit's warnings; the plan and 3D view outline the space a
  colliding door or drawer sweeps.
- Checks never block an edit and are recomputed after every change.
