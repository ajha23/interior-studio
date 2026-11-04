# Feature Spec 033: Unified Design Studio Architecture & UI/UX Redesign

- **Feature Branch:** `refactorV2`
- **PRD Reference:** PRD: Unified Design Studio Architecture & UI/UX Redesign
- **Governance:** Constitution Principles I through X; `AGENTS.md` Strict TypeScript & Layer Isolation

---

## 1. Problem Statement & Motivation

As Interior Studio expands from kitchen layout modeling to comprehensive multi-room residential and commercial design (Home Design, Office Layouts, Lighting Planning, Wardrobes), the workspace architecture must scale horizontally:
1. Hardcoded domain-specific logic in rendering and editor components creates coupling and impedes modular plugin development.
2. Large-scale multi-room architectural projects with hundreds of entities require spatial indexing (sub-millisecond hit-testing and collision detection) to maintain a fluid 60fps interaction loop.
3. Traditional CAD headers and fixed toolbars consume valuable drawing canvas real estate; professional designers require a modern, canvas-first interface with floating command palettes (`Cmd+K`), contextual floating toolbars, and collapsible hierarchical outliners.
4. Workspace entities need an Entity-Component-System (ECS) data abstraction so that new product verticals can introduce custom components (e.g., lighting photometric specs, electrical connectivity, acoustic properties) without modifying core geometry or rendering loops.

---

## 2. User Stories & Acceptance Criteria

### User Story 1: Plugin-Based Core Canvas & Entity-Component-System (ECS) Architecture (Priority: P1)
- **As a** platform architect and vertical module developer,
- **I want** a headless canvas core and plugin registry where domain modules (Kitchen, Home, Office, Lighting) register their custom toolbars, asset schemas, and property inspectors into a unified event bus,
- **So that** new product verticals scale infinitely without altering the core canvas engine or rendering pipelines.
- **Acceptance Criteria:**
  1. `StudioPluginRegistry` supports registering and activating plugins with unique IDs, custom action menus, asset catalogs, and property inspector extensions.
  2. Workspace objects can be represented as entities with modular components:
     - `TransformComponent`: position ($x, y, z$), rotation, integer millimeter bounding dimensions.
     - `MaterialComponent`: finish code, surface material, texture options.
     - `PricingComponent`: unit rates in integer paise, margin percentage, HSN/SAC codes.
     - `ManufacturingComponent`: rule pack ID, boring patterns, edge-banding deductions.
  3. Bounded domain isolation: `src/domain` and `src/engine` remain 100% pure TypeScript with zero UI or Three.js dependencies.

### User Story 2: 2D Spatial Partitioning Index for Sub-Millisecond Hit Testing (Priority: P1)
- **As a** designer working on complex multi-room apartment and commercial floor plans,
- **I want** spatial partitioning (Quadtree / 2D Bounding Box Index) over all canvas entities,
- **So that** point selection, rectangular marquee hit-testing, and collision queries execute in $<1\text{ms}$ even with 500+ cabinets, walls, and furniture instances.
- **Acceptance Criteria:**
  1. `SpatialIndex2D` indexes all spatial entities with integer millimeter bounding boxes.
  2. `queryPoint(x, y)` returns the topmost matching entity in sub-millisecond time ($O(\log N)$).
  3. `queryBounds(box)` returns all intersecting entities for multi-selection marquee and collision avoidance.
  4. Benchmark test suite proves $<1\text{ms}$ query latency across 500 entities.

### User Story 3: Canvas-First UI/UX & Floating Command Palette (Cmd+K) (Priority: P1)
- **As an** interior designer or power user,
- **I want** a canvas-first layout with a floating command palette (`Cmd+K` / `Ctrl+K`), minimalist top navigation, and collapsible left outliner,
- **So that** drawing viewport real estate is maximized and tools are accessible instantly via keyboard muscle memory.
- **Acceptance Criteria:**
  1. Pressing `Cmd+K` (or `Ctrl+K`) opens a sleek floating Command Palette modal.
  2. Command Palette enables fuzzy searching and executing commands: mode switching (2D Plan, 3D Canvas, Walk Mode, Deliverables), inserting modules, zooming, running checks, exporting DXF/cutlists, and toggling panels.
  3. Floating contextual toolbars appear near active selections providing quick action shortcuts (rotate, delete, duplicate, focus).
  4. Top navigation is streamlined with breadcrumbs, autosave indicator, and clean view switcher buttons.
  5. Left sidebar provides a collapsible hierarchical tree view (Outliner) displaying rooms, walls, openings, and cabinet runs.

### User Story 4: Accessible Keyboard Shortcuts & Ergonomic Visual Snapping (Priority: P2)
- **As a** professional CAD user,
- **I want** industry-standard keyboard shortcuts and subtle visual snapping feedback,
- **So that** I can design rapidly without manual mouse hunting.
- **Acceptance Criteria:**
  1. Keyboard shortcuts for grid toggle, view toggle (`1` for 3D, `2` for Plan, `3` for Split, `4` for Deliverables), undo (`Cmd+Z`), redo (`Shift+Cmd+Z`), and focus (`F`).
  2. Visual snapping indicator highlights wall alignment and module snaps during drag operations.

