# Tasks: Centralized Modular Architecture & Dynamic Authorization Platform

**Input**: Design documents from `/specs/030-centralized-authorization/`  
**Prerequisites**: [plan.md](./plan.md) (required), [spec.md](./spec.md) (required), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)  
**Governance**: Adheres to [Constitution v2.1.0 Principle VI](../../.specify/memory/constitution.md)  

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Module boundaries, type definitions, and schema primitives.

- [X] T001 Initialize authorization module directory structure and public exports in `src/domain/platform/authorization/index.ts`
- [X] T002 [P] Define core Zod schemas and TypeScript types (`ModuleDefinition`, `PermissionDefinition`, `CustomRole`, `RolePermissionMapping`, `ResourceScopeType` enum `'all_projects' | 'assigned_projects' | 'team_projects' | 'client_projects'`, `rank` integer between 1 and 100, `status` enum `'active' | 'deactivated'`) in `src/domain/platform/authorization/types.ts`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Database schema migrations, RLS security functions, and Central Module Registry.

**⚠️ CRITICAL**: No user story work can begin until this foundational phase is complete.

- [X] T003 Create PostgreSQL database migration for custom tenant roles, permissions, scopes, and project memberships (`public.roles`, `public.permissions`, `public.role_permissions`, `public.project_members`) in `supabase/migrations/00006_dynamic_custom_roles.sql`
- [X] T004 [P] Update database STABLE security definer function `authorize(p_org_id uuid, p_permission text, p_project_id uuid)` with additive union scope evaluation in `supabase/migrations/00006_dynamic_custom_roles.sql`
- [X] T005 [P] Implement central `ModuleRegistry` with topological dependency ordering and Kahn's cycle-detection algorithm in `src/domain/platform/authorization/moduleRegistry.ts`
- [X] T006 [P] Unit tests for `ModuleRegistry` registration, retrieval, and circular dependency rejection in `src/domain/platform/authorization/moduleRegistry.test.ts`

**Checkpoint**: Foundation ready — User story implementation can now begin.

---

## Phase 3: User Story 1 - Central Module & Capability Registration (Priority: P1) 🎯 MVP

**Goal**: All business modules register capabilities and action permissions at application initialization through the central framework.

**Independent Test**: Register a business module with declared permissions and verify via `moduleRegistry.getModule()` and `moduleRegistry.getAllPermissions()` that all capabilities are indexed without circular dependencies.

### Tests for User Story 1
- [X] T007 [P] [US1] Unit tests for module registration, permission indexing, and graph validation in `src/domain/platform/authorization/registration.test.ts`

### Implementation for User Story 1
- [X] T008 [US1] Register baseline studio modules (Projects, 2D/3D CAD Engine, Catalog, Materials, Commercial Estimates, Deliverables) with standard action permissions in `src/domain/platform/authorization/bootstrap.ts`
- [X] T009 [US1] Implement module and permission query helper methods (`getRegisteredModules`, `getAllPermissions`, `getPermissionsForModule`) in `src/domain/platform/authorization/moduleRegistry.ts`

**Checkpoint**: User Story 1 functional — modules declare capabilities in one authoritative registry.

---

## Phase 4: User Story 2 - Administrator Custom Role & Permission Management (Priority: P1)

**Goal**: Studio administrators can create, edit, clone, and deactivate custom studio roles, assigning granular permissions across registered modules via an administrative interface without code changes.

**Independent Test**: An administrator creates a custom role (e.g. "External Drafter"), assigns only 2D viewing and editing permissions, and verifies the role is saved and available for assignment.

### Tests for User Story 2
- [X] T010 [P] [US2] Unit tests for role lifecycle (`createRole`, `cloneRole`, `updateRolePermissions`, `deactivateRole`, `deleteRole` with safety guards) in `src/domain/platform/authorization/adminRoleService.test.ts`
- [X] T011 [P] [US2] Component tests for `RoleManagementPanel` and `PermissionMatrixGrid` in `src/features/table-editor/RoleManagementPanel.test.tsx`

### Implementation for User Story 2
- [X] T012 [US2] Implement `AdminRoleService` domain service with system role immutability (`is_system_role = true` cannot be edited) and last-owner protection in `src/domain/platform/authorization/adminRoleService.ts`
- [X] T013 [US2] Implement `RoleManagementPanel` UI component with Create, Clone, and Deactivate controls in `src/features/table-editor/RoleManagementPanel.tsx`
- [X] T014 [US2] Implement `PermissionMatrixGrid` UI component with module accordions, capability checkboxes, and scope selectors in `src/features/table-editor/PermissionMatrixGrid.tsx`
- [X] T015 [US2] Integrate role management and permission matrix into Studio Table Editor / Admin settings view in `src/features/table-editor/StudioTableEditor.tsx`

**Checkpoint**: User Story 2 functional — custom roles and granular permission assignments managed dynamically in-app.

---

## Phase 5: User Story 3 - Resource-Level Project Scoping (Priority: P2)

**Goal**: Restrict user access using resource scopes (`all_projects`, `assigned_projects`, `team_projects`, `client_projects`) with Additive Union evaluation.

**Independent Test**: User with role scoped to `assigned_projects` accesses assigned project (ALLOW) and unassigned project (DENY).

