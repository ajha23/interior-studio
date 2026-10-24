# Interior Studio

In-house interior design platform: measured rooms, a synchronized 2D plan and 3D view, parametric wardrobes and TV units, construction checks, elevations, cut lists and print-ready sheets. Projects are saved to the cloud per studio, with full version history.

## Layout

```
apps/web            React app (Vite): workspace, editor, Supabase client
  src/auth          Google sign-in, studio membership, roles
  src/data          Project, version and team queries
  src/pages         Home, Projects, Team, Editor
  src/editor        Plan, 3D, properties, drawings; cloud-saving store
packages/core       Framework-free domain: units, scene types, commands,
                    parametric furniture, geometry, validation, schedules,
                    scene hashing and schema migrations
supabase/migrations Database schema, row-level security, seed
```

## How saving works

- Every edit is a typed `Command` with an exact inverse (undo/redo, audit, later AI tools).
- The editor autosaves 2.5 s after the last edit. Each save is an immutable row in `project_versions` (scene JSON, schema version, SHA-256 of the canonical scene) created by the `save_project_version` RPC, which checks the caller's role.
- Unchanged scenes are not re-saved. A local draft is kept in the browser until the cloud confirms, and is offered back after a crash or lost connection.
- "Save version" stores a named version; History restores any version as one undoable step.
- Scenes carry `schemaVersion`; `apps/web/src/editor/migrations.ts` upgrades old scenes on load.

## Access

- Google sign-in through Supabase Auth. Access is invite-only: an admin invites an email on the Team page; the person gets the role on first sign-in.
- Roles: owner, admin (manage team, archive), designer (create and edit), viewer (read-only).
- Every table has row-level security keyed on studio membership; helper functions live in a non-exposed `private` schema.

## Develop

```bash
npm install
cp apps/web/.env.example apps/web/.env.local
npm run dev          # http://localhost:5173
npm run check        # typecheck + tests + production build
```

Lengths are integer micrometres internally; the UI shows millimetres. The default construction rule pack is illustrative and needs carpenter review before any cut list is used for production.
