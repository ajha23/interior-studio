# 034 — Project Foundation and Cloud Persistence: Repository-Reviewed Design

**Status:** Revised draft. This is a design contract, not implementation evidence.

## 1. Canonical identity model

Three distinct identities are required:

| Identity | Type | Purpose |
|---|---|---|
| SaaS Project | UUID | Customer engagement / tenant-owned aggregate |
| Space | UUID | Room or area within a project |
| DesignRevision | UUID | Immutable version of a space design document |
| Editor document ID | Existing string | Compatibility/local editor identity; preserved inside snapshot |
| Scene element IDs | Existing strings | Stable cabinet/appliance/furniture/opening/MEP IDs |

Do not use `KitchenProject.id` as the SaaS project primary key. The current Home schema embeds KitchenProject per room and derives room project IDs using `homeId--roomId`. These IDs remain import provenance, not relational keys.

## 2. Domain mapping

### Standalone kitchen file
`interior-studio/kitchen` envelope → one SaaS Project → one Kitchen Space → one initial DesignRevision.

### Whole-home file
`interior-studio/home` envelope → one SaaS Project → one Space per HomeRoom → one initial DesignRevision per room.

Preserve Home-level fields (kind, BHK, plot, levels, floorHeight, style) as a versioned project metadata snapshot or dedicated project configuration. Preserve each HomeRoom's ID, name, type, level, x/z position and embedded design. Do not flatten a multi-room Home into one KitchenProject.

The exact persistence representation for whole-home floor-plan geometry is an open product decision. Initial implementation must at minimum retain enough versioned metadata to reconstruct the existing Home plan.

## 3. Relational model and constraints

Recommended tables:
- `projects`
- `spaces`
- `design_revisions`
- `project_members` (repair existing table)
- `legacy_import_mappings`
- `idempotency_records`
- `outbox_events` (reuse existing implementation if proven)
- client/consent relationship repair as a separate migration unit.

Use composite tenant keys:
- `clients UNIQUE (id, org_id)`
- `projects UNIQUE (id, org_id)`, FK `(client_id, org_id) → clients(id, org_id)`
- `spaces UNIQUE (id, org_id, project_id)`, FK `(project_id, org_id) → projects(id, org_id)`
- `design_revisions UNIQUE (id, space_id)`, FK `(space_id, org_id, project_id) → spaces(id, org_id, project_id)`
- parent revision FK must constrain parent to same space.
- project_members FK to projects and org_members with same org.

If nullable client_id is used, composite FK must allow NULL client_id while still enforcing organization on non-null values.

Add a deferred composite FK for `spaces.current_revision_id` to a revision in the same space, or use a carefully designed pointer table. Ensure initial revision insertion and pointer update can occur in one transaction.

Do not cascade-delete audit records from organizations. Define explicit offboarding/retention workflow.

## 4. Snapshot contract

A DesignRevision stores a document wrapper, not a second geometry model:

```ts
type DesignSnapshot =
  | {
      format: 'interior-studio/kitchen';
      schemaVersion: number;
      document: KitchenProject;
    }
  | {
      format: 'interior-studio/home-room-design';
      schemaVersion: number;
      document: KitchenProject;
      provenance: {
        homeSourceId: string;
        roomSourceId: string;
        homeKind: 'apartment' | 'villa';
        level: number;
        planPositionMm: { x: number; z: number };
      };
    };
```

The above is a conceptual contract; exact TypeScript types should import existing inferred domain types, not duplicate them.

Keep `document.id` as the original editor string. Project/space IDs are outer relational metadata. Do not change the existing kitchen file envelope or schema version merely to introduce SaaS IDs.

Validate snapshots by:
1. parsing existing file/envelope format;
2. running existing schema migrations;
3. running `KitchenProjectSchema` / `HomeSchema`;
4. running domain `validateProject` for each scene;
5. enforcing payload size limits and supported schema versions.

Do not silently strip unknown data or normalize geometry during import.

