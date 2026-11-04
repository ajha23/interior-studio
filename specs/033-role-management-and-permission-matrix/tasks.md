# Tasks: Feature 033 - Role Management Dashboard, Hierarchical Permission Matrix, and Guided Role Editor

**Input**: Design documents from `specs/033-role-management-and-permission-matrix/`  
**Prerequisites**: `spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`  
**Tests Required**: Yes (Vitest unit tests, React Testing Library component tests, Playwright E2E tests per Constitution Principle IX)  

---

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Parallelizable task (independent file / no dependencies)
- **[Story]**: Associated user story (US1 through US6)

---

## Phase 1: Setup & Domain Schemas

**Purpose**: Define the pure TypeScript schemas, types, and invariants in `src/domain/platform/authorization/` complying with Constitution Principle I.

- [x] T001 [Setup] Update and extend Zod schemas in `src/domain/platform/authorization/types.ts` with `ModuleActionSchema`, `RoleResourceScopeConfigSchema`, `RoleTemplateSchema`, `RoleAuditEventSchema`, and updated `CustomRoleSchema`.
- [x] T002 [Setup] Create predefined industry role templates in `src/domain/platform/authorization/roleTemplates.ts` (`Project Manager`, `Senior Designer`, `Designer`, `Reviewer`, `Client Viewer`).
- [x] T003 [P] [Setup] Create unit test fixtures in `src/domain/platform/authorization/roleTemplates.test.ts` validating all templates against `RoleTemplateSchema` and existing module capabilities.

---

## Phase 2: Foundational Domain & Policy Services

**Purpose**: Implement pure domain business logic for role operations, impact diffing, last-owner safeguards, and the 4-stage simulator.

- [x] T004 [Foundational] Enhance `src/domain/platform/authorization/bootstrap.ts` to ensure all 11 modules register action-level capabilities (`view`, `create`, `edit`, `delete`, `approve`, `export`) mapped to canonical subscription entitlement keys.
- [x] T005 [Foundational] Extend `src/domain/platform/authorization/adminRoleService.ts` to implement `calculateChangeImpact()`, `cloneRole()`, last-owner invariant check (`CANNOT_REMOVE_LAST_OWNER`), and structured `RoleAuditEvent` generation.
- [x] T006 [P] [Foundational] Write unit tests in `src/domain/platform/authorization/adminRoleService.test.ts` verifying role cloning, impact diff calculation, last-owner lockout rejection, and audit log emissions.
- [x] T007 [Foundational] Implement `src/domain/platform/authorization/accessSimulator.ts` executing the 4-stage simulation pipeline (`Tenant Validation` $\land$ `Subscription Entitlement` $\land$ `RBAC Role Grant` $\land$ `Resource Scope Check`).
- [x] T008 [P] [Foundational] Write unit tests in `src/domain/platform/authorization/accessSimulator.test.ts` testing positive and negative simulation scenarios, plan-restricted explanations, and resource scope enforcement.
- [x] T009 [Foundational] Implement `src/state/roleManagementStore.ts` managing role list, draft state, unsaved changes tracking, simulation queries, and subscription plan synchronization.
- [x] T010 [P] [Foundational] Write state unit tests in `src/state/roleManagementStore.test.ts` verifying reactive state transitions, draft modifications, and unsaved changes detection.

**Checkpoint**: Pure domain foundation and state store ready and tested. Presentation layer implementation can now proceed.

---

## Phase 3: User Story 1 - Roles & Permissions Dashboard (Priority: P1) 🎯 MVP

**Goal**: Deliver the landing hub displaying metric summary cards, role data table, search/filter, and cloning system roles to custom roles.