### Tests for User Story 3
- [X] T016 [P] [US3] Unit tests for Additive Union multi-role scope resolution in `src/domain/platform/authorization/evaluator.test.ts`
- [X] T017 [P] [US3] Unit tests for project membership checks against assigned user IDs in `src/domain/platform/authorization/projectMembership.test.ts`

### Implementation for User Story 3
- [X] T018 [US3] Implement pure `evaluateAuthorization()` engine with additive union scope resolution logic in `src/domain/platform/authorization/evaluator.ts`
- [X] T019 [US3] Implement project team membership assignment helper and query methods in `src/domain/platform/authorization/projectMembership.ts`

**Checkpoint**: User Story 3 functional — project-level confidentiality enforced cleanly without proliferating roles.

---

## Phase 6: User Story 4 - Universal Deny-by-Default Backend Enforcement & UI Parity (Priority: P2)

**Goal**: Authoritative backend enforcement on every API/RPC endpoint independent of UI navigation, coupled with dynamic UI button and menu adaptation.

**Independent Test**: Unauthorized direct invocation of protected API/RPC returns 403 Forbidden; frontend UI disables or hides corresponding action button.

### Tests for User Story 4
- [X] T020 [P] [US4] Unit tests for `useAuthorize` hook and client authorization store in `src/state/authorizationStore.test.ts`
- [X] T021 [P] [US4] Server middleware integration tests verifying 403 Forbidden responses on unauthorized requests in `src/server/authorizationMiddleware.test.ts`

### Implementation for User Story 4
- [X] T022 [US4] Implement client authorization state and caching store in `src/state/authorizationStore.ts`
- [X] T023 [US4] Implement declarative React hook `useAuthorize(permission, resourceContext)` in `src/features/shared/useAuthorize.ts`
- [X] T024 [US4] Implement server-side authorization middleware guard for API and RPC endpoints in `src/server/authorizationMiddleware.ts`

**Checkpoint**: User Story 4 functional — zero-trust backend enforcement verified with responsive UI adaptation.

---

## Phase 7: User Story 5 - Auditable Governance & Access-Control Verification (Priority: P3)

**Goal**: Log all role creations, edits, and assignments to the append-only `audit_log`, and provide automated positive/negative test suites for every module.

**Independent Test**: Modify role permissions -> verify `audit_log` event `roles.updated` is emitted with actor, IP, timestamp, and diff.

### Tests for User Story 5
- [X] T025 [P] [US5] Unit tests for role and permission audit event emission in `src/domain/platform/authorization/auditIntegration.test.ts`
- [X] T026 [P] [US5] Automated positive and negative authorization test matrix verifying all registered business modules in `src/domain/platform/authorization/moduleAuthorizationMatrix.test.ts`

### Implementation for User Story 5
- [X] T027 [US5] Emit typed audit records (`roles.created`, `roles.updated`, `roles.deactivated`, `roles.deleted`, `members.role_assigned`) to append-only `audit_log` in `src/domain/platform/authorization/adminRoleService.ts`

**Checkpoint**: User Story 5 functional — compliance-ready audit trail and comprehensive authorization test coverage.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: System integration, end-to-end verification, and quality gate execution.

- [X] T028 [P] Update workspace package export maps and TypeScript path aliases in `tsconfig.json`
- [X] T029 End-to-end integration test verifying custom role creation, scope enforcement, and UI guard behavior in `e2e/custom-roles-and-authorization.spec.ts`
- [X] T030 Run full verification gate: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: Can start immediately.
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user stories.
- **User Story 1 (Phase 3)**: Depends on Foundational completion.
- **User Story 2 (Phase 4)**: Depends on User Story 1 completion.
- **User Story 3 (Phase 5)**: Depends on User Story 2 completion.
- **User Story 4 (Phase 6)**: Depends on User Story 3 completion.
- **User Story 5 (Phase 7)**: Depends on User Story 4 completion.
- **Polish (Phase 8)**: Depends on all user stories being complete.

---

## Parallel Opportunities

```bash
# Foundational Phase Parallel Execution:
Task T004: Update database STABLE security function in supabase/migrations/00006_dynamic_custom_roles.sql
Task T005: Implement central ModuleRegistry in src/domain/platform/authorization/moduleRegistry.ts
Task T006: Unit tests for ModuleRegistry in src/domain/platform/authorization/moduleRegistry.test.ts

# User Story 2 Parallel Execution:
Task T010: Unit tests for AdminRoleService in src/domain/platform/authorization/adminRoleService.test.ts
Task T011: Component tests for RoleManagementPanel in src/features/table-editor/RoleManagementPanel.test.tsx
Task T013: Implement RoleManagementPanel UI in src/features/table-editor/RoleManagementPanel.tsx
```

---

## Implementation Strategy

### MVP First (User Story 1 & Foundational)
1. Complete Phase 1 (Setup) and Phase 2 (Foundational: Database migration & `ModuleRegistry`).
2. Complete Phase 3 (User Story 1: Capability registration).
3. **STOP and VALIDATE**: Verify that modules cleanly register capabilities without circular dependencies.

### Incremental Delivery
1. Foundation + US1 $\implies$ Capabilities declared centrally.
2. US2 $\implies$ Admins can create and clone custom roles via Studio Table Editor.
3. US3 $\implies$ Resource scopes protect unassigned projects.
4. US4 $\implies$ Universal deny-by-default server guards and UI parity.
5. US5 $\implies$ Immutable audit trail and positive/negative test matrix.
