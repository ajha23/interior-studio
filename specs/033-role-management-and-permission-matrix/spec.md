# Feature Specification: Role Management Dashboard, Hierarchical Permission Matrix, and Guided Role Editor

**Feature Branch**: `033-role-management-and-permission-matrix`  
**Created**: 2026-11-03  
**Status**: Draft  
**Constitution Authority**: Principle VI (*Modular Architecture & Configurable Dynamic Authorization*), Principle X (*Multi-Tenant SaaS Architecture, Subscription Entitlements, and Plan-Based Feature Access*), Principle VII (*Multi-Tenant Isolation, Data Residency & Statutory DPDP Privacy*), Principle I (*Framework-Free Architectural Layer Isolation*)

---

## Summary

This feature delivers an enterprise-grade **Role Management Dashboard, Hierarchical Permission Matrix, Guided Role Editor, and Effective Access Simulator** for Interior Studio's multi-tenant SaaS application. It empowers tenant administrators to configure, clone, customize, and audit granular permissions across all application modules without code deployments or developer intervention.

Rather than presenting an unmanageable flat list of checkboxes, the system provides a hybrid governance architecture:
1. **Roles & Permissions Dashboard**: A table-based central dashboard displaying system and custom roles, member counts, granted capabilities, scopes, and governance statuses.
2. **Hierarchical Permission Matrix**: An expandable, module-grouped matrix with multi-action columns (`View`, `Create`, `Edit`, `Delete`, `Approve`, `Export`), tri-state group selection, permission search, and deep descriptions.
3. **Subscription-Aware Entitlement Decoupling**: Visual and computational distinction between role grants and subscription entitlements. Roles preserve configured permissions across subscription downgrades, marking unavailable capabilities as "Plan Restricted" with clear upgrade cues rather than silently stripping configuration.
4. **Contextual Resource Scoping**: Granular project and resource scoping (`all_projects`, `team_projects`, `assigned_projects`, `specific_projects`) configured alongside capabilities.
5. **3-Step Guided Role Wizard & Templates**: Streamlined creation with curated industry templates (`Project Manager`, `Senior Designer`, `Designer`, `Reviewer`, `Client Viewer`) and pre-commit impact analysis.
6. **Effective Access Simulation Sandbox**: An interactive administrator simulator that models and explains the exact evaluation pipeline ($\text{Tenant} \land \text{Subscription} \land \text{Role} \land \text{Scope}$) for any user, role, and resource combination before rollout.
7. **Audit & Governance Timeline**: Append-only audit history of every role change, member assignment, and scope modification with before/after diffs.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Roles & Permissions Dashboard & Predefined Templates (Priority: P1) 🎯 MVP

As an organization administrator, I want to view all system and custom roles in a table dashboard, search and filter roles, inspect member counts and scopes, and clone existing roles or templates into new custom roles.

**Why this priority**: Serves as the landing hub for all access management. Administrators need immediate visibility into who holds what permissions and the ability to safely bootstrap custom roles from system baselines without modifying protected system defaults.

**Independent Test**: Navigate to `Settings → Access & Security → Roles & Permissions`. View system roles (`Owner`, `Admin`, `Designer`, `Reviewer`, `Client Viewer`). Verify that system roles cannot be deleted, click "Clone", provide a name "Junior Designer", and verify that a new custom role is created with identical permissions and zero members.

**Acceptance Scenarios**:
1. **Given** an authenticated organization administrator, **When** navigating to the Roles & Permissions dashboard, **Then** the system displays metric counters (Total Roles, Custom Roles, Users Assigned, Plan-Restricted Roles) and a data table listing all roles with Type, Members, Permissions count, Scope, and Last Updated.
2. **Given** an immutable system role (e.g. `Owner` or `Admin`), **When** viewing the role actions menu, **Then** `Edit System Role` and `Delete Role` are disabled or hidden, and `Clone Role` is prominently available.
3. **Given** an administrator clicking "Create Role", **When** selecting the "Senior Designer" template, **Then** the guided wizard pre-populates the recommended name, description, rank, and permissions.
4. **Given** search and filter inputs on the dashboard, **When** searching for "Design" or filtering by `Type: Custom`, **Then** the table instantaneously filters without server roundtrips.

---

### User Story 2 - Hierarchical Permission Matrix & Subscription Awareness (Priority: P1) 🎯 MVP