- [x] T011 [US1] Build metric counters component (`Total Roles`, `Custom Roles`, `Assigned Users`, `Plan-Restricted Roles`) in `src/features/access-control/components/RoleMetricsSummary.tsx`.
- [x] T012 [US1] Build the roles data table in `src/features/access-control/components/RolesTable.tsx` with columns (Role, Type, Members, Permissions count, Scope, Last updated, Actions).
- [x] T013 [US1] Implement search and type filtering controls (`All`, `System`, `Custom`) in `src/features/access-control/components/RoleFilters.tsx`.
- [x] T014 [US1] Implement system role protection and "Clone Role" modal in `src/features/access-control/components/CloneRoleModal.tsx`.
- [x] T015 [US1] Assemble the main `RolesDashboard.tsx` in `src/features/access-control/RolesDashboard.tsx` integrating metrics, table, filters, and clone dialog.
- [x] T016 [P] [US1] Write component tests in `src/features/access-control/RolesDashboard.test.tsx` verifying metric calculations, table rendering, search filtering, and clone action dispatch.

---

## Phase 4: User Story 2 - Hierarchical Permission Matrix & Subscription Awareness (Priority: P1) 🎯 MVP

**Goal**: Build the expandable module permission matrix with multi-action columns, tri-state checkboxes, and dormant "Plan restricted" visual indicators.

- [x] T017 [US2] Implement `src/features/access-control/components/TriStateCheckbox.tsx` supporting `checked`, `indeterminate`, and `unchecked` states with accessible keyboard navigation.
- [x] T018 [US2] Implement `src/features/access-control/components/PlanRestrictedBadge.tsx` displaying a lock icon, plan tier badge, and tooltip explaining why the capability is plan-restricted.
- [x] T019 [US2] Build `src/features/access-control/components/ModuleMatrixRow.tsx` rendering expandable module accordions, tri-state group header, "Select All" / "Clear All" shortcuts, and action columns (`View`, `Create`, `Edit`, `Delete`, `Approve`, `Export`).
- [x] T020 [US2] Build `src/features/access-control/PermissionMatrix.tsx` with real-time capability search, auto-expanding matched modules, and reactive grant toggling.
- [x] T021 [US2] Implement sticky right-hand summary panel in `src/features/access-control/components/RoleSummarySidebar.tsx` displaying granted counts, plan-restricted counts, current scope, and unsaved changes alert.
- [x] T022 [P] [US2] Write component tests in `src/features/access-control/PermissionMatrix.test.tsx` testing tri-state checkboxes, "Select All" / "Clear All", search filtering, and plan restriction tooltips.

---

## Phase 5: User Story 3 - Contextual Resource Access Scoping (Priority: P1)

**Goal**: Configure project boundaries (`all_projects`, `team_projects`, `assigned_projects`, `specific_projects`) for custom roles.

- [x] T023 [US3] Build `src/features/access-control/ResourceAccessPanel.tsx` with radio options and descriptive explanations for all 4 resource scopes.
- [x] T024 [US3] Add specific project multi-select picker with search in `src/features/access-control/components/SpecificProjectPicker.tsx` enabled when `specific_projects` is selected.
- [x] T025 [US3] Integrate `ResourceAccessPanel` into the Role Editor and synchronize with the sticky summary panel.
- [x] T026 [P] [US3] Write component tests in `src/features/access-control/ResourceAccessPanel.test.tsx` verifying radio selection, specific project toggling, and draft state updates.

---

## Phase 6: User Story 4 - 3-Step Guided Role Creation Wizard & Impact Analysis (Priority: P2)

**Goal**: Guided 3-step wizard with predefined templates and pre-commit impact analysis modal.

- [x] T027 [US4] Build Step 1 (Basic Information & Template Picker) in `src/features/access-control/wizard/WizardStepBasicInfo.tsx` allowing administrators to choose from the 5 predefined templates.
- [x] T028 [US4] Build Step 2 (Permissions & Scope) in `src/features/access-control/wizard/WizardStepPermissions.tsx` embedding the `PermissionMatrix` and `ResourceAccessPanel`.
- [x] T029 [US4] Build Step 3 (Review & Summary) in `src/features/access-control/wizard/WizardStepReview.tsx` displaying human-readable summary, plan warnings, and high-risk flags.
- [x] T030 [US4] Assemble `src/features/access-control/CreateRoleWizard.tsx` managing wizard state, step progression, and draft persistence.
- [x] T031 [US4] Implement `src/features/access-control/components/ChangeImpactModal.tsx` showing affected user count, diff badges (added/removed permissions), and confirmation before saving existing role edits.
- [x] T032 [P] [US4] Write component tests in `src/features/access-control/CreateRoleWizard.test.tsx` verifying template selection, step validation, and impact modal calculation.

