# Tasks: Algorithmic 2D Sheet Nesting, Cutting Optimization & Visual Workshop Layouts

**Input**: Design documents from `/specs/032-sheet-nesting-optimization/`  
**Prerequisites**: `plan.md`, `spec.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`  
**Tests**: Included per engineering standard and quickstart requirements.  
**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

---

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (`US1`–`US5`)
- Include exact file paths in descriptions

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Core types, schemas, and grain policy rules for 2D nesting

- [X] T001 Define domain types, Zod schemas, and board constants (`RawBoardStock`, `InputNestingPanel`, `NestedSheet`, `NestingResult`) in `src/engine/production/nesting/types.ts`
- [X] T002 [P] Implement grain orientation policy and rotation constraints by part role (`front` lengthwise lock vs `carcass` 90° rotation) in `src/engine/production/nesting/grainPolicy.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Panel extraction adapter and foundational unit test suites

- [X] T003 [P] Create unit test suite for grain policy in `src/engine/production/nesting/grainPolicy.test.ts`
- [X] T004 Implement cut list adapter converting `CutList` / `PanelRow` into `InputNestingPanel[]` with thickness, grain, and banding metadata in `src/engine/production/nesting/cutlistAdapter.ts`
- [X] T005 [P] Create unit test suite for cut list adapter in `src/engine/production/nesting/cutlistAdapter.test.ts`

**Checkpoint**: Foundation ready - 2D packing algorithms can now be implemented and tested independently.

---

## Phase 3: User Story 1 - Deterministic 2D Guillotine Nesting Engine (Priority: P1) 🎯 MVP

**Goal**: Compute exact, overlap-free cutting layouts on standard $2440 \times 1220\text{ mm}$ raw boards respecting $3.2\text{ mm}$ saw kerf and $10\text{ mm}$ trim margin.  
**Independent Test**: Provide 35 cabinet panels to `NestingEngine.optimize()`; verify 0 overlaps, containment within board margins, kerf separation, and net yield calculation.

### Tests for User Story 1 ⚠️
- [X] T006 [P] [US1] Create unit tests for guillotine bin-packer (containment, through-cuts, kerf spacing, BAF/BSSF heuristics) in `src/engine/production/nesting/guillotineBinPacker.test.ts`
- [X] T007 [P] [US1] Create unit tests for multi-sheet multi-material nesting coordinator in `src/engine/production/nesting/nestingEngine.test.ts`

### Implementation for User Story 1
- [X] T008 [US1] Implement recursive 2D guillotine cutting tree packer with Best-Area-Fit (BAF) and Best-Short-Side-Fit (BSSF) in `src/engine/production/nesting/guillotineBinPacker.ts`
- [X] T009 [US1] Implement multi-sheet nesting coordinator, material segregation, and yield calculation in `src/engine/production/nesting/nestingEngine.ts`

**Checkpoint**: User Story 1 (MVP) is fully functional and passes all mathematical tests.

---

## Phase 4: User Story 2 - Visual Interactive Cutting Diagram Viewer (Priority: P1)

**Goal**: Interactive SVG sheet viewer displaying panel positions, dimensions, part names, edge-banding indicators, and sheet metrics.  
**Independent Test**: Render `SheetCanvasViewer` and `CuttingLayoutsPanel` with mock `NestingResult`; verify responsive SVG canvas, part tooltips, and sheet switcher carousel.

### Tests for User Story 2 ⚠️
- [X] T010 [P] [US2] Create RTL unit tests for responsive SVG sheet viewer in `src/features/manufacturing/SheetCanvasViewer.test.tsx`
- [X] T011 [P] [US2] Create RTL unit tests for cutting layouts panel in `src/features/manufacturing/CuttingLayoutsPanel.test.tsx`

### Implementation for User Story 2
- [X] T012 [US2] Implement responsive SVG sheet visualizer with zoom, pan, part identification labels, and edge-banding indicators in `src/features/manufacturing/SheetCanvasViewer.tsx`
- [X] T013 [US2] Implement `CuttingLayoutsPanel` with material selector, sheet carousel, yield gauges, and settings modal in `src/features/manufacturing/CuttingLayoutsPanel.tsx`
- [X] T014 [US2] Wire "Cutting Layouts" navigation tab and subview into Deliverables Studio in `src/features/deliverables/DeliverablesView.tsx`

**Checkpoint**: User Stories 1 and 2 deliver end-to-end interactive visual nesting in the application.

---

## Phase 5: User Story 3 - Multi-Material Segregation & Offcut Classification (Priority: P2)

**Goal**: Separate sheets per core material/thickness and classify unallocated rectangular areas $\ge 600 \times 600\text{ mm}$ as reusable salvage offcuts.  
**Independent Test**: Run nesting with mixed 18mm Plywood and 8mm Backing; verify strict sheet segregation and salvage offcuts card.

### Tests for User Story 3 ⚠️
- [X] T015 [P] [US3] Create unit tests for offcut classification and salvage inventory in `src/engine/production/nesting/offcutClassifier.test.ts`

### Implementation for User Story 3
- [X] T016 [US3] Implement offcut evaluator classifying rectangular free spaces into reusable offcuts ($\ge 600 \times 600\text{ mm}$) and scrap in `src/engine/production/nesting/offcutClassifier.ts`
- [X] T017 [US3] Implement offcut inventory card component in `src/features/manufacturing/OffcutSummaryCard.tsx`

**Checkpoint**: Offcut salvage tracking and multi-material separation are verified.

---

## Phase 6: User Story 4 - Multi-Page Workshop PDF & DXF Nesting Export (Priority: P2)

**Goal**: Export cutting layouts to AutoCAD R12 DXF polylines for CNC routers and multi-page printable HTML/PDF workshop packages.  
**Independent Test**: Invoke DXF and Workshop Report exports; verify valid CAD DXF text structure and printable HTML layout with cut sequence table.

### Tests for User Story 4 ⚠️
- [X] T018 [P] [US4] Create unit tests for AutoCAD R12 DXF generator in `src/engine/production/nesting/dxfExporter.test.ts`
- [X] T019 [P] [US4] Create unit tests for workshop printable report generator in `src/engine/production/nesting/workshopReport.test.ts`

### Implementation for User Story 4
- [X] T020 [US4] Implement AutoCAD R12 DXF generator with layered polylines (`BOARD_OUTLINE`, `PANEL_CUTS`, `PART_LABELS`) in `src/engine/production/nesting/dxfExporter.ts`
- [X] T021 [US4] Implement printable workshop cutting report HTML generator in `src/engine/production/nesting/workshopReport.ts`
- [X] T022 [US4] Implement export actions dropdown (DXF, SVG, Print HTML) in `src/features/manufacturing/NestingExportDropdown.tsx`

**Checkpoint**: Machine and floor exports are complete and independently testable.

---

## Phase 7: User Story 5 - Commercial SaaS Entitlement & Usage Guard (Priority: P3)

**Goal**: Gate sheet nesting under `feature.manufacturing.sheet_nesting` and increment monthly quota `quota.nesting_runs.monthly.max`.  
**Independent Test**: Starter tier triggers `UpgradeModal` prompt; Pro/Enterprise tier evaluates `allowed: true`.

### Tests for User Story 5 ⚠️
- [X] T023 [P] [US5] Create unit tests verifying entitlement gating and quota tracking in `src/domain/platform/saas/nestingEntitlement.test.ts`

### Implementation for User Story 5
- [X] T024 [US5] Register `feature.manufacturing.sheet_nesting` and `quota.nesting_runs.monthly.max` in `src/domain/platform/saas/entitlementRegistry.ts` and `src/domain/platform/saas/subscriptionCatalog.ts`
- [X] T025 [US5] Connect policy evaluation guard and upgrade CTA banner into `src/features/manufacturing/CuttingLayoutsPanel.tsx`

**Checkpoint**: Commercial SaaS guard protects the advanced manufacturing capability.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end integration test, acceptance criteria catalog, and clean quality gate verification.

- [X] T026 Create Playwright E2E test in `e2e/sheet-nesting-and-cutting.spec.ts`
- [X] T027 Update acceptance test scenarios in `docs/ACCEPTANCE_TESTS.md`
- [X] T028 Run full quality gate suite (`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`)

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: No dependencies — starts immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 — blocks all user stories.
- **User Story 1 (Phase 3 - P1 MVP)**: Depends on Foundational.
- **User Story 2 (Phase 4 - P1)**: Depends on US1 (layout data structures).
- **User Story 3 (Phase 5 - P2)**: Extends US1 with offcut classification.
- **User Story 4 (Phase 6 - P2)**: Exports US1/US2 nested sheet data.
- **User Story 5 (Phase 7 - P3)**: Guards UI with SaaS entitlement.
- **Polish (Phase 8)**: Depends on all user stories.

### Parallel Opportunities
- T002, T003 can run in parallel with T001/T004.
- T006, T007 (US1 tests) run in parallel before implementation.
- T010, T011 (US2 tests) run in parallel.
- T018, T019 (US4 tests) run in parallel.

---

## Implementation Strategy: MVP First

1. Complete Phase 1 & 2 (Setup & Foundational: types, grain policy, cutlist adapter).
2. Complete Phase 3 (User Story 1: Guillotine packer & Nesting engine) → Validate math & 0 overlap.
3. Complete Phase 4 (User Story 2: SVG viewer & CuttingLayoutsPanel) → Validate interactive UI.
4. Complete Phase 5 (User Story 3: Reusable offcuts $\ge 600\times 600\text{ mm}$).
5. Complete Phase 6 (User Story 4: DXF & Workshop report export).
6. Complete Phase 7 (User Story 5: SaaS gating).
7. Complete Phase 8 (E2E & full test suite).
