# 013 — Design

- `engine/drawings/elevation.ts`: `elevation(project, wallId)` → shapes in mm (rects, lines, texts, dimension lines, tags), viewer-right axis per wall so units are drawn as seen from inside.
- `engine/production/schedule.ts`: unit references and schedule rows (wall order).
- `engine/production/cutlist.ts`: panels from `buildModel` parts (sizes sorted into length × width × thickness, grouped), glass, worktops, hardware from movers/parts, board estimate, CSV.
- `features/drawings/DrawingsView.tsx`: sheet list, A3 sheet frame with title block, SVG renderers, print CSS, SVG/CSV downloads. View mode `drawings` in the top bar.
