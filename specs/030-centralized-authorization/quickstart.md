# Quickstart Validation Guide: Centralized Modular Architecture & Dynamic Authorization

**Feature**: `030-centralized-authorization`  
**Purpose**: Runnable step-by-step validation guide demonstrating end-to-end module registration, dynamic role creation, scoped authorization evaluation, and security enforcement.

---

## Prerequisites

1. Node.js `>= 22` and project dependencies installed (`npm install`).
2. Test runner available (`npx vitest`).
3. Local environment configured with standard test organizations and users.

---

## Scenario 1: Module Capability & Permission Registration

Demonstrates how a business module registers its identity, dependencies, and action permissions at initialization.

### Step 1.1: Register a Business Module
```typescript
import { moduleRegistry } from '@/domain/platform/authorization/moduleRegistry';

// Register the 3D CAD/CAM Engine module
moduleRegistry.registerModule({
  id: 'module-cad-engine',
  name: '3D CAD & Manufacturing Engine',
  version: '1.0.0',
  description: 'Parametric 3D scene modeling, cabinet explode, and cut list generation',
  dependencies: ['@studio/core', '@studio/catalog'],
  capabilities: [
    {
      key: 'designs.3d',
      title: '3D Scene Design',
      description: 'Interact with and modify 3D cabinetry',
      defaultScopes: ['all_projects', 'assigned_projects'],
    },
    {
      key: 'production.cutlist',
      title: 'Manufacturing Exports',
      description: 'Generate OptiCut CSV and DXF shop drawings',
      defaultScopes: ['all_projects'],
    },
  ],
});
```

### Step 1.2: Register Granular Action Permissions
```typescript
moduleRegistry.registerPermissions('module-cad-engine', [
  {
    id: 'designs.3d.view',
    moduleId: 'module-cad-engine',
    resource: 'designs',
    action: 'view',
    title: 'View 3D Design',
    description: 'Inspect 3D viewport and scene elements',
    supportedScopes: ['all_projects', 'assigned_projects', 'client_projects'],
  },
  {
    id: 'designs.3d.edit',
    moduleId: 'module-cad-engine',
    resource: 'designs',
    action: 'edit',
    title: 'Edit 3D Design',
    description: 'Modify cabinet dimensions, positions, and finishes',
    supportedScopes: ['all_projects', 'assigned_projects'],
  },
  {
    id: 'production.cutlist.download',
    moduleId: 'module-cad-engine',
    resource: 'production',
    action: 'download',
    title: 'Download Cut Lists',
    description: 'Download OptiCut 16-column CSV and part labels',
    supportedScopes: ['all_projects'],
  },
]);
```

**Expected Outcome**: `moduleRegistry.getModule('module-cad-engine')` returns the registered definition; permissions appear in `moduleRegistry.getAllPermissions()`.

---

## Scenario 2: Administrator Creates a Custom Role with Scoped Permissions

Demonstrates creating a specialized "External Drafter" role restricted to `assigned_projects`.

### Step 2.1: Execute Role Creation
```typescript
import { adminRoleService } from '@/domain/platform/authorization/adminRoleService';

const drafterRole = await adminRoleService.createRole('admin_user_uuid', {
  orgId: 'org_studio_01',
  name: 'External Drafter',
  description: 'Contract draftsman limited to assigned projects only',
  rank: 50,
  initialPermissions: [
    { permissionId: 'designs.3d.view', scopeType: 'assigned_projects' },
    { permissionId: 'designs.3d.edit', scopeType: 'assigned_projects' },
  ],
});
```

**Expected Outcome**: Custom role is saved in `public.roles` with `is_system_role = false` and `org_id = 'org_studio_01'`. An audit event `roles.created` is emitted.

---

## Scenario 3: Additive Union Evaluation Across Multiple Roles

Demonstrates a user holding two roles:
- Role 1: `External Drafter` (grants `designs.3d.edit` on `assigned_projects`)
- Role 2: `Reviewer` (grants `designs.3d.view` on `all_projects`)

### Step 3.1: Evaluate Access on an Assigned Project
```typescript
import { evaluateAuthorization } from '@/domain/platform/authorization/evaluator';

const actor = {
  id: 'user_drafter_01',
  orgId: 'org_studio_01',
  roles: [
    {
      roleId: drafterRole.id,
      rank: 50,
      permissions: [
        { permissionId: 'designs.3d.view', scopeType: 'assigned_projects' },
        { permissionId: 'designs.3d.edit', scopeType: 'assigned_projects' },
      ],
    },
    {
      roleId: 'viewer',
      rank: 20,
      permissions: [
        { permissionId: 'designs.3d.view', scopeType: 'all_projects' },
      ],
    },
  ],
};

// Project Alpha: user is assigned
const resultAssigned = evaluateAuthorization(actor, 'designs.3d.edit', {
  projectId: 'proj_alpha',
  assignedUserIds: ['user_drafter_01'],
});
// resultAssigned.allowed === true
```

### Step 3.2: Evaluate Access on an Unassigned Project
```typescript
// Project Beta: user is NOT assigned
const resultUnassignedEdit = evaluateAuthorization(actor, 'designs.3d.edit', {
  projectId: 'proj_beta',
  assignedUserIds: ['user_other_02'],
});
// resultUnassignedEdit.allowed === false (insufficient scope)

const resultUnassignedView = evaluateAuthorization(actor, 'designs.3d.view', {
  projectId: 'proj_beta',
  assignedUserIds: ['user_other_02'],
});
// resultUnassignedView.allowed === true (granted via Viewer role on all_projects)
```

**Expected Outcome**: Additive union evaluation allows viewing all projects while restricting edits strictly to assigned projects.

---

## Scenario 4: Automated Verification Suite Execution

Run the complete test suite to verify module registration, pure evaluator determinism, and RLS security policies:

```bash
# 1. Run unit & authorization evaluator tests
npx vitest run src/domain/platform/authorization/

# 2. Run component tests for Admin Role Management UI
npx vitest run src/features/table-editor/

# 3. Run full verification gate
npm run check
```

**Expected Outcome**: All authorization assertions pass with zero failures and zero TypeScript lint warnings.