## 5. Revision commit boundary

Expose one application use case, backed by one transactional database function or transaction boundary.

Input contains selectors and expected revision, not actor identity:
- orgId, projectId, spaceId;
- expectedRevisionId nullable;
- validated snapshot wrapper;
- idempotency key.

Actor is derived from verified Supabase auth.

Atomic transaction:
1. Resolve `auth.uid()`; reject NULL.
2. Confirm active `org_members` row for org.
3. Load project/space and prove same org/project relationship.
4. Evaluate permission and scope against project.
5. Look up idempotency record by org + actor + operation + key.
6. If prior record has same request hash, return prior result; if hash differs, return idempotency conflict.
7. Insert immutable design revision.
8. Compare-and-swap current revision pointer:
   `UPDATE spaces SET current_revision_id = new_revision_id WHERE id = space_id AND org_id = org_id AND current_revision_id IS NOT DISTINCT FROM expected_revision_id`.
9. If affected row count is not exactly one, raise conflict and roll back revision insert.
10. Insert audit event and outbox event.
11. Persist idempotency result.
12. Commit.

The transaction must ensure the expected revision belongs to the same space. A NULL expected revision is valid only when no current revision exists.

## 6. Idempotency contract

Table key:
`(org_id, actor_id, operation, idempotency_key)` unique.

Store:
- request_hash;
- status;
- resulting resource ID/revision ID;
- response metadata;
- created_at and expiry/retention metadata.

Rules:
- Same key + same request hash → return original successful response.
- Same key + different request hash → 409 idempotency conflict.
- Failed validation/authorization must not create a success record.
- Transaction rollback leaves no partial revision or pointer update.
- Retention must exceed maximum client retry window; document cleanup policy.

## 7. Authorization and RLS

Current code has a header-derived default actor, separate RBAC implementations and incomplete scope behavior. Do not expose cloud writes until the server resolver is replaced.

Preferred boundary:
- Supabase JWT/session verified by server.
- actor identity derived from `auth.uid()`.
- membership read from database.
- narrowly scoped SECURITY DEFINER RPCs perform writes; each RPC validates actor, org membership, permission and resource relationship.
- direct writes to revision tables are revoked from authenticated role.
- SELECT policies enforce tenant and project visibility.
- no use of caller-controlled `x-org-id` or `app.current_org_id` as authority.

If direct user-JWT repository writes are used instead, every table needs explicit INSERT/UPDATE WITH CHECK and RLS tests. Never use service role as a shortcut around RLS.

Scope policy:
- all_projects: org member with permission.
- assigned_projects: requires non-null project ID and matching project_members row.
- team_projects/client_projects/specific_projects: implement fully before assigning those scopes; until then reject these scope types for this feature.
- Missing resource context for any scoped grant denies.

Do not let the current SQL authorize function accept NULL project_id for assigned scope.

## 8. Client and consent migration

The existing schema has a consent ledger without client_id and a client row with optional consent_id. It also requires client mobile. Do not add more semantics without validation.

Proposed event model:
- consent belongs to client and organization;
- multiple consent events per client;
- withdrawal creates/updates withdrawal event state according to legal review;
- notice version, purpose, capture channel, actor, timestamp and evidence;
- no unnecessary raw IP retention.

A project may have nullable client_id until product confirms client creation requirements. Client PII is not embedded in design snapshots.

## 9. Local persistence and import

IndexedDB currently stores kitchen projects, whole homes, packages and assets. Preserve it.

Import workflow:
1. User authenticates and selects organization.
2. User chooses create new project or attach to existing project.
3. For kitchen file, choose/create one target space.
4. For Home file, preview rooms and map each room to a new space.
5. Parse and validate using existing migration/schema code.
6. Show import summary and validation warnings.
7. Create mapping rows and first revisions transactionally.
8. Preserve original local record until server commit is confirmed.
9. Mark local record synced with server project/space/revision IDs.
10. On retry, use idempotency/mapping to avoid duplicate imports.

