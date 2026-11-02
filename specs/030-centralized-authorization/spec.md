# Feature Specification: Centralized Modular Architecture & Dynamic Authorization Platform

**Feature Branch**: `030-centralized-authorization`  
**Created**: 2026-11-02  
**Status**: Draft  
**Input**: User description: "Implement a centralized modular architecture and administrator-configurable authorization platform. All business modules must register their capabilities and permissions with the central authorization framework."

---

## Clarifications

### Session 2026-11-02
- Q: Multi-role scope resolution strategy: additive union, most restrictive, or highest rank? → A: Additive / Union Scope (access is granted if any assigned role grants the required resource scope).
- Q: Are default system roles immutable templates or editable? → A: Immutable Templates (Clone-to-Customize; default system roles cannot be modified or deleted directly; admins clone them to customize).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Central Module & Capability Registration (Priority: P1)

As a platform engineer or module author, I want all business modules (Projects, Floor Plans, 2D/3D Design, Furniture, Materials, Estimates, Client Deliverables) to register their capabilities, actions, and dependencies with a centralized registry so that the system maintains cohesive modular boundaries without bespoke authorization code.

**Why this priority**: Without a central registry of capabilities, modules duplicate access control logic and administrators cannot discover what permissions can be assigned.

**Independent Test**: Can be verified by registering a test module with action permissions and confirming that the central registry exposes those capabilities to the administration system.

**Acceptance Scenarios**:
1. **Given** a new or existing business module, **When** it declares its capabilities during application initialization, **Then** its actions and supported resource scopes are indexed in the Central Module Registry.
2. **Given** two modules with dependencies, **When** they register, **Then** circular dependencies are detected and rejected at initialization.

---

### User Story 2 - Administrator Custom Role & Permission Management (Priority: P1)

As a studio administrator, I want to create, edit, clone, and deactivate custom studio roles and assign granular action permissions across registered modules via an administrative interface without requiring application code changes or deployments.

**Why this priority**: Studios have diverse staffing structures (lead designers, junior draftsmen, workshop managers, freelance estimators). Hardcoded roles force studios into rigid workflows or excessive privilege granting.

**Independent Test**: An administrator creates a custom role (e.g., "Junior Drafter"), assigns only 2D plan viewing and editing permissions, assigns it to a user, and verifies that the user can edit 2D plans but cannot view commercial pricing or export manufacturing packages.

**Acceptance Scenarios**:
1. **Given** an authorized administrator in the studio settings, **When** they create a new role and select registered permissions, **Then** the role is saved and immediately available for assignment.
2. **Given** an existing custom role, **When** an administrator updates its permission assignments, **Then** active sessions for users with that role immediately reflect the updated access rights.
3. **Given** an attempt to delete or strip all administrative permissions from the last owner role, **When** submitted, **Then** the system rejects the operation with a safety error preventing administrative lockout.

---

### User Story 3 - Resource-Level Project Scoping (Priority: P2)

As a studio manager, I want to restrict user permissions by resource scopes (e.g., all projects vs. assigned projects only vs. client projects) so that external contractors and designers only access designs explicitly assigned to them without needing separate roles for every project.

**Why this priority**: Enterprise studios manage dozens of client accounts simultaneously; broad project access creates confidentiality and data leakage risks.

**Independent Test**: Assign a designer a role scoped to "Assigned projects only", assign them to Project Alpha but not Project Beta, and verify they cannot view or edit Project Beta.

**Acceptance Scenarios**:
1. **Given** a user with a role scoped to "Assigned projects only", **When** they query the project list or attempt to open a project, **Then** they can only view and interact with projects where they are an assigned team member.
2. **Given** a user attempting to open a direct project link for an unassigned project, **When** loaded, **Then** backend authorization rejects the request with an access-denied error.

---

### User Story 4 - Universal Deny-by-Default Backend Enforcement & UI Parity (Priority: P2)

As a security auditor, I want every backend operation and data access route to enforce authorization independently of frontend menu visibility, while frontend views and action buttons dynamically adapt to user permissions.

**Why this priority**: Hiding buttons or navigation links is purely a user experience convenience. Real security requires authoritative backend evaluation on every protected request.

**Independent Test**: Issue an unauthorized API request directly (bypassing the web UI) and confirm that the backend returns an authoritative access-denied status.

**Acceptance Scenarios**:
1. **Given** a user lacking the `designs.3d.export` permission, **When** viewing the 3D editor, **Then** the export button is disabled or hidden with an informative permission tooltip.
2. **Given** an unauthorized user attempting to trigger an export API endpoint directly, **When** executed, **Then** the backend rejects the operation with a 403 Forbidden response.