As an organization administrator, I want to configure granular permissions within an expandable module hierarchy, using tri-state module checkboxes and action columns, while clearly seeing which capabilities are included in our current subscription plan versus plan-restricted.

**Why this priority**: Avoids flat checkbox fatigue as the application expands across 11+ business modules. Decoupling subscription plan entitlements from role configuration ensures administrators can express ideal role grants while understanding what will actually execute under their current billing tier.

**Independent Test**: Open the role editor for a custom role. Expand the "3D Design & Rendering" module. Toggle the "View" and "Edit" capabilities. Observe the module header checkbox become indeterminate (tri-state). Observe that "Advanced Photo-Real Rendering" displays a "Plan Restricted" badge if the tenant is on a `Starter` plan, explaining that upgrading to `Pro` is required for execution, while still allowing the grant to be recorded.

**Acceptance Scenarios**:
1. **Given** a custom role in the Role Editor permissions tab, **When** viewing the permission matrix, **Then** permissions are grouped under expandable modules (`Project Management`, `2D Floor Planning`, `3D Design & Rendering`, `Furniture & Estimates`, `Deliverables`, `AI Tools`, `Manufacturing`, `Reports`, `Clients`) with applicable action columns (`View`, `Create`, `Edit`, `Delete`, `Approve`, `Export`).
2. **Given** a module group header, **When** clicking "Select All", **Then** all available capabilities in that module are toggled to granted; **When** clicking "Clear All", all are cleared; **When** some are granted, the header checkbox displays a tri-state indeterminate visual state.
3. **Given** an action restricted by the tenant's current subscription plan, **When** viewed in the matrix, **Then** it displays a lock icon with a "Plan restricted" badge and a tooltip explaining the required plan (e.g. "Requires Pro Studio Plan"), without disabling the administrator's ability to pre-configure the permission.
4. **Given** a tenant that downgrades its subscription tier, **When** opening the role editor, **Then** previously configured role permissions remain intact in the role definition, but effective status displays "Plan restricted" with explanatory tooltips, preserving configuration across billing changes.
5. **Given** the search input in the permission matrix, **When** typing "cutlist" or "export", **Then** non-matching modules and capabilities collapse, highlighting matching actions and their descriptions.

---

### User Story 3 - Contextual Resource Access Scoping (Priority: P1)

As an organization administrator, I want to constrain a role's access to specific resource boundaries (`all_projects`, `team_projects`, `assigned_projects`, `specific_projects`) so that a user with "Edit Projects" permission can only modify designs they or their team are authorized to touch.

**Why this priority**: In commercial interior design firms, designers must not access or alter competitor clients' projects or sensitive commercial proposals without explicit assignment. Action-level permission without resource scoping leads to confidentiality breaches.

**Independent Test**: Configure a "Freelance Designer" role with `assigned_projects` scope. In the Effective Access Simulator, verify that this role can edit Project A (where the user is assigned) but is denied access to Project B (where the user is not assigned) despite holding the `projects.edit` capability.

**Acceptance Scenarios**:
1. **Given** the "Resource Access" tab in the Role Editor, **When** selecting a scope option (`All organization projects`, `Team projects only`, `Assigned projects only`, `Specific projects`), **Then** the scope description and security implications update immediately.
2. **Given** `Specific projects` scope is selected, **When** adding projects to the allowed list, **Then** only those selected projects are authorized for members of this role.
3. **Given** a role configured with `assigned_projects`, **When** the sticky right-hand summary panel is viewed, **Then** it prominently displays `Resource scope: Assigned projects only`.

---

### User Story 4 - 3-Step Guided Role Creation Wizard & Pre-Commit Impact Analysis (Priority: P2)

As an organization administrator, I want a structured 3-step wizard to create new roles, select starter templates, review human-readable permission summaries, and inspect the impact on assigned members before publishing changes.

**Why this priority**: Guided wizards prevent misconfigurations and accidental privilege escalations. Showing an impact summary (affected users, added/removed privileges, high-risk warnings) prevents operational disruption.

**Independent Test**: Launch the "Create Role" wizard. Select the "Reviewer" template in Step 1. In Step 2, adjust permissions and scope. In Step 3, view the human-readable summary, observe zero assigned users, and click "Create Role". Verify the role appears in the dashboard. Edit the role with 12 assigned users: observe the impact modal warning "12 users will immediately receive 2 new permissions and lose 1 permission" before confirming save.

