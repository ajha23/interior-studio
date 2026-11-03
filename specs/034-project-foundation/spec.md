# Feature Specification: 034 — Project Foundation and Cloud Persistence

**Feature Branch**: `034-project-foundation`  
**Status**: Draft — proposed baseline  
**Target integration branch**: `refactorV2`  
**Priority**: P0  
**Scope**: architecture, database, security, workflow foundation

## 1. Summary

Establish the server-authoritative project foundation required to connect the existing Interior Studio design editor to a multi-tenant, multi-space project lifecycle.

This feature introduces the canonical client/project/space relationship, verified actor and tenant context, cloud-backed project metadata and versioned design revisions, while retaining the existing editor command pipeline and local persistence as a cache/import/export mechanism.

This feature does not implement the complete survey, MOM, MEP, production or handover workflows. It provides the durable project and revision foundation those features depend on.

## 2. Source hierarchy and provenance

- [M] Product direction: evolve the current interior design application into a design-to-manufacture workflow system; support multiple spaces, exact editable design data, client deliverables and traceability.
- [E] Existing repository: `KitchenProject`, `Home`, typed design commands, IndexedDB persistence, Supabase migrations and package shells exist in `refactorV2`.
- [D] Derived requirement: PostgreSQL must become authoritative for committed tenant/project/revision state; IndexedDB can remain a cache/offline draft.
- [V] Confirm actual Supabase region, identifier migration strategy, offline conflict policy and user onboarding behavior.

Do not treat feature shells or migrations as proof that a complete cloud repository exists.

## 3. Users

- Studio owner/admin: creates organization, manages team and projects.
- Designer: creates and edits projects/spaces and commits design revisions.
- Project manager: assigns members and tracks project status.
- Viewer/client: later-phase read-only access; not required for this feature.

## 4. User stories

### US-01 Organization context [P0]
As a studio member, I need to operate within an authenticated organization so that project data is isolated by tenant.

Acceptance:
- An authenticated user can resolve an organization only through verified membership.
- A user cannot select an arbitrary organization ID and gain access.
- A user with no active membership receives an explicit authorization failure.

### US-02 Client and project creation [P0]
As an authorized studio member, I need to create a client and project so that work is organized around a customer engagement.

Acceptance:
- Client and project are created under the same organization.
- Cross-organization client references are rejected by database constraints and application validation.
- Project owner/creator and timestamps are recorded.
- Client PII is not copied into general project design snapshots.

### US-03 Multi-space project [P0]
As a designer, I need a project to contain multiple spaces so that a home or commercial project can hold separate kitchens, bedrooms, bathrooms and other areas.

Acceptance:
- Project can contain one or more spaces.
- Each space has a stable ID, type, name and optional floor/level.
- Existing kitchen editor can open a selected kitchen space.
- Existing editor model is not replaced by a parallel scene model.

### US-04 Cloud-backed design revision [P0]
As a designer, I need committed design revisions to persist centrally so that authorized users can reopen the same project and revision on another device.

Acceptance:
- A revision contains a versioned canonical scene snapshot and content hash.
- Revision records are immutable.
- Project/space current revision pointer is updated transactionally.
- A stale expected revision cannot overwrite a newer committed revision.
- Idempotent retries do not create duplicate commits.

### US-05 Local cache and import/export [P1]
As a designer, I need local drafts and file import/export so that temporary connectivity loss does not destroy work.

Acceptance:
- IndexedDB is treated as cache/draft, not cloud authority.
- Drafts are associated with project, space and base revision.
- Conflict is surfaced for explicit resolution; no silent last-write-wins.
- Existing versioned JSON import/export remains supported.

### US-06 Project authorization [P0]
As an organization member, I need project-level access to be enforced by the backend so that UI visibility cannot bypass tenant or project scope.

Acceptance:
- Every project read/write resolves verified actor and organization membership.
- Project assignment scopes are enforced.
- Missing project context for project-scoped operations is denied.
- Forged identity/role headers do not authorize access.

## 5. Functional requirements

