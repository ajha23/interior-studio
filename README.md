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

## Catalogue and materials

- `packages/core/src/catalog/library.ts` — built-in catalogue (68 pieces). Each piece builds its parts from the size you give it, so every piece resizes exactly. Ids are stored in scenes; never rename one.
- `packages/core/src/materials/library.ts` — 54 floor, wall and furniture materials with procedural patterns (planks, herringbone, tiles, marble, brick, stone, stripes, fabric). The same tile drives the plan, the 3D view and the swatches.
- Wall faces can carry their own finish (`wall.finishes.pos/neg`); otherwise a face shows the colour of the room it faces.
- Studio models: designers upload `.glb` files to the private `models` bucket (`<org_id>/<id>.glb` + thumbnail); rows live in `catalog_models` with org-scoped RLS.

## AI studio

- Edge functions `ai-image` (Gemini image model) and `ai-model` (Gemini text model → furniture *recipe* JSON: shaped parts, mm sizes, studio material ids) run with the studio's credit pool (`ai_credit_ledger`, monthly allowance in `ai_settings`, atomic debit via `ai_debit`, refunds on failure).
- Secrets (set in Supabase → Edge Functions → Secrets; never in the app): `GEMINI_API_KEY` (the only provider key). Optional overrides: `GEMINI_IMAGE_MODEL` (default `gemini-3.1-flash-image`), `GEMINI_TEXT_MODEL` (default `gemini-3.6-flash`, falls back to `gemini-2.5-flash`).
- Cloud renders: `workers/blender` (Blender Cycles on Cloud Run, Mumbai) — see its README. The Renders panel shows "Cloud · Blender Cycles" when `VITE_BLENDER_WORKER_URL` is set; renders carry `engine` = browser | cycles | ai.
- AI 3D models: the recipe format lives in `packages/core/src/recipe` (`sanitizeRecipe`, `resizeRecipe`); the browser builds it with three.js (`apps/web/src/recipe/build.ts`), previews it, lets the designer resize/refine, then exports GLB into Studio models and keeps the recipe in `catalog_models.recipe`. The same format is meant to be built by a future Blender worker.
- AI images land in the project's render gallery (`renders.kind = 'ai'`); AI models are imported into Studio models (`source_format = 'ai'`), scaled to the size the designer gives.

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

## Editor architecture (Sprint 1)

- **Workspace:** top bar (views, undo/redo, share, overflow menu) · tool rail (Select V, Wall W, Room M, Door D, Window N, Paint B, Comment C) · left panel (Add, Catalogue, Materials, Scene) · plan/3D viewport · inspector · status bar.
- **Scene model:** typed `Project` (schema v6, µm integers) changed only through invertible `Command`s → undo/redo, autosave (2.5 s) to `project_versions`.
- **Kitchen cabinets** (`basecabinet`, `wallcabinet`, `tallcabinet`): parametric templates with one limits table each, regenerated parts for 3D, plan, elevations and cut lists. **Kitchen runs:** select a wall → Kitchen run → base/wall/tall units fill its free length (or say “fill this wall with base cabinets”).
- **AI command bar (⌘K):** request → deterministic parser or `ai-command` (Gemini function calling) → validated scene tools → one undoable batch → autosave. See `docs/adr/0002-scene-tools-and-ai-commands.md`.
- **Tests:** `npm test` (Vitest, core) and `npm run e2e` (Playwright driving the real editor route with an in-memory Supabase mock in `e2e/backend.ts`).
- **Quote & BOM (Sprint 3):** Quote view → client quotation (per piece, GST, print/PDF), workshop BOM (sheets, banding, worktops, hardware), studio rates (admins), saved numbered quotes. See `docs/adr/0003-bom-and-quotes.md`.
