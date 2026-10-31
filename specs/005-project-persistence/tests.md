# 005 — Tests

- Store: undo/redo through dependent edits restores the original project object; rejected edits
  record no history; redo stack cleared by new edits; dirty tracking (`state/editorStore.test.ts`).
- Files: round trip; bad JSON, wrong format, newer schema, missing project, invalid values, overlap
  reporting (`domain/project/serialization.test.ts`).
- Storage: save/list/load/delete; ordering (`persistence/projectDb.test.ts`).
- E2E: save, reload, reopen from the projects list (`e2e/kitchen.spec.ts`).
