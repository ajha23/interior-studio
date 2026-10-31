# Deliverables (Phase 5)

Client- and workshop-facing outputs generated from the canonical project, never redrawn and never
taken from model text. Open **Deliverables** in the top bar, or ask the assistant ("generate a
dimensioned floor plan", "what is missing before I send this to the carpenter?").

## Architecture (`src/engine/deliverables`, framework-free)

| Concern | File |
| --- | --- |
| Drawing model: primitives, typed dimensions, text metrics, scales, sheets, painter, title block | `drawing.ts` |
| Plan projection and dimension tiers; missing measurements | `plan.ts` |
| Elevations (adapter over `engine/drawings/elevation.ts`) | `elevationView.ts` |
| Schedule (typed fields, runs, status), query, columns | `schedule.ts` |
| Construction rule sets (verified cabinet types) | `construction.ts` |
| BOM (cut list, fillers, banding, boards, hardware, worktops, bought-in items) | `bom.ts` |
| Readiness for presentation / drawings / manufacturing | `readiness.ts` |
| Revision ids (content hash) | `revision.ts` |
| Writers: SVG, PDF (own, vector, no dependency), CSV | `svg.ts`, `pdf.ts`, `csv.ts` |
| Set assembly (sheets, pagination, scale fitting) and tabular exports | `set.ts` |

UI and state: `features/deliverables/*`, `state/deliverablesStore.ts` (config, approvals, history,
stale detection, generation, chat actions), `state/deliverableAssistant.ts` (chat/voice replies).

## Coordinates, scale and precision
- Model: integer millimetres (the canonical representation); plan x along the back wall, y = room z
  (back wall at the top); elevations x from the viewer's left, y down from the ceiling on paper.
- Paper: millimetres; paper = model × scale. Scales are explicit 1:n (5, 10, 20, 25, 50, 100); "fit"
  picks the largest that fits the sheet. Text and tags are sized in paper mm.
- Dimensions store the measured value (mm) and its text separately; text is formatted once with the
  project's length formatter (mm drawings use whole millimetres; cm, m, in, ft, ft-in supported).
  Coordinates are rounded only when written (0.01 mm on paper), so nothing accumulates.
- Text width uses Helvetica metrics in both writers, so labels that do not fit between ticks move
  outside the dimension line identically in SVG and PDF.

## Construction rules and the BOM
`frameless-18` (the only rule set): every cabinet its own box, 18 mm carcass, 8 mm back, 18 mm
fronts, 3 mm gaps, 12 mm drawer boxes, 18 mm kickboard, butt joints with no allowances, edge banding
(fronts 4 edges; carcass, shelves, dividers 1 long edge), hinge and leg rules. Verified for base,
drawer, sink, wall and tall units (part sizes come from the same procedural parts as the 3D model;
fixture tests check them). Blind corner units are not covered and are left out, flagged.
- Calculated: panels, fillers (real 1–150 mm gaps next to units), banding length, hardware,
  worktops (one per run), appliances and furniture (bought in). Estimated: board sheets (area × (1 +
  waste) ÷ board area, no nesting) and costs (only with configured prices).
- No double counting: worktops per run, hardware totalled; each cabinet has its own sides by design.
- Waste, prices and hardware products are only used when configured (Deliverables › Readiness ›
  Manufacturing settings, saved with the project, undoable).

## Readiness
Per output: **presentation**, **drawings**, **manufacturing** → Ready / with notes / not ready.
Blocking: missing measurements, duplicate ids, unresolved geometry (drawings and manufacturing), no
or unknown construction method, cabinet types without verified rules, panels with no size, missing
materials. Warnings: design-check warnings, hardware products not specified, no waste allowance.
Info: appliance models, prices, furniture, end panels, regulations not checked. "Manufacturing-ready"
appears only with no blocking issue and no warning.

## Revisions, history and approvals
- Revision id = hash of the whole project (same design → same id, any change → new id).
- Every generated file records project id, revision, source (current or approved), time, units,
  format, configuration, readiness and warnings; file names contain the revision.
- Generated files (this browser, per project) show **stale** when the design (or, for approved
  sources, the latest approval) has moved on; **Regenerate** makes a new file from the latest one.
- **Approve revision** stores a snapshot of the exact design; Deliverables can be generated from any
  of the last five approvals ("regenerate the drawings for the latest approved revision").

## Formats
- **PDF**: one A3/A4 landscape page per sheet, vector lines and searchable Helvetica text, metadata
  (title, revision, readiness). Written by `pdf.ts` (no dependency).
- **SVG**: one sheet, viewBox = paper in mm, width/height in mm (prints at scale), title/desc and
  data attributes for project, revision, scale and units; all text escaped.
- **CSV**: UTF-8 with BOM, CRLF, header first, quoting of delimiters/quotes/line breaks, formula-like
  cells neutralised; schedule (with object id and revision), BOM (basis, formula, partial flag,
  revision), cut list (workshop format).
- **PNG snapshots** in presentation mode, captioned "illustration, not to scale".

## Chat and voice
"Generate a dimensioned floor plan", "Create elevations for the kitchen walls", "Show me a schedule of
all base cabinets", "Generate a BOM for the current kitchen", "Tell me what information is missing
before I can send this to the carpenter", "Export the current drawings to PDF", "Regenerate the
drawings for the latest approved revision", "Start presentation mode". The assistant returns a typed
`deliverables` request; the app computes the reply and offers Open / Download / Present buttons.

## Limitations
- One construction rule set; blind corners, end and decorative panels, scribes and joinery
  allowances are not modelled. Board counts are not nested.
- Elevations are per wall (a run is shown on its wall's elevation).
- History and approvals live in this browser (no server storage or accounts yet).
- XLSX is not offered (CSV opens in spreadsheets).
