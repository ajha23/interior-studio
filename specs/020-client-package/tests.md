# 020 — Tests

- `engine/package/package.test.ts`: starter pages and statuses; file round-trip, sanitising, foreign
  and newer files; page add/rename/reorder/duplicate/delete and validation; layout and elevation
  dimensions from the model, markers, title block; moving a label keeps value and design; only
  affected pages go stale, regeneration keeps notes and label edits; changed elements flagged and
  discardable; boards and snapshots (missing images, stale snapshots); PDF with one image object.
- `persistence/projectDb.test.ts`: package and images saved, reloaded and deleted with the project.
- `e2e/package.spec.ts`: the whole workflow in the browser, through PDF export and reload.
