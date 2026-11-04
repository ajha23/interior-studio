# Phase 0 Research: Centralized Modular Architecture & Dynamic Authorization Platform

**Feature**: `030-centralized-authorization`  
**Date**: 2026-11-02  
**Status**: Completed  

---

## Technical Context & Decisions

### 1. Central Module Registry Architecture
- **Decision**: Implement a pure framework-free, in-memory `ModuleRegistry` in `src/domain/platform/authorization/moduleRegistry.ts`.
- **Rationale**:
  - In adherence to **Constitution Principle I** (Framework-Free Domain) and **Principle VI** (Modular Architecture), the registry must operate identically in the browser client, headless test runners (Vitest), and background server workers (Node/Deno).
  - Modules register their metadata, capability namespaces, and dependencies at bootstrap via `registerModule(definition)`.
  - The registry validates module dependencies using Kahn's topological sort algorithm, rejecting circular dependencies at bootstrap.
- **Alternatives Considered**:
  - *Dynamic runtime filesystem scanning (`fs.readdir`)*: Rejected because the client-side bundle runs in browser V8 where filesystem APIs do not exist.
  - *Decentralized/ad-hoc module imports*: Rejected because it allows modules to hide or hardcode capabilities without central discoverability.

---

### 2. Granular Permission Key Namespacing & Resource Scoping
- **Decision**: Adopt a three-token hierarchical permission naming standard: `<module>.<resource>.<action>` (e.g. `projects.plan.create`, `designs.3d.export`, `estimates.quote.approve`, `production.cutlist.download`).
- **Rationale**:
  - Hierarchical keys map naturally to business capabilities and allow the administrative UI to render grouped permission trees.
  - Every permission definition declares its supported resource scopes:
    - `all_projects`: Universal access across the tenant organization.
    - `assigned_projects`: Access limited to projects where the user's ID is in the project's assigned member list.
    - `team_projects`: Access limited to projects owned by the user's department or team.
    - `client_projects`: Access limited to projects tagged with specific client IDs.
- **Alternatives Considered**:
  - *Flat unnamespaced keys (e.g. `can_edit_3d`)*: Rejected due to risk of naming collisions as new modules are introduced.
  - *Arbitrary user-defined strings*: Rejected per **FR-012** and OWASP guidelines; application code registers valid actions; administrators only govern assignment.

---

### 3. Dynamic Custom Role Storage & System Role Immutability
- **Decision**: Extend the relational schema (`supabase/migrations/`) to support tenant-scoped custom roles while locking default system roles as immutable global templates.
- **Data Architecture**:
  - Table `public.roles`:
    - `id text PRIMARY KEY`
    - `org_id uuid NULL REFERENCES public.organizations(id) ON DELETE CASCADE`
    - `name text NOT NULL`
    - `rank integer NOT NULL`
    - `is_system_role boolean NOT NULL DEFAULT false`
    - `status text NOT NULL DEFAULT 'active'`
  - System roles (`owner`, `admin`, `designer`, `production`, `viewer`) have `is_system_role = true` and `org_id = NULL`. They cannot be modified, deleted, or assigned custom scopes.
  - Custom roles have `is_system_role = false` and `org_id = <tenant_uuid>`. They can be created, cloned from templates, edited, and deactivated by tenant administrators.
- **Rationale**:
  - Satisfies the accepted clarification: System roles remain reliable, uncorrupted fallbacks across application upgrades.
  - Multi-tenant RLS guarantees that custom roles created by Tenant A are never visible to or usable by Tenant B.
- **Alternatives Considered**:
  - *Directly editable system roles*: Rejected because a tenant admin could inadvertently disable vital baseline permissions on standard roles, causing broken UI states.

---

### 4. Multi-Role Scope Resolution Strategy: Additive / Union Evaluation
- **Decision**: Implement an **Additive Union** scope resolution algorithm in `src/domain/platform/authorization/evaluator.ts`.
- **Algorithm**:
  1. For an actor $A$ and requested permission $P$ in organization $O$:
  2. Retrieve all active roles assigned to $A$ in $O$.
  3. Filter for roles that grant permission $P$. If empty, return `{ allowed: false, reason: "Permission denied" }`.
  4. Aggregate the resource scopes granted across those matching roles:
     - If *any* role grants `all_projects` $\implies$ return `{ allowed: true, scope: "all_projects" }`.
     - Else if *any* role grants `assigned_projects` AND project context matches assignment $\implies$ return `{ allowed: true, scope: "assigned_projects" }`.
     - Else if *any* role grants `team_projects` AND project team matches actor team $\implies$ return `{ allowed: true, scope: "team_projects" }`.
     - Else if *any* role grants `client_projects` AND project client matches actor client $\implies$ return `{ allowed: true, scope: "client_projects" }`.
     - Else $\implies$ return `{ allowed: false, reason: "Insufficient resource scope" }`.
- **Rationale**:
  - Standard enterprise RBAC behavior. Allows combining specialized roles (e.g. "Senior Estimator" on all projects + "Lead Designer" on assigned projects) without permission collisions.
- **Alternatives Considered**:
  - *Most restrictive intersection*: Rejected because assigning a user an additional restricted role would unexpectedly strip their existing permissions.
  - *Rank-based priority*: Rejected because lower-ranked roles with broad scopes would be ignored even when intended.

---

### 5. Multi-Layer Authorization Enforcement Pipeline
- **Decision**: Three-layer defense-in-depth enforcement:
  1. **Layer 1: Database Boundary (PostgreSQL RLS & STABLE Functions)**:
     - Function `authorize(p_org_id uuid, p_permission text, p_project_id uuid DEFAULT NULL) RETURNS boolean` evaluates user roles and project membership directly inside PostgreSQL queries.
  2. **Layer 2: Server API & Command Transaction Boundary**:
     - Pre-flight authorization guards in `/api/*` handlers and `executeCommand` validating actor permissions prior to Immer state drafting.
  3. **Layer 3: Frontend Adaptive Presentation**:
     - React hook `useAuthorize(permission, resourceContext)` providing `{ allowed, loading }` to dynamically disable, hide, or annotate UI actions with tooltips.
- **Rationale**:
  - Meets OWASP and **Constitution Principle VI** non-negotiable rules: UI hiding is never a security boundary; the backend must authoritatively reject unauthorized operations.

---

### 6. Audit Trail Integration
- **Decision**: Every role creation, role update, permission grant/revoke, and user assignment emits a strongly typed event to the append-only `audit_log` table under event family `'members'` and `'auth'`.
- **Rationale**:
  - Conforms to **Constitution Principle VI** and DPDP compliance requirements. Prevents silent privilege escalation.