- FR-001: System MUST model Organization, Client, Project, ProjectMember and Space as separate entities.
- FR-002: Every tenant-owned entity MUST be associated with an organization directly or through an enforceable parent relationship.
- FR-003: Client and Project MUST be linked using tenant-consistent foreign keys.
- FR-004: Project MUST support multiple Spaces.
- FR-005: Space MUST retain stable identity independent of its design revisions.
- FR-006: The existing kitchen design model MUST be usable as the initial design type for a Kitchen space.
- FR-007: The system MUST resolve actor identity from a verified authentication context, not caller-controlled identity/role headers.
- FR-008: Backend MUST validate tenant membership and project scope for every protected operation.
- FR-009: The system MUST persist committed project and space metadata in PostgreSQL.
- FR-010: The system MUST persist immutable design revision snapshots with schema version, parent revision, actor, timestamp and canonical hash.
- FR-011: Commit MUST include expected revision and reject stale writes.
- FR-012: Commit MUST support idempotency keys.
- FR-013: Local IndexedDB data MUST NOT be treated as authoritative cloud approval or production state.
- FR-014: Existing JSON import/export and schema migration behavior MUST remain compatible during transition.
- FR-015: Sensitive client PII MUST be protected separately from general project design data.
- FR-016: Every mutation MUST create an auditable event or transactional outbox record.
- FR-017: RLS MUST be enabled and tested for every tenant-owned table.
- FR-018: Application and database tests MUST include cross-tenant negative cases.

## 6. Non-functional requirements

- NFR-001 Security: deny by default; tenant and resource checks on server.
- NFR-002 Consistency: revision pointer update and revision insert are one transaction.
- NFR-003 Reliability: idempotent retries and explicit conflict handling.
- NFR-004 Compatibility: existing editor command pipeline and file envelope retained.
- NFR-005 Traceability: revision snapshots record schema/generator metadata as applicable.
- NFR-006 Privacy: minimize PII duplication and sensitive logs.
- NFR-007 Maintainability: domain logic remains framework-free and package boundaries are enforced.
- NFR-008 Testability: database policies and application use cases have positive and negative tests.

## 7. Data contracts

### Project
- id (canonical database UUID; application mapping documented)
- orgId
- clientId
- name
- status
- currentRevisionId (optional until first design commit)
- createdBy
- createdAt
- updatedAt

### Space
- id
- orgId
- projectId
- name
- type
- level
- status
- currentRevisionId

### DesignRevision
- id
- orgId
- projectId
- spaceId
- parentRevisionId
- schemaVersion
- snapshot
- canonicalHash
- createdBy
- createdAt

The scene snapshot must preserve the existing domain schema contract. Do not duplicate or independently edit geometry in a second data model.

## 8. Authorization contract

Required capabilities (canonical names to reconcile with the existing permission registry):
- `projects.create`
- `projects.read`
- `projects.edit`
- `projects.assign_members`
- `spaces.create`
- `spaces.read`
- `spaces.edit`
- `design_revisions.commit`

The server derives actor identity from verified Supabase auth. The organization and project IDs supplied by the client are selectors, not proof of access.

The evaluator must support all declared scope types or reject unsupported scope configuration. A missing resource context must not turn a scoped grant into organization-wide access.

## 9. Out of scope

- Complete survey capture and polygon solver.
- MOM/requirements builder.
- MEP editing and coordination.
- Client portal and external share links.
- Quote generation and tax engine.
- Manufacturing package generation and release.
- Installation/handover workflow.
- Full offline multi-user merge.
- Full extraction of all eight packages.

These are later features that depend on this foundation.

## 10. Risks and open decisions

- [V] Confirm whether existing string IDs are migrated to UUID or mapped at the persistence boundary.
- [V] Confirm how existing IndexedDB projects are associated with an organization during onboarding.
- [V] Define behavior for projects created offline before tenant membership is available.
- [V] Confirm actual Supabase region and privacy obligations.
- [V] Define revision retention and deletion/anonymization policy.
- [V] Confirm whether a project can have multiple clients or client organizations.
