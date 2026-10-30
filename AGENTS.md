# Engineering rules for coding agents

These rules apply to every agent (Codex, Claude Code, others) and every human working in this repo.
`CLAUDE.md` adds Claude-specific workflow notes only; it never overrides this file.

## Before writing code

1. Read `docs/PRD.md`, `docs/ARCHITECTURE.md` and `docs/DOMAIN_MODEL.md`.
2. Read the feature spec you are working on in `specs/NNN-*/` (`spec.md`, `design.md`, `tasks.md`, `tests.md`).
   If there is no spec for the change, write one first (copy the layout of an existing spec).
3. Work on one task from `tasks.md` at a time. Keep the repository runnable after each task.

## Architecture rules

- `src/domain` and `src/engine` are framework-free TypeScript. They must not import React, Three.js,
  Zustand or anything under `src/state`, `src/rendering`, `src/features` or `src/components`.
  ESLint enforces this (`no-restricted-imports`).
- The project only changes through `executeCommand` (`src/domain/commands`). The inspector, catalogue,
  keyboard shortcuts and the future AI copilot all dispatch `DesignCommand`s. Never mutate a project
  any other way, and never add a UI-only shortcut that bypasses validation.
- Dimensions are **integer millimetres** in the domain. Convert to Three.js units only in
  `src/rendering/units.ts`. Never round, clamp or "fix" a measurement silently: reject it with a
  message that says what is supported.
- Geometry, worktops, labels and the BOM are derived from the domain model. Never read data back
  from meshes, and never store derived data (e.g. worktops) in the project.
- Every new persisted field needs a Zod schema change, a `SCHEMA_VERSION` bump and a migration in
  `src/domain/project/serialization.ts` (`MIGRATIONS`). Never edit an existing migration.
- Keep stable ids: edits change an element in place; they never delete and recreate it.

## Code rules

- Strict TypeScript. No `any` (ESLint errors on it); use `unknown` and narrow, or justify in a comment.
- Every interactive control must do something real. No placeholder buttons, fake data or screenshots
  standing in for a working feature. If something is out of scope, leave it out and say so.
- Match the surrounding code: naming, comment density, file layout. UI primitives live in
  `src/components/ui` (shadcn/ui style, Tailwind tokens from `src/app/index.css`).
- No unrelated refactors. Small, reviewable commits.

## Tests

- Domain logic: unit tests next to the code (`*.test.ts`, Vitest).
- Components: React Testing Library (`*.test.tsx`).
- User workflows: Playwright in `e2e/`. Wait for `canvas[data-rendered]` before interacting with 3D.
- Add the acceptance scenario to `docs/ACCEPTANCE_TESTS.md` with the test that covers it.

## Definition of done

Run and pass, in order:

```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```

Then report: files changed, commands run with their results, and any requirement from the spec
that is not finished. Never claim success for something that was not run.
