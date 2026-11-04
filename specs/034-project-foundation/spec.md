# Feature Specification: 034 — Project Foundation and Cloud Persistence

**Feature Branch:** `034-project-foundation`  
**Status:** Revised draft — repository-reviewed, pending approval  
**Integration candidate:** `refactorV2`  
**Priority:** P0  
**Review:** See [repository-level design review](../../docs/implementation/FEATURE_034_DESIGN_REVIEW.md)

## 1. Summary

Introduce the canonical SaaS project foundation around the existing design editor. PostgreSQL becomes authoritative for committed tenant, client, project, space and design-revision metadata. Existing `KitchenProject` and `Home` schemas, command execution, scene IDs and versioned file envelopes remain compatible.

A SaaS Project represents the customer engagement. A Space represents a room/area within that engagement. A DesignRevision is an immutable version of the design document for one Space.

**Critical identity rule:** `KitchenProject.id` is an existing editor/local-storage identity, not the SaaS Project primary key. New relational entities use UUIDs. Existing editor IDs remain opaque strings inside snapshots and import mappings.

## 2. Evidence and provenance

- [E] `KitchenProjectSchema` uses string IDs, integer millimetre dimensions and includes cabinets, appliances, furniture, materials, openings, MEP and production settings.
- [E] Kitchen files use the `interior-studio/kitchen` envelope and schema migrations.
- [E] `HomeSchema` embeds `KitchenProject` per `HomeRoom`; room IDs and `roomProjectId` are derived strings.
- [E] IndexedDB stores projects, homes, packages and assets locally.
- [E] Existing migration chain creates organizations, RBAC, clients/consents and project_members but does not create a canonical projects table in the inspected migration content.
- [D] New SaaS Project/Space UUIDs are required while preserving legacy IDs.
- [V] Region, PII/consent policy, client cardinality, offline behavior and deployment auth boundary require validation.

## 3. Goals

1. Create a tenant-owned Project and one or more Spaces.
2. Associate an optional or required Client according to the approved product rule; do not assume mobile must be mandatory without product confirmation.
3. Open the existing kitchen editor for a Kitchen Space without changing scene semantics.
4. Import whole-home files into one Project with one Space per room, preserving room order, level, plan coordinates and embedded design.
5. Persist immutable design revisions centrally.
6. Prevent cross-tenant and out-of-scope access.
7. Reject stale revision commits and make retries idempotent.
8. Preserve existing file import/export and local drafts.

## 4. User stories

### US-01 Organization context [P0]
A member operates within an active organization resolved from verified authentication and database membership.

### US-02 Client and project [P0]
An authorized member creates a project in an organization and optionally associates a same-tenant client. Required client fields are governed by an explicit approved client policy.

### US-03 Multi-space [P0]
A project contains multiple spaces with stable UUID identity, type, name and level. Space identity is independent of design revisions.

### US-04 Kitchen editor integration [P0]
A Kitchen space opens the current `KitchenProjectSchema` editor document. No parallel scene schema is introduced.

### US-05 Whole-home import [P0]
A `Home` file maps to one SaaS Project; each `HomeRoom` maps to one Space; each embedded `design` maps to an initial DesignRevision. Preserve home metadata and each room's level, x/z placement, type and original IDs as provenance.

### US-06 Revision commit [P0]
A committed revision is immutable and points to the expected parent revision. A stale commit fails without overwriting the latest revision.

### US-07 Authorization [P0]
Every read/write checks verified actor, active organization membership, permission and project/space scope. Caller-supplied IDs are selectors, never authority.

### US-08 Local cache and migration [P1]
IndexedDB remains available for cache/offline drafts and import/export. Explicit import creates a cloud mapping; no silent data adoption or last-write-wins.

## 5. Functional requirements

