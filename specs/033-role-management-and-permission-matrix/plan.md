# Implementation Plan: Role Management Dashboard, Hierarchical Permission Matrix, and Guided Role Editor

**Branch**: `033-role-management-and-permission-matrix` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/033-role-management-and-permission-matrix/spec.md`

---

## Summary

This feature implements an enterprise-grade administrative access control system for Interior Studio's multi-tenant SaaS application. It provides:
1. **Roles & Permissions Dashboard**: Summary cards, role data table, search/filters, protected system roles, and clone-to-custom actions.
2. **Hierarchical Permission Matrix**: Expandable module accordions, multi-action grid (`View`, `Create`, `Edit`, `Delete`, `Approve`, `Export`), tri-state module checkboxes, real-time search, and subscription plan-awareness (marking unentitled capabilities as dormant "Plan restricted").
3. **Contextual Resource Scoping**: Configuration of project boundaries (`all_projects`, `team_projects`, `assigned_projects`, `specific_projects`).
4. **3-Step Guided Role Wizard**: Creation workflow with predefined templates (`Project Manager`, `Senior Designer`, `Designer`, `Reviewer`, `Client Viewer`) and pre-commit impact analysis with diff calculations.
5. **Effective Access Simulator**: Diagnostic sandbox modeling the 4-stage pipeline ($\text{Tenant} \land \text{Subscription} \land \text{Role} \land \text{Scope}$) with clear explanatory outputs.
6. **Access Audit Log & Member Management**: Multi-role additive assignments, last-owner lockout safeguards, and immutable audit logs.

---

## Technical Context

**Language/Version**: TypeScript 5.8 (Strict mode: `strict: true`, `noImplicitAny: true`, `noUncheckedIndexedAccess: true`)  
**Primary Dependencies**: React 19, Tailwind CSS, Lucide React (icons), Zod (runtime validation), Zustand (state management)  
**Storage**: Framework-free domain service (`AdminRoleService`), backed by persistent store (`src/state/roleManagementStore.ts`) and PostgreSQL RLS on the server  
**Testing**: Vitest 3 for domain and component tests, Playwright 1.50 for browser E2E workflows  
**Target Platform**: Modern desktop browsers (Chromium, Firefox, WebKit)  
**Performance Goals**: <50ms permission search across all modules, <100ms effective access simulation pass, 0 layout shifts on matrix expansion  
**Constraints**: Zero React/DOM imports in `src/domain/platform/authorization/` (Constitution Principle I); Additive RBAC; Zero silent deletion on subscription downgrades (Constitution Principle X)

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-checked after Phase 1 design.*

- [x] **Principle I (Framework-Free Domain)**: Domain entities and logic reside in `src/domain/platform/authorization/`. No React, Three.js, or DOM code imported. Enforced by ESLint `no-restricted-imports`.
- [x] **Principle II (Command Pattern & Invariant Validation)**: All role mutations validate inputs via Zod schemas and enforce business invariants (last-owner safeguard, rank bounds, scope integrity).
- [x] **Principle VI (Modular Architecture & Dynamic Configurable Authorization)**: Role definitions, permissions, and module capabilities are fully configurable without modifying business module code. System roles are immutable templates.
- [x] **Principle VII (Multi-Tenant Isolation & DPDP)**: Roles, permissions, assignments, and audit events are strictly partitioned by `org_id`. Cross-tenant access is rejected.
- [x] **Principle VIII (Schema Evolution & Stability)**: Role entity IDs are permanent UUIDs; modifications update in-place without deleting and recreating.
- [x] **Principle IX (Test-First Quality & Five-Stage Gate)**: Comprehensive unit tests, component tests, and Playwright E2E tests planned for full pass on `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.
- [x] **Principle X (Multi-Tenant SaaS Architecture & Subscription Entitlements)**: Subscription plan entitlements are decoupled from RBAC. Unentitled permissions remain saved in role definitions as dormant "Plan restricted" without silent deletion. Backend policy engine enforces both dimensions.

---

## Project Structure

