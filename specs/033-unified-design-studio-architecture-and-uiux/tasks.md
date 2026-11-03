# Tasks 033: Unified Design Studio Architecture & UI/UX Redesign

## Task List

- [x] Task 1: Entity-Component-System (ECS) Data Model & Project Adapter
  - File: `src/domain/ecs/types.ts`
  - File: `src/domain/ecs/adapter.ts`
  - Unit tests: `src/domain/ecs/ecs.test.ts`
  - Implement `TransformComponent`, `MaterialComponent`, `PricingComponent`, `ManufacturingComponent`, and bidirectional `projectToEntities()` converter.

- [x] Task 2: Quadtree 2D Spatial Partitioning Index
  - File: `src/engine/spatial/quadtree.ts`
  - Unit tests: `src/engine/spatial/quadtree.test.ts`
  - Implement integer millimeter 2D Quadtree with sub-millisecond point hit-testing and bounding-box overlap queries.

- [x] Task 3: Studio Plugin Registry & Domain Vertical Plugins
  - File: `src/domain/plugins/types.ts`
  - File: `src/domain/plugins/registry.ts`
  - File: `src/domain/plugins/builtinPlugins.ts`
  - Unit tests: `src/domain/plugins/pluginRegistry.test.ts`
  - Implement `StudioPluginRegistry` with registration, lifecycle hooks, and built-in plugins (`kitchenPlugin`, `homePlugin`, `officePlugin`, `lightingPlugin`).

- [x] Task 4: Floating Command Palette (`Cmd+K`)
  - File: `src/features/command-palette/CommandPalette.tsx`
  - Component tests: `src/features/command-palette/CommandPalette.test.tsx`
  - Implement keyboard-driven floating palette with fuzzy search, hotkeys (`Cmd+K` / `Ctrl+K`), view toggles, action execution, and accessibility attributes.

- [x] Task 5: Hierarchical Outliner & Contextual Floating Toolbar
  - File: `src/features/kitchen-layout/HierarchicalOutliner.tsx`
  - File: `src/features/kitchen-layout/ContextualToolbar.tsx`
  - File: `src/features/kitchen-layout/Workspace.tsx`
  - File: `src/components/layout/TopBar.tsx`
  - Integrate Outliner tab into left sidebar; add contextual floating action toolbar on active selection; add Cmd+K shortcut button to top bar.

- [x] Task 6: Playwright E2E Test & Full Definition of Done Verification
  - File: `e2e/unified-studio-and-command-palette.spec.ts`
  - Run full DoD check: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/unified-studio-and-command-palette.spec.ts`.
  - Update `docs/ACCEPTANCE_TESTS.md`.