- FR-001: Create relational `projects` table; do not assume it exists.
- FR-002: Create relational `spaces` table with same-tenant FK to projects.
- FR-003: Create `design_revisions` with immutable snapshot, schema/canonicalizer versions and lineage.
- FR-004: Create/repair `project_members` with FK to projects and organization membership.
- FR-005: Use UUID primary keys for SaaS Project, Space and DesignRevision.
- FR-006: Preserve existing editor IDs as text inside snapshots and import mapping; do not convert them to UUID.
- FR-007: Support standalone kitchen import as one Project + one Kitchen Space.
- FR-008: Support Home import as one Project + one Space per HomeRoom, preserving level and plan x/z.
- FR-009: Keep `KitchenProjectSchema`, `HomeSchema`, file formats and existing migrations compatible.
- FR-010: Resolve actor from verified Supabase auth/session; caller-controlled identity/role headers MUST NOT grant access.
- FR-011: Resolve active organization membership from database.
- FR-012: Deny project-scoped access if project context is missing.
- FR-013: Implement all supported scope semantics or explicitly reject unsupported scopes; never broaden unsupported scope to all projects.
- FR-014: Enforce tenant consistency with composite FKs and RLS.
- FR-015: Persist project and space metadata in PostgreSQL.
- FR-016: Persist immutable revision snapshots with actor, time, parent, format, schema version and hash.
- FR-017: Commit revision and update `spaces.current_revision_id` atomically using expected-revision compare-and-swap.
- FR-018: Support idempotency key with request-hash conflict detection.
- FR-019: Write required audit and outbox events in the same transaction as revision commit.
- FR-020: Preserve local drafts with base revision and sync status.
- FR-021: Never silently overwrite a newer server revision with a stale local draft.
- FR-022: Store binary assets in object storage; persist tenant-scoped metadata/checksum in DB. Asset upload is not required for the initial design-only slice unless the existing app requires it.
- FR-023: Enable and test RLS for every new tenant-owned table.
- FR-024: Prevent ordinary app roles from updating/deleting committed revision snapshots.
- FR-025: Provide explicit archive/delete policy; do not cascade-delete audit history.

## 6. Data contracts

### Organization
Existing UUID organization identity; active membership is resolved through `org_members`.

### Client
- `id: UUID`
- `org_id: UUID`
- `name: string`
- contact/PII fields governed by approved client policy
- created/updated timestamps

Client association on Project is nullable unless product policy explicitly requires a client before a project can be created. Client consent is a separate event history, not a single mutable boolean.

### Project
- `id: UUID`
- `org_id: UUID`
- `client_id: UUID | null`
- `name: string`
- `status: draft | active | archived`
- `created_by: UUID`
- timestamps

Do not put a single `current_revision_id` on Project because a project can contain multiple independently revised spaces.

### Space
- `id: UUID`
- `org_id: UUID`
- `project_id: UUID`
- `name: string`
- `space_type: string enum` (initially kitchen plus room types already represented by Home schema)
- `level: integer`
- `plan_position_mm: {x,z} | null`
- `status: active | archived`
- `current_revision_id: UUID | null`

### DesignRevision
- `id: UUID`
- `org_id: UUID`
- `project_id: UUID`
- `space_id: UUID`
- `parent_revision_id: UUID | null`
- `snapshot_format: interior-studio/kitchen | interior-studio/home-room-design`
- `snapshot_schema_version: integer`
- `canonicalizer_version: string`
- `snapshot_jsonb: object`
- `canonical_hash: 64-char lowercase SHA-256 hex`
- `created_by: UUID`
- `created_at: timestamptz`
- `source_type: native | import | migration`
- `source_mapping_id: UUID | null`

### LegacyImportMapping
- `id: UUID`
- `org_id: UUID`
- `source_format: string`
- `source_entity_type: kitchen | home | home_room`
- `source_entity_id: text`
- `target_project_id: UUID`
- `target_space_id: UUID | null`
- `first_imported_revision_id: UUID | null`
- `imported_by: UUID`
- `imported_at: timestamptz`

Unique mapping key: `(org_id, source_format, source_entity_type, source_entity_id)`. Explicit import-as-copy creates a new mapping and does not overwrite an existing mapping.