---

## Phase 7: User Story 5 - Effective Access Preview Simulator & Audit Log (Priority: P2)

**Goal**: In-browser diagnostic simulation sandbox and immutable audit trail viewer.

- [x] T033 [US5] Build interactive controls in `src/features/access-control/simulator/SimulatorControls.tsx` (Select User/Role, Select Module/Action, Select Project).
- [x] T034 [US5] Build visual 4-stage pipeline visualization in `src/features/access-control/simulator/SimulatorPipelineView.tsx` with pass/fail/warn indicators.
- [x] T035 [US5] Build plain-language diagnostic explanation card in `src/features/access-control/simulator/SimulatorResultCard.tsx`.
- [x] T036 [US5] Assemble `src/features/access-control/AccessPreviewSimulator.tsx` integrating controls, pipeline view, and diagnostic output.
- [x] T037 [US5] Build chronological audit timeline in `src/features/access-control/AccessAuditLog.tsx` with actor attribution, timestamp, and diff viewer.
- [x] T038 [P] [US5] Write component tests in `src/features/access-control/AccessPreviewSimulator.test.tsx` verifying simulation execution and stage rendering.

---

## Phase 8: User Story 6 - User-to-Role Assignment & Navigation Integration (Priority: P2)

**Goal**: Member assignment interface, last-owner lockout safeguards, and settings layout integration.

- [x] T039 [US6] Build `src/features/access-control/RoleMembersTab.tsx` inside the Role Editor showing assigned users, with assign/unassign actions.
- [x] T040 [US6] Enforce last-owner safeguard in UI with warning toast/modal preventing revocation of the sole Owner.
- [x] T041 [US6] Assemble the full-width `RoleEditorView.tsx` in `src/features/access-control/RoleEditorView.tsx` with 5 tabs (`Overview`, `Permissions`, `Resource Access`, `Members`, `History`) and unsaved changes navigation guard.
- [x] T042 [US6] Update `src/features/settings/SettingsLayout.tsx` and routes to add `Access & Security` section with sub-links (`Roles & Permissions`, `Access Audit Log`), separated from `Billing & Subscription`.
- [x] T043 [P] [US6] Write component tests in `src/features/access-control/RoleEditorView.test.tsx` testing tab navigation, unsaved changes confirmation, and last-owner protection.

---

## Phase 9: End-to-End Verification & Five-Stage Quality Gate

**Goal**: Playwright integration test and 100% clean pass across all 5 quality gate stages.

- [x] T044 [E2E] Create Playwright E2E test in `e2e/role-management-and-permissions.spec.ts` covering:
  - Landing on Roles & Permissions dashboard.
  - Cloning a system role (`Designer` -> `Junior Designer`).
  - Configuring permissions in the hierarchical matrix with tri-state toggles.
  - Configuring `assigned_projects` resource scope.
  - Reviewing the impact summary and saving changes.
  - Simulating access for an assigned user vs unassigned user in the simulator.
  - Verifying the audit log records the clone and update events.
- [x] T045 Update `docs/ACCEPTANCE_TESTS.md` with Feature 033 test cases.
- [x] T046 [Gate] Run Stage 1: `npm run lint` and verify 0 errors.
- [x] T047 [Gate] Run Stage 2: `npm run typecheck` and verify `tsc -b` passes cleanly.
- [x] T048 [Gate] Run Stage 3: `npm run test` and verify all Vitest tests pass.
- [x] T049 [Gate] Run Stage 4: `npm run build` and verify production bundle builds cleanly.
- [x] T050 [Gate] Run Stage 5: `npm run e2e` and verify all Playwright tests pass.