**Acceptance Scenarios**:
1. **Given** the Create Role flow, **When** navigated, **Then** it advances through 3 distinct steps: `1. Basic Information`, `2. Permissions and Resource Access`, and `3. Review and Create`.
2. **Given** Step 3 (Review), **When** inspected, **Then** the system displays a clear breakdown of granted permissions by module, the resource scope, any subscription plan restrictions, and highlights high-risk permissions (e.g. `delete_projects`, `view_pii`, `manage_roles`).
3. **Given** an existing role being edited that has assigned members, **When** the administrator clicks "Save Changes", **Then** a change comparison dialog displays:
   - Number of affected users.
   - List of newly granted capabilities.
   - List of revoked capabilities.
   - Confirmation prompt before committing.
4. **Given** successful commit, **Then** an immutable audit event is recorded to the audit log capturing `actorId`, `roleId`, `changesSummary`, and timestamp.

---

### User Story 5 - Effective Access Preview Simulator & Audit Log (Priority: P2)

As a security administrator, I want to simulate effective access for any combination of Role, User, Module, Action, and Project, observing a step-by-step breakdown of how the Policy Evaluation Engine makes its decision, and inspect the historical audit log of all access changes.

**Why this priority**: Eliminates guesswork and support tickets when users ask "Why can't I export this 3D render?". Allows administrators to verify security rules and prove compliance without logging in as other users or modifying production state.

**Independent Test**: Navigate to the Access Preview tab. Select User "Priya (Designer)", select Action "3D Render Export", select Project "Skyline Penthouse". Run simulation. The engine outputs a four-step pipeline breakdown: Tenant Check (Pass), Subscription Entitlement (Pass), RBAC Grant (Pass), Resource Scope (Fail: User not assigned to Skyline Penthouse) -> Result: Denied.

**Acceptance Scenarios**:
1. **Given** the Effective Access Simulator interface, **When** selecting a target User or Role, a Module Action, and a target Project, **Then** the simulator displays the authoritative decision with a transparent 4-stage pipeline:
   - Stage 1: Tenant Validation
   - Stage 2: Subscription Entitlement (Plan coverage)
   - Stage 3: RBAC Role Grant
   - Stage 4: Resource Scope & Project Assignment
2. **Given** an evaluation failure at Stage 2, **Then** the simulator explains: "Denied: Tenant's current Starter plan does not entitle feature `feature.design.3d.render`. Upgrade to Pro required."
3. **Given** an evaluation failure at Stage 4, **Then** the simulator explains: "Denied: User holds role 'Designer' scoped to Assigned Projects, but is not an assigned member of Project #104."
4. **Given** the "Access Audit Log" tab, **When** loaded, **Then** it renders a chronological timeline of all role creations, edits, clones, status changes, and user role assignments with actor attribution, timestamp, and diff viewer.

---

### User Story 6 - User-to-Role Assignment & Multi-Role Additive Union (Priority: P2)

As an organization administrator, I want to assign and unassign roles to organization members, support multiple roles per user with additive union permissions, and be blocked from accidentally removing the last Owner.

**Why this priority**: Real organizations have users with overlapping responsibilities (e.g. Senior Designer + Reviewer). The system must compute the additive union of all assigned roles while protecting the tenant against lockout.

**Independent Test**: Assign User "Aarav" both "Designer" (which grants 2D drafting and 3D modeling) and "Reviewer" (which grants package approval). Verify in the simulator that Aarav can perform both 3D modeling and package approval. Attempt to remove the `Owner` role from the sole organization Owner: verify the system blocks the action with an error "Cannot remove the last organization Owner".

**Acceptance Scenarios**:
1. **Given** the "Members" tab in the Role Editor or the "Users & Role Assignments" view, **When** viewing a user, **Then** all assigned roles are displayed with their individual scopes.
2. **Given** a user holding multiple roles, **When** the Policy Engine evaluates access, **Then** permissions evaluate additively: if any active assigned role grants the action with a matching scope, access is allowed.
3. **Given** an organization with a single member holding the `Owner` role, **When** an administrator attempts to revoke the `Owner` role or deactivate the user, **Then** the action is rejected with an explanatory message: "Organization must have at least one active Owner".

---

## Edge Cases