### Revision commit request
- `orgId`, `projectId`, `spaceId` (selectors)
- `expectedRevisionId: UUID | null`
- `snapshotFormat`, `snapshotSchemaVersion`, `snapshot`
- `idempotencyKey`
- actor is derived from verified auth, never request payload.

### Revision commit result
- `revisionId`
- `parentRevisionId`
- `currentRevisionId`
- `canonicalHash`
- `committedAt`
- `replayed: boolean`

Conflict result returns current revision ID and does not mutate state.

## 7. Authorization and entitlement contract

Minimum capabilities must be mapped to the existing permission registry before implementation. Do not introduce a parallel permission vocabulary without an explicit mapping.

Required actions:
- create/read/update/archive project;
- create/read/update/archive space;
- assign project members;
- commit/read design revisions;
- import legacy design.

Authorization order:
1. verified actor;
2. active org membership;
3. role permission;
4. resource scope;
5. subscription entitlement only where an approved feature gate applies.

Feature 034 does not introduce new project quotas. Missing resource context denies scoped permissions. If the current policy evaluator cannot safely support a scope, reject that scope configuration.

## 8. Non-functional requirements

- Security: deny by default, RLS plus application authorization.
- Consistency: revision insert, current pointer, idempotency, audit and outbox atomic.
- Reliability: stale writes return conflict; retries are idempotent.
- Compatibility: existing editor schema and file envelopes remain readable/writable.
- Privacy: minimize client PII; consent and retention require approved policy.
- Traceability: all revisions have actor/time/parent/hash/source metadata.
- Determinism: canonical hash is versioned and stable across supported runtimes.
- Maintainability: no database/network dependency in pure domain/engine packages.
- Testability: clean DB migrations, representative import fixtures, cross-tenant negative tests.

## 9. Out of scope

- Full survey/MOM/MEP workflows.
- Client portal/external share links.
- Full offline collaborative merge.
- Full subscription engine redesign.
- Full custom role-management UI.
- Production package generation and factory release.
- Work orders/installation/handover.
- Converting editor element IDs to UUID.
- Destructive migration of IndexedDB stores.

## 10. Open decisions [V]

- Whether client is mandatory and which fields are mandatory.
- Whether one project may have multiple client contacts/entities.
- Consent notice/purpose/capture requirements and retention.
- Project archival/deletion and PII erasure behavior.
- Whether Feature 034 needs team/client/specific-project scopes or only all/assigned.
- Whether app accesses Supabase with user JWT directly or uses server APIs/RPCs.
- Actual Supabase region and deployment configuration.
- Offline draft behavior before organization selection.
- Whole-home floor-plan artifact ownership and versioning.

## 11. Approved product decisions — authoritative

The following decisions were confirmed by the product owner and supersede conflicting open questions or conditional wording elsewhere in this specification.

1. **Client is optional.** A Project may be created with `client_id = NULL`. Client creation or association may happen later. No client name, mobile number, consent event or client record is a prerequisite for project creation. When a client is associated, it must belong to the same organization. Client PII remains outside design snapshots.
2. **Authorization scope for Feature 034 is assigned-project scope.** Implement and test `assigned_projects` for project-scoped operations. Organization-wide access may be granted only through an explicitly configured `all_projects` permission. Do not enable team/client/specific-project scopes in this feature; reject those scope configurations rather than broadening access. Project-scoped operations with missing project context deny.
3. **Offline strategy is to preserve existing IndexedDB behavior and add cloud sync.** Keep local editing and existing import/export. Track the server base revision and sync state. No full offline-first collaborative merge is required. Stale drafts must be preserved and surfaced as conflicts; never silently overwrite the server.

### Updated acceptance implications

- Project creation without a client succeeds for an authorized member.
- Project creation with a same-org client succeeds; cross-org association fails.
- Assigned members can access their assigned projects; unassigned members cannot access them unless they have an explicit all-projects grant.
- Team/client/specific-project scope assignments are rejected for Feature 034.
- A user can continue editing an existing local draft while offline; sync occurs when connectivity returns and uses expected-revision concurrency.
