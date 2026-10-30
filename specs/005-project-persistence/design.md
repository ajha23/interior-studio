# 005 — Design

- History: `state/editorStore.ts` keeps `past`/`future` stacks of immutable project snapshots
  (Immer structural sharing). Dirty = `project !== savedProject`.
- Files: `domain/project/serialization.ts` (`serializeProject`, `parseProjectFile`, `MIGRATIONS`).
- Storage: `persistence/projectDb.ts` (one object store, record = summary + file text).
- Actions: `features/projects/projectActions.ts` (save, open, create, import with id-collision copy,
  export download). Routing: `app/router.ts`.
