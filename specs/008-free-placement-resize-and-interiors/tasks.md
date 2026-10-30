# 008 — Tasks

- [x] Schema 2, migration 1→2, interior module (rules, presets) + tests
- [x] Width ranges with standard snap sizes (supersedes D-005)
- [x] Commands: place, rotate, set interior/front, presets; free resize anchoring; free worktops
- [x] Placement snapping (wall capture, alignment) + tests
- [x] Geometry: hollow carcass, dividers, fittings, glass/open fronts
- [x] 3D: drag anywhere, W/H/D grips, rotate, show interiors
- [x] Plan: drag anywhere with the same snapping
- [x] Inspector: placement modes; interior editor with draggable elevation
- [x] Command line additions
- [x] Docs, acceptance, e2e

## Found while building

- [x] Thin glass shelves were too small to grab in the elevation: fittings now have a 25 mm invisible hit margin.
- [x] Odd widths put footprint centres on half millimetres: centres validated as multiples of 0.5 mm (D-009).