- **Downgrade to Free/Starter with Dormant Permissions**: If a role has permissions for `3D Photo-Real Rendering` and the tenant downgrades to a plan without that entitlement, the permission remains checked in the role definition but is tagged with `Plan restricted (Pro required)` and is evaluated as `SUBSCRIPTION_UNENTITLED` at runtime. Upgrading back to `Pro` immediately restores active capability without re-configuration.
- **New Module Capabilities Added**: When an application update introduces new actions or modules into the registry, existing custom roles MUST NEVER automatically receive those permissions (Least Privilege / Deny by default). They appear as unselected rows in the matrix.
- **Concurrent Role Edits**: If two administrators edit the same role simultaneously, optimistic concurrency control via an updated timestamp/version rejects the stale save with a conflict warning and reload option.
- **Orphaned Custom Roles on Deactivation**: Deactivating a role marks it inactive (`status: 'deactivated'`). Users assigned to that role immediately lose its granted capabilities in subsequent policy evaluations, but the assignment record is preserved for re-activation.
- **Unsaved Changes Navigation Guard**: If an administrator modifies permissions or scopes and attempts to navigate away or switch tabs without saving, an alert warns: "You have unsaved changes. Do you want to discard them or continue editing?".
- **Search Filtering with Tri-state Sections**: If a search query matches 1 capability within an 8-capability module, the module section auto-expands to reveal the match while preserving the correct tri-state header indicator.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a dedicated navigation section under `Settings → Access & Security → Roles & Permissions`, strictly separated from `Billing & Subscription`.
- **FR-002**: System MUST display an administrative dashboard featuring metric cards (Total Roles, Custom Roles, Users Assigned, Plan-Restricted Roles) and a searchable, filterable table of all roles.
- **FR-003**: System MUST protect default system roles (`Owner`, `Admin`, `Designer`, `Reviewer`, `Client Viewer`) from in-place modification or deletion, while providing a one-click `Clone to Custom Role` action.
- **FR-004**: System MUST provide a 3-step guided wizard for creating new custom roles (`Basic Information`, `Permissions & Resource Access`, `Review & Create`) with pre-built industry templates.
- **FR-005**: System MUST provide a full-width Role Editor with tabs (`Overview`, `Permissions`, `Resource Access`, `Members`, `History`), sticky right-hand summary panel, and unsaved changes tracking.
- **FR-006**: System MUST present permissions in an expandable module hierarchy with action columns (`View`, `Create`, `Edit`, `Delete`, `Approve`, `Export`) and tri-state module checkboxes.
- **FR-007**: System MUST decouple subscription entitlements from role permissions: permissions unavailable under the tenant's current plan MUST be clearly marked as `Plan restricted` with upgrade prompts, without silently erasing the role grant.
- **FR-008**: System MUST support 4 distinct resource access scopes: `all_projects`, `team_projects`, `assigned_projects`, and `specific_projects`.
- **FR-009**: System MUST provide a pre-commit impact dialog showing the number of affected users and permission additions/removals before saving role changes.
- **FR-010**: System MUST provide an interactive Effective Access Simulator modeling the exact 4-stage policy evaluation pipeline (`Tenant` $\land$ `Subscription` $\land$ `Role` $\land$ `Scope`) for any user, role, action, and project.
- **FR-011**: System MUST support multi-role user assignments with additive union authorization semantics, while enforcing the invariant that an organization MUST retain at least one active Owner.
- **FR-012**: System MUST record all role creations, updates, clones, deactivations, and user role assignments to an immutable, append-only access audit log with before/after diffs.

---

### Key Entities