---

### User Story 5 - Auditable Governance & Access-Control Verification (Priority: P3)

As a compliance officer, I want every change to roles, permissions, and user assignments to be logged in an unalterable audit trail, and every module to provide automated positive and negative authorization tests.

**Why this priority**: Statutory compliance (DPDP Act 2023) and enterprise governance require verifiable tracking of who granted privileged access and when.

**Independent Test**: Modify a role's permissions and verify that an immutable event is recorded in the audit log capturing the actor, target role, previous permissions, and new permissions.

**Acceptance Scenarios**:
1. **Given** an administrator assigning a role to a user, **When** committed, **Then** an audit event `members.role_assigned` is logged with timestamp, actor ID, and IP address.
2. **Given** any business module, **When** run through the automated test suite, **Then** positive (allowed) and negative (denied) test cases verify authorization enforcement for every registered action.

---

## Edge Cases

- **Multiple Role Scope Conflict**: Resolved via Additive / Union evaluation. When a user holds multiple roles with differing resource scopes (e.g. one role granting `assigned_projects` and another granting `all_projects`), the user receives access to any project matching at least one of their granted scopes (broadest union).
- **System Role Mutability**: Built-in default system roles (`owner`, `admin`, `designer`, `production`, `viewer`) are strictly immutable templates. Administrators cannot modify or delete default system roles directly; instead, administrators create new custom roles or clone an existing system template to customize permissions.
- **Orphaned User Roles**: What happens when an administrator deactivates or deletes a custom role currently held by active users? The system MUST safely downgrade affected users to a default read-only or restricted role, log the event, and prevent abrupt session crashes.
- **Offline / Network Degradation**: In disconnected or low-bandwidth states, the client application MUST enforce cached permissions in read-only mode and MUST NOT allow offline privilege escalation.
- **Module Version Drift**: When a module updates its registered capabilities (adding new actions or deprecating old actions), existing roles must retain their valid mappings while newly registered actions default to denied until explicitly granted.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a centralized `ModuleRegistry` where every business module registers its identity, description, capabilities, interfaces, and dependencies during system initialization.
- **FR-002**: System MUST provide a centralized `PermissionRegistry` where modules declare their granular action-level permissions using canonical namespaced keys (e.g. `projects.create`, `designs.3d.edit`, `estimates.approve`, `production.download_cutlist`).
- **FR-003**: System MUST support dynamic custom role management allowing authorized administrators to create, edit, clone, and deactivate custom studio roles without code deployments, while maintaining default system roles as immutable templates.
- **FR-004**: System MUST allow administrators to assign any combination of registered module permissions to custom roles through an intuitive administration interface.
- **FR-005**: System MUST support resource-level scoping on permissions, including `all_projects`, `assigned_projects`, `team_projects`, and `client_projects`.
- **FR-006**: System MUST allow users to hold multiple roles within an organization, evaluating cumulative access using an additive union scope-resolution rule (user is granted access if any assigned role satisfies the required scope).
- **FR-007**: System MUST enforce authorization on every protected backend API, RPC function, and database access path using deny-by-default and least-privilege principles.
- **FR-008**: System MUST dynamically adapt UI navigation, menu visibility, and interactive controls based on the active user's evaluated permissions.
- **FR-009**: System MUST record all role creations, edits, permission modifications, and user assignment changes in the append-only, tamper-evident audit log.
- **FR-010**: System MUST enforce administrative safety guards preventing deletion of the last owner or stripping administrative access from the final owner account.
- **FR-011**: Every business module MUST provide automated authorization tests covering both positive (authorized actor succeeds) and negative (unauthorized actor rejected) scenarios.
- **FR-012**: System MUST NOT allow administrators to create arbitrary, unregistered permissions that bypass application security logic.

---

### Key Entities

- **ModuleDefinition**: Represents a distinct business module. Attributes: `id`, `name`, `version`, `description`, `dependencies[]`, `capabilities[]`.
- **PermissionDefinition**: Represents a registered action capability. Attributes: `id` (e.g. `designs.3d.export`), `moduleId`, `action`, `title`, `description`, `supportedScopes[]`.
- **Role**: Represents a set of permissions. Attributes: `id`, `orgId`, `name`, `rank`, `isSystemRole` (boolean), `status` (`active` | `deactivated`), `createdAt`, `updatedAt`.
- **RolePermissionMapping**: Connects roles to permissions with optional scope constraints. Attributes: `roleId`, `permissionId`, `scopeType` (`all` | `assigned` | `team` | `client`).
- **UserRoleAssignment**: Associates users with roles in an organization. Attributes: `userId`, `orgId`, `roleId`, `assignedBy`, `assignedAt`.
- **AuthorizationEvaluationResult**: Output of an authorization check. Attributes: `allowed` (boolean), `reason`, `missingPermissions[]`, `applicableScope`.

