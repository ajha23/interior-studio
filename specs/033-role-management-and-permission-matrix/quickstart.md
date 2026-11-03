# Quickstart Guide: Feature 033 - Role Management Dashboard & Permission Matrix

This guide explains how to develop, test, and verify the Role Management Dashboard, Hierarchical Permission Matrix, Guided Role Editor, and Access Simulator.

---

## 1. Running Unit & Integration Tests

```bash
# Run all access control & role management unit tests
npx vitest run src/domain/platform/authorization/
npx vitest run src/features/access-control/

# Run specific domain service tests
npx vitest run src/domain/platform/authorization/adminRoleService.test.ts
npx vitest run src/domain/platform/authorization/accessSimulator.test.ts
```

---

## 2. Running E2E Workflows

```bash
# Run Playwright E2E tests for roles and permissions
npx playwright test e2e/role-management-and-permissions.spec.ts
```

---

## 3. Key Navigation & UI Paths

Inside the application:
1. Open **Settings** via the sidebar gear icon or user menu.
2. Select **Access & Security** in the settings sidebar.
3. Access sub-tabs:
   - **Roles & Permissions**: Main dashboard table and metric counters.
   - **Create Role Wizard**: 3-step modal with starter templates.
   - **Role Configuration Editor**: Click "Edit" on any custom role.
   - **Resource Access**: Project and team scoping panel.
   - **Access Preview Simulator**: Interactive simulation sandbox.
   - **Access Audit Log**: Chronological audit trail.

---

## 4. Architectural Boundaries

- Domain core: `src/domain/platform/authorization/` (or `src/domain/platform/rbac/`)
  - Framework-free TypeScript.
  - Zero imports from React, Three.js, Zustand, or browser DOM.
- State management: `src/state/authorizationStore.ts`, `src/state/roleManagementStore.ts`
- Presentation: `src/features/access-control/`
  - `RolesDashboard.tsx`
  - `RoleEditorView.tsx`
  - `PermissionMatrix.tsx`
  - `ResourceAccessPanel.tsx`
  - `CreateRoleWizard.tsx`
  - `AccessPreviewSimulator.tsx`
  - `AccessAuditLog.tsx`