- **`CustomRole`**: Represents a system or tenant-specific role. Attributes: `id`, `orgId` (null for system templates), `name`, `description`, `rank` (1-100), `isSystemRole` (boolean), `status` (`active` | `deactivated`), `resourceScope` (`all_projects` | `team_projects` | `assigned_projects` | `specific_projects`), `specificProjectIds` (string[]), `createdAt`, `updatedAt`.
- **`RolePermission`**: The mapping of a permission to a role. Attributes: `roleId`, `permissionId`, `moduleId`, `action`, `scopeType`.
- **`ModuleDefinition`**: The registry metadata for an application module. Attributes: `id`, `name`, `description`, `icon`, `order`, `capabilities`.
- **`PermissionDefinition`**: Granular action definition. Attributes: `id`, `moduleId`, `resource`, `action`, `title`, `description`, `entitlementKey` (linking to subscription entitlement), `isHighRisk` (boolean), `supportedScopes`.
- **`UserRoleAssignment`**: Assignment of a role to a tenant member. Attributes: `id`, `orgId`, `userId`, `roleId`, `assignedBy`, `assignedAt`.
- **`RoleAuditEvent`**: Immutable audit record. Attributes: `id`, `orgId`, `actorId`, `roleId`, `actionType` (`created` | `updated` | `cloned` | `deactivated` | `assigned` | `unassigned`), `changesSummary`, `previousState`, `newState`, `timestamp`.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Administrators can create and publish a custom role using a template in under 90 seconds.
- **SC-002**: 100% of permissions in the catalog link directly to the application's registered modules with zero orphaned or unmapped checkboxes.
- **SC-003**: Subscription plan downgrades retain 100% of configured role permissions in dormant state without data loss or silent grant erasure.
- **SC-004**: The Effective Access Simulator delivers deterministic, step-by-step diagnostic verdicts for 100% of tested user-role-resource combinations with 0 false positives.
- **SC-005**: All role modifications, clones, and assignments emit structured audit events verified by automated contract tests.
- **SC-006**: The non-negotiable Five-Stage Quality Gate runs and passes cleanly: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.

---

## Assumptions