---

## Module Architecture & Access Control *(Mandatory per Constitution v2.1)*

### 1. Module Boundaries & Interfaces
- **Module ID**: `platform-authorization`
- **Package Location**: `src/domain/platform/authorization/`, `src/engine/platform/authorization/`, `src/features/admin/authorization/`
- **Dependencies**: `@studio/core` (types, identifiers), `@studio/platform` (tenancy, audit logging)
- **Exported Interfaces**:
  - `registerModule(definition: ModuleDefinition): void`
  - `registerPermissions(moduleId: string, permissions: PermissionDefinition[]): void`
  - `authorize(actor: Actor, permission: string, resourceContext?: ResourceContext): Promise<boolean>`
  - `useAuthorize(permission: string, resourceContext?: ResourceContext): { allowed: boolean; loading: boolean }`

### 2. Registered Capabilities & Permissions
This foundational module registers the following administrative permissions:
- `auth.roles.view`: View custom roles and permission mappings.
- `auth.roles.manage`: Create, edit, clone, and deactivate custom roles.
- `auth.permissions.view`: Browse registered module capabilities.
- `auth.assignments.manage`: Assign roles to studio team members.
- `auth.audit.view`: Inspect role and permission change history.

### 3. Resource Scopes
- `all_projects`: Universal access across all projects in the organization.
- `assigned_projects`: Access limited to projects where the user is explicitly designated as a team member.
- `team_projects`: Access limited to projects belonging to the user's specific departmental team.
- `client_projects`: Access limited to projects for a specific designated client account.

### 4. Backend Enforcement Mechanism
- **Primary**: Database-level Row-Level Security (RLS) policies and PostgreSQL `authorize(org_id, permission_key, resource_id)` security functions.
- **Secondary**: Server-side API and RPC endpoint request guards verifying evaluated permissions before executing operations.
- **Tertiary**: Pure domain assertions in domain command executors (`executeCommand`).

### 5. Test Matrix

| Actor Role | Action / Target | Context / Scope | Expected Result |
| :--- | :--- | :--- | :--- |
| **Owner** | Create custom role | Organization scope | **ALLOW** (Role created, audit event emitted) |
| **Admin** | Assign role to designer | Organization scope | **ALLOW** (Role assigned, audit event emitted) |
| **Designer** | Access unassigned project | `assigned_projects` scope | **DENY** (403 Forbidden, zero project data returned) |
| **Designer** | Access assigned project | `assigned_projects` scope | **ALLOW** (Project loaded successfully) |
| **Production** | Download cut list | Permitted by role | **ALLOW** (OptiCut CSV generated) |
| **Production** | View client contact PII | No `clients:view_pii` perm | **DENY** (Masked data via `clients_safe` view) |
| **Viewer** | Modify cabinet size | No `projects:write` perm | **DENY** (Command rejected with permission error) |
| **Admin** | Delete last owner role | Organization scope | **DENY** (Safety guard raises exception) |

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An administrator can create a new custom role, select registered permissions, and assign it to a team member in under 2 minutes without writing code or requesting developer support.
- **SC-002**: 100% of protected business operations and API endpoints reject unauthorized requests with deny-by-default behavior, even when accessed directly outside the user interface.
- **SC-003**: 100% of business modules register their capabilities and permissions through the central registry with zero hardcoded role checks or fragmented authorization logic.
- **SC-004**: Role, permission, and assignment modifications are recorded in the append-only audit log within 500 milliseconds of commitment.
- **SC-005**: Central authorization evaluation overhead adds less than 10 milliseconds of latency to any interactive user operation or backend request.

---

## Assumptions

- User authentication is handled prior to authorization evaluation (via existing session management).
- The five default roles (`owner`, `admin`, `designer`, `production`, `viewer`) exist as initial templates.
- Organization boundary (`org_id`) remains the outermost tenant boundary; cross-tenant access is unconditionally blocked by database RLS.
- Module capability registration executes at application bootstrap and remains immutable during runtime.
