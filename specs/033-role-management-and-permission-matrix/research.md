# Technical Research & Architectural Decisions: Feature 033

**Feature**: Role Management Dashboard, Hierarchical Permission Matrix, and Guided Role Editor  
**Branch**: `033-role-management-and-permission-matrix`  
**Date**: 2026-11-03  

## 1. Context & Problem Space

In a SaaS interior design application, access control cannot be treated as a flat list of checkboxes or tied exclusively to monolithic roles. As the product expands across 11 modules (Projects, 2D Floor Planning, 3D CAD, Rendering, Furniture Catalog, Commercial Estimates, Manufacturing/CNC, Client Deliverables, AI Tools, Governance, Reports), administrators require:
1. Clear structural hierarchy (Modules -> Capabilities -> Actions).
2. Decoupled subscription plan licensing from RBAC assignment.
3. Resource-level scoping (project-level boundaries for designers and teams).
4. Deterministic access simulation and pre-commit impact analysis to prevent accidental privilege escalations or lockouts.

---

## 2. Research Question 1: Matrix Representation vs AWS-Style Policy vs Okta Resource Sets

### Alternatives Explored:
1. **Flat Checkbox List (Naive)**:
   - *Pros*: Simple to code.
   - *Cons*: Fails quickly beyond 10-15 permissions. Overwhelms administrators, lacks contextual scoping, high risk of misconfiguration.
2. **Pure AWS-Style Visual Policy Editor**:
   - *Pros*: Extremely expressive (JSON-like statements with Effect, Action, Resource, Condition).
   - *Cons*: Far too complex for interior design studio owners/managers who are not cloud engineers.
3. **Hybrid Okta-Style Resource Sets + Expandable Action Grid (Chosen)**:
   - *Pros*:
     - Intuitive module accordions with tri-state parent indicators.
     - Capability rows with clean action columns (`View`, `Create`, `Edit`, `Delete`, `Approve`, `Export`) displaying only valid actions per module.
     - Clean separation of *What can you do?* (Permissions tab) from *Where can you do it?* (Resource Access tab).
     - Clear right-hand sticky inspector providing live feedback on granted vs plan-restricted counts.
   - *Decision*: Adopt the Hybrid Okta-Style Resource Set + Action Grid.

---

## 3. Research Question 2: Subscription Entitlements vs Role Grants (Dormant State Handling)

### Problem:
What happens when a tenant on a `Pro` plan configures a role with `3D Photorealistic Rendering` and `AutoCAD DXF Export`, and subsequently downgrades to `Starter` (which does not include those capabilities)?

### Alternatives:
1. **Destructive Stripping**: Automatically remove the permissions from all roles upon downgrade.
   - *Drawback*: Destroys administrator intent. If the customer upgrades back to Pro next month, all custom roles are broken and require tedious manual re-entry. Violates Constitution Principle X ("Zero silent deletion guarantee").
2. **Subscription-Independent Execution**: Allow the role permission to bypass subscription tier.
   - *Drawback*: Major commercial vulnerability. Users bypass billing plans. Violates Constitution Principle X.
3. **Dormant Permission Grants with Runtime Policy Enforcement (Chosen)**:
   - *Design*: The role's configuration preserves the grant (`role_permissions` retains the record). In the UI, the capability is visually badged as `Plan restricted` with a lock icon and tooltip ("Requires Pro Studio Plan"). In the backend, `PolicyEvaluationEngine` evaluates:
     $$\text{AccessAllowed} = \text{TenantValid} \land \text{SubscriptionEntitled} \land \text{RolePermissionGranted} \land \text{ResourceScopeValid}$$
   - Because `SubscriptionEntitled` evaluates to `false`, access is blocked with code `SUBSCRIPTION_UNENTITLED`. When the tenant re-upgrades, the grant immediately springs back to life without manual intervention.

---

## 4. Research Question 3: Multi-Role Additive Union & Last-Owner Safeguard

### Additive Union Strategy:
When a user has multiple assigned roles (e.g. `Designer` + `Reviewer`):
- Permissions are evaluated as the set union $\bigcup_{r \in \text{Roles}} \text{Permissions}(r)$.
- Scopes are evaluated additively: if Role A gives `assigned_projects` for editing, but Role B gives `all_projects` for viewing, the user gets `all_projects` for viewing and `assigned_projects` for editing.
- Denials are non-destructive: lacking a grant in Role A does not negate a grant present in Role B (standard Additive RBAC).

### Last-Owner Protection:
- An organization MUST always retain at least one active user with the `Owner` system role.
- Mutations that would result in zero active owners (deleting the last owner, revoking the owner role, deactivating the user, or downgrading their role rank) are intercepted and rejected at the domain boundary with an invariant violation error: `CANNOT_REMOVE_LAST_OWNER`.

---

## 5. Research Question 4: Effective Access Simulator Architecture

To give administrators 100% confidence in security policies, the application provides an in-browser diagnostic simulation sandbox:
- **Inputs**:
  - `actorId` or `roleId` (e.g. "Priya Sharma (Designer)")
  - `moduleId` & `permissionId` (e.g. "3D Design & Rendering → Export DXF")
  - `projectId` / `resourceContext` (e.g. "Project #104 (Skyline Penthouse)", `assignedUserIds: ['user-123']`)
- **Evaluation Pipeline**:
  1. *Step 1: Tenant Check*: Verifies tenant status is active or trial.
  2. *Step 2: Subscription Entitlement Check*: Queries `EntitlementRegistry` and tenant's active plan.
  3. *Step 3: RBAC Role Check*: Evaluates whether any assigned role has the target `permissionId`.
  4. *Step 4: Resource Scope Check*: Evaluates whether target project matches role's scope (`all_projects`, `team_projects`, `assigned_projects`, `specific_projects`).
- **Output**:
  - `verdict`: `ALLOWED` or `DENIED`
  - `stageFailed`: `null` if allowed, or `TENANT` | `SUBSCRIPTION` | `ROLE` | `SCOPE`
  - `diagnosticExplanation`: Human-readable explanation of why access was granted or denied.

---

## 6. Pre-Commit Impact Analysis UX

When an administrator edits an existing role that has assigned members:
- The system calculates a diff:
  - $\Delta_{\text{added}} = \text{NewPermissions} \setminus \text{OldPermissions}$
  - $\Delta_{\text{removed}} = \text{OldPermissions} \setminus \text{NewPermissions}$
  - $\Delta_{\text{scope}} = \text{OldScope} \neq \text{NewScope}$
- A modal dialog appears:
  - "This change will immediately affect **12 active users**."
  - Displays badges for added permissions (green) and removed permissions (amber/red).
  - Highlights any high-risk capabilities being granted (e.g. `delete_projects`, `manage_roles`, `view_pii`).
  - Requires explicit confirmation before committing.
- On commit, an append-only `RoleAuditEvent` is dispatched to the audit store.
