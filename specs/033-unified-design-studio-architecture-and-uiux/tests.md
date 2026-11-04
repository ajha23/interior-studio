# Tests Spec 033: Unified Design Studio Architecture & UI/UX Redesign

## Unit & Integration Tests

1. `src/domain/ecs/ecs.test.ts`:
   - Validates component schemas (`TransformComponent`, `MaterialComponent`, `PricingComponent`, `ManufacturingComponent`).
   - Verifies `projectToEntities()` extracts all walls, openings, and cabinets into normalized entities.
   - Asserts non-cabinet visual furniture objects do not have manufacturing components.

2. `src/engine/spatial/quadtree.test.ts`:
   - Validates Quadtree point query: returns entity under cursor.
   - Validates Quadtree bounding box query: returns all entities overlapping rectangle.
   - Benchmarks query performance with 500+ entities to verify sub-millisecond ($<1\text{ms}$) latency.

3. `src/domain/plugins/pluginRegistry.test.ts`:
   - Validates registration and retrieval of domain plugins (`kitchen`, `home`, `office`, `lighting`).
   - Verifies plugin lifecycle hooks (`onActivate`, `onDeactivate`).
   - Verifies duplicate plugin IDs are prevented.

4. `src/features/command-palette/CommandPalette.test.tsx`:
   - Verifies `Cmd+K` keyboard shortcut triggers palette open/close.
   - Verifies filtering commands via search input.
   - Verifies keyboard navigation (Arrow Down, Enter) executes command and closes palette.

## E2E Acceptance Test

1. `e2e/unified-studio-and-command-palette.spec.ts`:
   - Open 3D workspace.
   - Press `Cmd+K` (or click TopBar Command button) -> verify Command Palette modal appears.
   - Type "Plan" -> press Enter -> verify switches to Plan view.
   - Select an element -> verify contextual floating toolbar appears with quick actions.
   - Open left sidebar Outliner tab -> verify hierarchical tree view displays walls and cabinets.