- The backend policy evaluation engine (`PolicyEvaluationEngine` in `src/domain/platform/saas/policyEngine.ts` and `evaluateAuthorization` in `src/domain/platform/authorization/evaluator.ts`) serves as the single source of truth for authorization decisions.
- Tenancy is strictly enforced by `org_id` context in the session and database RLS.
- Default system roles (`owner`, `admin`, `designer`, `reviewer`, `client_viewer`) are immutable baselines distributed with the application.
- All monetary subscription rules and Razorpay billing are managed in `Billing & Subscription` (`src/domain/platform/saas/`), cleanly decoupled from RBAC configuration.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-access-control`
- **Parent Module**: `module-governance`
- **Module Capabilities**:
  - `access.roles.view`: View roles and permissions dashboard.
  - `access.roles.manage`: Create, edit, clone, and deactivate custom roles.
  - `access.assignments.manage`: Assign and unassign roles to organization users.
  - `access.simulator.use`: Run effective access simulation previews.
  - `access.audit.view`: Inspect access control audit logs.
- **Dependencies on Other Modules**: `module-tenancy`, `module-saas-subscription`, `module-central-authorization`.

### 2. Subscription Entitlement Requirements
- **Required Entitlement Identifiers**:
  - `feature.governance.basic_roles`: Built-in system roles and assignments (Included in all tiers: `Free`, `Starter`, `Pro`, `Enterprise`).
  - `feature.governance.custom_roles`: Custom role creation, cloning, and granular editing (Requires `Pro` or `Enterprise`).
  - `feature.governance.resource_scopes`: Granular team and specific project scoping (Requires `Pro` or `Enterprise`).
  - `feature.governance.access_simulator`: Effective access simulation sandbox (Requires `Pro` or `Enterprise`).
  - `feature.governance.audit_log`: Access and security audit trail (Requires `Pro` or `Enterprise`).
- **Plans That Include This Capability**:
  - `Free / Starter`: System roles only (`Owner`, `Admin`, `Designer`, `Reviewer`, `Client Viewer`) with user assignment.
  - `Pro`: Custom roles (up to 10), resource scoping, access simulator, 30-day audit log.
  - `Enterprise`: Unlimited custom roles, advanced scoping, access simulator, full immutable audit log.
- **Available Add-ons**: `addon.enterprise.advanced_governance`.
- **Feature Availability Conditions**: Tenant must have an active subscription (`trial`, `active`). Past-due subscriptions in grace period retain read-only access.

### 3. Usage and Commercial Limits
- **Applicable Quotas**:
  - `quota.roles.custom.max`: Maximum number of custom roles permitted per tenant (Starter: 0, Pro: 10, Enterprise: unlimited).
  - `quota.audit.retention_days`: Audit log retention window in days (Starter: 7, Pro: 30, Enterprise: 365).
- **Seat Requirements**: Managing roles requires an `Admin` or `Owner` licensed seat.
- **Usage Measurement**: Count of active custom roles partitioned by `org_id`.
- **Monthly / Billing-Period Reset Rules**: Not applicable for role count (persistent resource quota).
- **Behavior When Limits Are Reached**: Attempting to create a custom role when `quota.roles.custom.max` is reached prompts an upgrade dialog to `Enterprise`.
- **Overage or Upgrade Behavior**: Non-blocking upgrade prompt with direct deep-link to `Settings → Billing & Subscription`.

### 4. RBAC Requirements
- **Required Permissions**:
  - `access:roles:view` (Owner, Admin)
  - `access:roles:create` (Owner, Admin)
  - `access:roles:edit` (Owner, Admin)
  - `access:roles:delete` (Owner)
  - `access:roles:clone` (Owner, Admin)
  - `access:members:assign` (Owner, Admin)
  - `access:audit:view` (Owner, Admin)
- **Applicable System and Tenant Roles**: `Owner`, `Admin`. Other roles receive 403 Forbidden on access management endpoints.
- **Resource-Level Permissions**: Access management applies organization-wide (`all_projects` scope by definition).
- **Administrative Management Requirements**: Only users with `Owner` or `Admin` system roles can access the Role Management Dashboard. A tenant administrator cannot edit or delete their own Owner privileges if they are the sole Owner.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: `CustomRole`, `RolePermission`, `UserRoleAssignment`, `RoleAuditEvent` are strictly partitioned by `org_id`.
- **Tenant Isolation Requirements**: PostgreSQL Row-Level Security (RLS) ensures tenant members can only query or alter roles where `org_id = auth.current_org_id()`. System template roles have `org_id IS NULL` and are read-only to all tenants.
- **Storage and Cache Isolation**: Role definitions and user assignments are cached in tenant-scoped memory structures with immediate invalidation on mutation.
- **Background Worker Tenant Context**: Audit event persistence runs with explicit `tenantId` propagation.

### 6. Subscription Lifecycle Behavior
- **Trial Behavior**: All Pro/Enterprise governance capabilities (Custom Roles, Simulator, Audit) are fully unlocked during 14-day trial.
- **Upgrade Behavior**: Instant activation of custom role creation and simulator upon plan upgrade.
- **Downgrade Behavior**:
  - Existing custom roles are **NEVER deleted**.
  - Custom roles remain assigned to members, but any permissions requiring unentitled capabilities transition to "Plan restricted" (dormant).
  - Creating new custom roles beyond the new plan quota is disabled until upgrade.
- **Payment Failure / Past Due**: 14-day grace period maintains read-only access to role management; configuration changes are blocked until billing is resolved.
- **Cancellation / Expiration**: Read-only retention until statutory DPDP export or deletion request.
- **Existing Customer Data Preservation**: Zero silent deletion guarantee (Constitution Principle X).

### 7. Enforcement Requirements
- **Frontend Visibility & Interaction Rules**:
  - Role Management routes and tabs are guarded; non-admin users cannot see or navigate to `Settings → Access & Security → Roles & Permissions`.
  - Plan-restricted permissions display prominent lock indicators, badges, and explanatory upgrade tooltips.
  - Save button disabled when no changes or validation errors exist.
- **Backend / API Authorization Guards**:
  - All role mutation commands validate caller's `org_id` and require `access:roles:manage`.
  - Quota checks (`quota.roles.custom.max`) are strictly enforced on backend role creation.
- **Quota Reservation & Enforcement**: Optimistic check + transactional lock during role creation to prevent exceeding plan limits.
- **Audit Requirements**: Every role creation, modification, clone, deactivation, and assignment emits a `RoleAuditEvent` with before/after diffs.
- **Entitlement Cache Invalidation**: Immediate invalidation of actor authorization cache when roles or assignments change.

### 8. Acceptance Criteria and Security Tests
- **Included-Plan Access Tests**: Verify a `Pro` tenant administrator can create, edit, clone, and assign custom roles.
- **Excluded-Plan Denial Tests**: Verify a `Starter` tenant administrator attempting to create a custom role receives a clear plan restriction upgrade prompt.
- **RBAC Permission Tests**: Verify non-admin users (e.g. `Designer`, `Reviewer`) receive 403 Forbidden when accessing role management.
- **Tenant Isolation Tests**: Verify Tenant A cannot query, view, clone, or modify Tenant B's custom roles or audit logs.
- **Last-Owner Safeguard Test**: Verify attempting to unassign or deactivate the sole `Owner` of an organization throws a validation error.
- **Dormant Permission Downgrade Test**: Verify that a role created with Pro features retains its permission records upon downgrade, with runtime evaluation correctly blocking unentitled capabilities.
- **Additive Multi-Role Test**: Verify a user assigned both `Designer` and `Reviewer` roles exercises the additive union of both role capabilities.
