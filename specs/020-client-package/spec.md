# 020 — Client Deliverables Studio (client packages)

**Status:** Done (first vertical slice). Guide: [docs/DELIVERABLES.md](../../docs/DELIVERABLES.md#client-packages). Builds on 018.

Designers assemble a multi-page client package — like a studio's kitchen presentation: dimensioned
layout with elevation references, elevations A, B, …, a hardware & accessories board, 3D views, the
cabinet schedule, and a studio title block on every page — and edit each page on its own without
ever changing the design or falsifying a measurement.

## Requirements (as implemented)
1. A package per project, saved in this browser (IndexedDB), with its own versioned schema and
   migrations; reopening restores every edit.
2. Pages from templates: kitchen layout, cabinet elevation (wall + reference letter), hardware board,
   3D presentation view, cabinet schedule. Add, rename, reorder, duplicate, delete; A3/A4,
   landscape/portrait; optional heading.
3. Two sources of truth: technical content comes from the design revision a page is pinned to;
   the package stores only presentation (notes, label/line offsets, hidden elements, images, captions,
   title block). Dimension values are never editable; "Change the size in the design" goes to the design.
4. Generated dimensions, tags and labels have stable keys (what they measure / which element), so
   edits follow their element; edits whose element changed are flagged (needs review), never moved
   onto something else.
5. Status per page: current, presentation customized, technical content stale, needs review, missing
   source data. Stale = the page's content (not just the project) differs from what it shows; only
   affected pages go stale. Regenerate pins one page to the current design and keeps compatible edits.
6. 3D snapshots record their revision and go stale on any design change.
7. Studio title block (project, address, date, scale, client, drawn/approved/reference by, revision
   table, studio) on every page; nothing about the client or studio is invented.
8. One vector PDF for the whole package (images embedded once as JPEG), SVG per page; stale pages
   carry "STALE" in the title block and the PDF subject. No handles or UI in exports.
9. Artifact-level undo/redo, separate from design undo.
10. Chat and voice: a typed `client_package` tool (and the rule-based provider) for page, note,
    label-position, title-block, page-management, regeneration and status requests; resolved against
    the real package, questions for ambiguity, Apply for broad/destructive/approved-revision edits.

## Not done (later slices)
Chat-driven images and 3D captures; resizing/snap guides/multi-select; island and run-cropped elevations
and section views (018 limitation: elevations are per wall); server-side storage and sharing;
schedule column choice per page; cut lists in the package.