### Documentation (this feature)
```text
specs/033-role-management-and-permission-matrix/
├── spec.md                     # Feature specification with 8-part SaaS requirements
├── checklists/
│   └── requirements.md         # Requirements verification checklist
├── research.md                 # Technical research & UX architecture decisions
├── data-model.md               # Domain models, Zod schemas, templates & invariants
├── contracts/                  # Contract definitions
│   ├── role-management.contract.ts
│   ├── permission-registry.contract.ts
│   └── access-simulator.contract.ts
├── quickstart.md               # Developer quickstart and testing guide
├── plan.md                     # Implementation plan (this file)
└── tasks.md                    # Generated task breakdown (by /speckit-tasks)
```

### Source Code Architecture
```text
src/
├── domain/platform/authorization/
│   ├── types.ts                    # Updated Zod schemas for custom roles, scopes, templates, and audit
│   ├── moduleRegistry.ts           # Central registry of modules, capabilities, and actions
│   ├── bootstrap.ts                # Bootstrap 11 business modules with rich actions & metadata
│   ├── roleTemplates.ts            # Predefined industry role templates (PM, Senior Designer, etc.)
│   ├── adminRoleService.ts         # Pure domain service for role CRUD, cloning, impact diffs, and audit
│   ├── accessSimulator.ts          # Pure domain simulator evaluating the 4-stage pipeline
│   └── evaluator.ts                # Additive RBAC evaluator with resource scoping
├── state/
│   ├── authorizationStore.ts       # Active actor context and fast permission checks
│   └── roleManagementStore.ts      # Zustand store for admin dashboard, matrix draft, and simulator
├── features/
│   └── access-control/
│       ├── RolesDashboard.tsx           # Landing page with summary metrics & roles data table
│       ├── CreateRoleWizard.tsx         # 3-step guided creation modal with templates
│       ├── RoleEditorView.tsx           # Full-width role editor with 5 tabs and sticky summary
│       ├── PermissionMatrix.tsx         # Expandable hierarchical matrix with action columns & tri-state
│       ├── ResourceAccessPanel.tsx      # Resource scoping tab (all, team, assigned, specific)
│       ├── RoleMembersTab.tsx           # Member assignment management with last-owner warning
│       ├── AccessPreviewSimulator.tsx   # Interactive simulator sandbox with 4-stage decision breakdown
│       ├── AccessAuditLog.tsx           # Append-only chronological audit log
│       └── components/
│           ├── ChangeImpactModal.tsx    # Pre-commit impact analysis modal
│           ├── PlanRestrictedBadge.tsx  # Badge and tooltip for plan-restricted capabilities
│           └── TriStateCheckbox.tsx     # Indeterminate checkbox primitive
└── features/settings/
    └── SettingsLayout.tsx          # Navigation integration: Settings → Access & Security → Roles & Permissions
```

---

## Implementation Phases

### Phase 1: Pure Domain Enhancements (`src/domain/platform/authorization/`)
- Extend `types.ts` with `ModuleAction`, `RoleResourceScopeConfig`, `RoleTemplate`, `ChangeImpactAnalysis`, and `RoleAuditEvent`.
- Enrich `bootstrap.ts` to ensure all 11 modules declare standard action columns (`view`, `create`, `edit`, `delete`, `approve`, `export`) and associate canonical subscription entitlement keys.
- Create `roleTemplates.ts` with 5 curated templates (`Project Manager`, `Senior Designer`, `Designer`, `Reviewer`, `Client Viewer`).
- Enhance `adminRoleService.ts` to support:
  - `calculateChangeImpact()`: Compute affected user count, added/removed permissions, and high-risk flags.
  - Clone system role to custom role.
  - Enforce last-owner safeguard (`CANNOT_REMOVE_LAST_OWNER`).
  - Record structured `RoleAuditEvent`s.
- Create `accessSimulator.ts` implementing `simulateAccess()` with 4-stage evaluation.

### Phase 2: State Layer (`src/state/roleManagementStore.ts`)
- Implement `roleManagementStore.ts` managing:
  - Role list, active filters, search query.
  - Draft role state with unsaved-changes tracking.
  - Change impact analysis modal state.
  - Simulator inputs and live evaluation result.
  - Audit log query and pagination.
  - Synchronize with `useSubscriptionStore` to detect current tenant plan and plan-restricted permissions.

