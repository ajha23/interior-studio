# Interior Studio Constitution

## Core Principles

### I. Framework-Free Core Domain & Engine (Layer Isolation)
`src/domain` and `src/engine` are strictly framework-free TypeScript libraries. They must NEVER import React, Three.js, Zustand, or any code under `src/state`, `src/rendering`, `src/features`, or `src/components`. Dependency direction is strictly downward (`features` → `state` → `domain`, `features` → `rendering` → `engine` → `domain`, `persistence` → `domain`). This architectural isolation is strictly enforced by ESLint (`no-restricted-imports`).

### II. Single Mutation Path via Command Pattern
The project state only changes through `executeCommand` (`src/domain/commands`). Every inspector field, catalogue addition, keyboard shortcut, script, and AI copilot interaction must build and dispatch typed `DesignCommand`s. Never mutate a project in-place, never create UI-only state shortcuts that bypass domain validation, and never commit invalid states. All edits validate against domain invariants, execute on an Immer draft, and preserve immutability and complete undo/redo history.

### III. Integer Millimetres & Zero Silent Coercion
All real-world dimensions and coordinates within the domain are integer millimetres. Conversion to 3D world units happens exclusively at the rendering boundary in `src/rendering/units.ts` (1 Three.js unit = 1 metre). Never round, clamp, or "fix" invalid measurements silently: reject unsupported sizes and invalid bounds with explicit, actionable error messages indicating supported module ranges.

### IV. Pure Derived Geometry, Deliverables & BOM
Geometry, procedural parts, countertops, dimension labels, 2D floor plans, elevations, schedules, cut lists, and the Bill of Materials (BOM) are pure functions derived from the domain project model. Never read state back from Three.js scene meshes or DOM elements, and never store derived artifacts inside project persistence.

### V. Schema Evolution & Stable Identifiers
Every persisted schema change requires an updated Zod schema, a `SCHEMA_VERSION` increment, and a forward migration appended to `src/domain/project/serialization.ts` (`MIGRATIONS`). Existing migrations are immutable and must never be edited. Entity IDs are permanent and stable: user operations edit elements in place and must never delete and recreate them.

### VI. Strict TypeScript & Real Interactive Controls
Strict TypeScript is enforced with zero tolerance for `any` (use `unknown` and narrow, or document explicit justification). Every UI control and interactive element must perform real actions; placeholder buttons, mocked data, or visual mockups masquerading as working features are prohibited. All UI primitives adhere to shadcn/ui patterns and Tailwind CSS design tokens (`src/app/index.css`).

### VII. Test-First Quality & Definition of Done
Every feature and bugfix requires automated coverage:
- Domain & mathematical logic: Vitest unit tests colocated next to code (`*.test.ts`).
- UI Components: React Testing Library (`*.test.tsx`).
- User workflows & 3D WebGL interactions: Playwright end-to-end tests in `e2e/`, synchronizing on `canvas[data-rendered]`.
- Acceptance scenarios: Documented in `docs/ACCEPTANCE_TESTS.md` with accompanying test references.

## Non-Negotiable Quality Gates

The Definition of Done requires running and passing the full suite in exact sequence:
```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```
No task or pull request is complete without clean verification across all five stages.

## Governance & Spec Kit Workflow

1. **Spec-Driven Execution**: Feature work follows the Spec Kit lifecycle:
   - `/speckit-specify`: Define user stories, requirements, and independent acceptance tests in `specs/NNN-<name>/spec.md`.
   - `/speckit-plan`: Create technical design and architecture blueprint in `design.md`.
   - `/speckit-tasks`: Break down implementation into sequential, verifiable tasks in `tasks.md`.
   - `/speckit-implement`: Implement one task at a time, keeping the repository runnable after each step.
   - `/speckit-converge`: Verify implementation against acceptance criteria and capture edge cases.
2. **Precedence**: This constitution and `AGENTS.md` supersede informal instructions. Agent notes (`CLAUDE.md`, etc.) provide client-specific invocation helpers only and cannot relax constitution constraints.
3. **Amendments**: Amendments require updating this constitution, bumping the version, and noting rationale.

**Version**: 1.0.0 | **Ratified**: 2026-11-01 | **Last Amended**: 2026-11-01