Import-as-copy is an explicit user action and creates a new mapping. Do not deduplicate solely on matching document IDs across tenants.

## 10. Canonical hash

Define canonicalizer version (e.g. `json-c14n-v1`) with deterministic object key ordering, explicit handling of undefined/default fields, deterministic number encoding, UTF-8 byte encoding and SHA-256.

Hash the canonical snapshot wrapper plus schema/canonicalizer version. Exclude export `savedAt`, request IDs and other volatile metadata. Preserve all semantically relevant document data.

Golden vectors must cover:
- empty/default arrays and optional defaults;
- object key ordering;
- integer mm and half-mm centre coordinates;
- negative/zero values where schema permits;
- non-ASCII names/material labels;
- stable hash across browser and server runtimes.

Do not rely on ordinary JSON.stringify as the cross-runtime canonical contract without tests.

## 11. Audit and outbox

Revision commit audit and outbox records are written in the same transaction. Audit metadata contains resource IDs, action, actor, time and correlation ID; no raw client PII or full snapshot.

The existing audit migration's org FK cascade must be reviewed. The default partition and all partitions must have equivalent mutation protections. Revoke mutation privileges from application roles. Define retention/offboarding and privileged database owner trust boundary.

## 12. Application package integration

- Domain/core owns schemas and invariants; no Supabase imports.
- Persistence adapter owns SQL/repository calls.
- Platform owns verified actor/authorization.
- Web app owns project/space UI and local sync status.
- Existing `src/domain/commands` remains the only way to change scene content.
- Revision commit stores the resulting validated snapshot after command execution.
- No new microservice; worker app is not required for this first slice.

Package facades currently re-export from `src/`; Feature 034 must not attempt wholesale package extraction.

## 13. Failure semantics

| Failure | Result |
|---|---|
| No verified actor | 401; no writes |
| No org membership | 403; no writes |
| Permission/scope denied | 403; no writes |
| Client/project tenant mismatch | constraint/validation failure |
| Invalid snapshot/schema | 422; no revision |
| Unsupported schema version | 422; retain local source |
| Stale expected revision | 409 with current revision ID |
| Idempotency key reused with same hash | original result |
| Idempotency key reused with different hash | 409 |
| Audit/outbox insert fails | entire transaction rolls back |
| Network lost after commit | retry returns idempotent original result |
| Object upload fails | no DB asset reference; retryable orphan cleanup policy |

## 14. Operational readiness

Before production:
- clean database migration test;
- representative backup restore migration test;
- RLS test suite;
- cross-tenant negative tests;
- backup/restore exercise;
- storage bucket policies;
- JWT verification and key rotation;
- monitoring for conflict/error rates;
- migration rollback/forward-recovery notes;
- no real PII in fixtures.

## 15. Approved product decisions — authoritative

These decisions supersede any open questions in earlier sections:

- **Client optional:** `projects.client_id` is nullable. Create Project does not create or require a Client. A same-organization Client may be attached later. Composite tenant FK still applies when client_id is non-null. Do not require client mobile, consent or PII for project creation.
- **Assigned-project authorization:** Feature 034 implements `assigned_projects` as the default project-scoped access model. `all_projects` is permitted only as an explicit role permission. The assignment lookup must require a non-null project ID and a matching active project_members row. Team, client and specific-project scopes are not supported in this feature and must be rejected, not treated as all-projects.
- **Existing offline behavior:** IndexedDB remains the local editor/draft store. Cloud sync is additive. No full offline collaborative merge is in scope. Local drafts carry their base server revision; stale sync returns a conflict and preserves the local draft.

### Updated policy predicate

For a project-scoped action, allow only when:
`verified_actor AND active_org_membership AND permission_grant AND ((scope = all_projects) OR (scope = assigned_projects AND project_id IS NOT NULL AND active_project_membership))`.

The all-projects branch must be explicit and auditable. Missing project context never satisfies assigned-project scope.