### Phase 3: Presentation - Roles & Permissions Dashboard (US1 MVP)
- Build `RolesDashboard.tsx`:
  - 4 Metric cards: Total Roles, Custom Roles, Assigned Users, Plan-Restricted Roles.
  - Roles table with columns: Role Name, Type (System vs Custom badge), Members, Granted Permissions, Scope, Last Updated, Actions menu (Edit, Clone, Deactivate).
  - Search input, Type filter dropdown (`All`, `System`, `Custom`).
  - Protected system role badges and disabled delete action.
  - "Create Role" button triggering Wizard.

### Phase 4: Presentation - Hierarchical Permission Matrix & Resource Access (US2 & US3)
- Build `PermissionMatrix.tsx`:
  - Expandable module sections with category badges and icons.
  - Tri-state parent module checkboxes (`checked`, `indeterminate`, `unchecked`).
  - Action columns (`View`, `Create`, `Edit`, `Delete`, `Approve`, `Export`) rendering only relevant action checkboxes.
  - "Select All" and "Clear All" shortcuts per module.
  - Real-time search across permissions with auto-expanding matching modules.
  - `PlanRestrictedBadge` displaying lock icon, required plan tier, and upgrade tooltip.
- Build `ResourceAccessPanel.tsx`:
  - Radio options: All Organization Projects, Team Projects Only, Assigned Projects Only, Specific Projects.
  - Multi-select project picker for specific projects.
- Build `RoleEditorView.tsx`:
  - Sticky right-hand summary panel: granted counts, plan-restricted counts, scope summary, unsaved changes badge.
  - Discard/Cancel confirmation guard.

### Phase 5: Presentation - 3-Step Guided Wizard & Change Impact Modal (US4)
- Build `CreateRoleWizard.tsx`:
  - Step 1: Basic Information + Template picker cards with pre-filled defaults.
  - Step 2: Permissions Matrix & Resource Scoping.
  - Step 3: Review & Summary with high-risk permission warnings and affected resources.
- Build `ChangeImpactModal.tsx`:
  - Display number of affected members.
  - Visual diff of added (green) and removed (red) permissions.
  - Confirm / Cancel prompt before committing save.

### Phase 6: Presentation - Access Preview Simulator & Audit Log (US5 & US6)
- Build `AccessPreviewSimulator.tsx`:
  - Interactive controls: Select User/Role, Select Module/Action, Select Project/Context.
  - 4-Stage visual pipeline indicator:
    1. Tenant Validation
    2. Subscription Entitlement (Plan check)
    3. RBAC Role Grant
    4. Resource Scope Validation
  - Plain-language diagnostic summary explaining the decision and any required upgrade or assignment remedy.
- Build `RoleMembersTab.tsx` and `UsersRoleAssignments.tsx`:
  - List assigned members for a role.
  - Multi-role assignment with additive union visualization.
  - Last-owner lockout blocking UI.
- Build `AccessAuditLog.tsx`:
  - Chronological timeline with filter by role/actor.
  - Visual before/after diff inspector.

### Phase 7: Navigation & Settings Integration
- Integrate with `SettingsLayout.tsx`:
  - Route: `Settings → Access & Security → Roles & Permissions`.
  - Guard route so only `Owner` and `Admin` users can view/interact.
  - Verify separation from `Billing & Subscription`.

### Phase 8: E2E Verification & Five-Stage Quality Gate
- Write comprehensive Vitest unit tests for:
  - `adminRoleService.test.ts` (clone, impact analysis, last-owner safeguard).
  - `accessSimulator.test.ts` (4-stage pipeline, dormant plan-restricted permissions, additive union).
  - `PermissionMatrix.test.tsx` (tri-state checkboxes, search filtering, plan restriction badges).
- Write Playwright E2E test in `e2e/role-management-and-permissions.spec.ts`:
  - Complete user journey: View dashboard -> Clone system role -> Modify in matrix -> Configure scope -> Inspect impact -> Save -> Run access simulator -> Verify audit entry.
- Execute full quality gate in exact order:
  `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
