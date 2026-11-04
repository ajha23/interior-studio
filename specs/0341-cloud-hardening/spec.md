# Feature 034.1 — Cloud Persistence & Security Hardening

**Status:** Proposed specification  
**Parent:** Feature 034 — Canonical Project Foundation & Cloud Persistence  
**Target branch:** `spec/0341-cloud-hardening`  
**Scope:** Complete the secure, authoritative cloud persistence boundary for SaaS Projects, Spaces and immutable Design Revisions.  
**Non-goal:** Rebuild the editor, replace IndexedDB, introduce collaborative editing, or implement the Project Lifecycle engine.

## 1. Problem statement

Feature 034 introduced the canonical SaaS Project / Space / DesignRevision model and local domain operations. The current cloud-project store still performs important create, archive, import and revision operations in Zustand memory. A successful local domain operation must not be represented as a successful cloud commit. Tenant isolation, verified identity, atomic database commits, durable idempotency and remote conflict detection must be enforced at the persistence boundary.

## 2. Goals

1. Make PostgreSQL/Supabase authoritative for persisted Project, Space, membership and DesignRevision state.
2. Derive actor and tenant context from a verified authenticated session and active organization membership; never trust caller-supplied identity headers or body fields.
3. Enforce tenant isolation and project access in database policies and server use cases.
4. Commit a DesignRevision atomically with its Space current-revision pointer, idempotency result, audit event and outbox event.
5. Make create/archive/import operations durable and safely retryable.
6. Preserve local IndexedDB editing, drafts and existing editor document format.
7. Detect remote revision changes using server state and compare-and-swap; preserve stale local drafts for explicit resolution.
8. Provide integration, security, migration and E2E evidence sufficient for release.

## 3. Non-goals

- Real-time multi-user co-editing, operational transforms or CRDT.
- Last-write-wins conflict resolution.
- New project lifecycle stages, artifact dependency graph, MOM, survey or MEP workflows.
- Replacing `KitchenProject.id`, Home/room IDs, scene IDs, the existing command pipeline or IndexedDB.
- Moving editor geometry or domain logic into Supabase-specific modules.
- Storing client PII inside design snapshots.

## 4. Existing contracts that MUST remain true

- SaaS Project, Space and DesignRevision UUIDs are distinct from legacy editor document IDs.
- A Project may be created without a Client. `client_id` remains nullable; client association is optional and same-organization only.
- Kitchen import creates one SaaS Project, one Kitchen Space and its initial immutable revision.
- Home import creates one SaaS Project, one Space per HomeRoom and an initial revision per imported room. Preserve legacy Home ID, room ID, derived room project ID, level, plan x/z and embedded design.
- Snapshot envelope retains `format = interior-studio/kitchen` and the existing supported schema version; do not rewrite legacy document identifiers.
- Canonical hash is versioned deterministic canonical JSON encoded as UTF-8 and hashed with SHA-256. Golden vectors are required.
- Feature 034 authorization supports assigned-project scope and explicit all-projects scope only. `team_projects`, `client_projects`, and `specific_projects` are unsupported and must be rejected, not broadened.
- Missing tenant, actor, project or space context fails closed.
- Assigned access requires an active project_members assignment and active organization membership.
- Offline editing remains local-first. Store base revision and sync state; preserve stale drafts and require explicit conflict handling.
- Client PII is excluded from scene snapshots.

## 5. Personas and permissions

- **Organization member:** can access only projects granted by explicit role scope.
- **Assigned project member:** can read/write only projects with an active assignment and sufficient action permission.
- **All-projects role:** can access all projects in the active organization only when the permission is explicitly granted.
- **Organization administrator:** may manage membership/role assignment only through authorized administrative use cases; admin status does not bypass tenant isolation.
- **Unauthenticated / inactive / suspended / cross-tenant actor:** denied.

Permission evaluation must use verified server-side identity and explicit active organization context. Do not accept `userId`, `orgId`, `roles`, `actorId` or `projectMember` supplied by an untrusted browser request as authorization facts.

## 6. Functional requirements

### FR-01 Verified identity
Every protected request resolves actor ID from the verified Supabase JWT/session. Resolve active organization membership from trusted database state. Reject absent, invalid, expired, revoked or inactive identity/membership. Remove any fallback that trusts `x-user-id`, `x-org-id`, `x-user-roles` or equivalent caller-controlled headers.

### FR-02 Tenant isolation
All tenant-owned rows carry `org_id`. Every cross-row relationship must prove tenant equality, preferably with composite unique keys and composite foreign keys. RLS must fail closed when tenant context is absent. No policy may use a predicate that degenerates into `org_id = org_id` when the claim is null. Review table grants, RLS enablement/force settings, policy composition, SECURITY DEFINER ownership/search_path and execute grants.

### FR-03 Project authorization
Support only:
- `all_projects`: permission explicitly granted to actor in active org.
- `assigned_projects`: active org membership AND active `project_members` row for target project AND action permission.
Reject unknown/unsupported scopes. A null project ID never satisfies assigned-project access. Read and write permissions are separate. Archive, membership administration and revision commit are separately authorized actions.

### FR-04 Persistence adapter
Introduce a framework-independent application port and Supabase-backed adapter. Keep domain functions pure. Components and Zustand stores call application use cases; they must not construct database writes or claim cloud success based only on local state. The adapter returns typed success/error/conflict outcomes.

### FR-05 Project and Space operations
Implement durable create, list, get, update metadata, archive and create Space operations. Enforce active tenant and authorization server-side. Archive is a soft state transition; it must not cascade-delete revisions or audit evidence. Validate Space belongs to Project and both belong to active org.

### FR-06 Revision commit
Provide a single server-side transaction/RPC for commit:
1. Verify actor, org membership, project permission and active Space.
2. Validate request schema, snapshot format/version/size and references.
3. Calculate or independently verify canonical hash server-side using the agreed canonicalization contract.
4. Check idempotency key within actor/org/operation scope. Same key + same request hash returns original result; same key + different hash returns conflict.
5. Lock or conditionally update Space using expected current revision pointer.
6. If pointer differs, return a typed conflict with current revision metadata; do not write partial records.
7. Insert immutable DesignRevision with parent revision and actor.
8. Update Space current_revision_id with CAS semantics.
9. Insert audit record and outbox event in the same transaction.
10. Persist idempotency response in the same transaction.
11. Return committed revision ID, revision number, hash and new pointer.
A failed step rolls back all writes. Do not trust client-supplied actor/org IDs or hash as authoritative.

### FR-07 Idempotency
Idempotency key is required for mutating operations that may be retried over unreliable networks. Enforce a unique constraint on the intended scope (org, actor, operation, key). Store canonical request hash, outcome status and minimal replayable response. Define retention/cleanup without deleting audit records. Concurrent duplicate requests must serialize to one committed result.

### FR-08 Audit and outbox
Audit is append-only for application roles. Record actor, org, target type/id, action, timestamp, correlation/request ID and minimal before/after metadata; never include snapshot contents, credentials or client PII unnecessarily. Outbox event is written transactionally and processed asynchronously with at-least-once delivery; consumers must be idempotent. Track attempts, next retry, processed timestamp and terminal failure/dead-letter state.

### FR-09 Import
Validate file envelope and schema before persistence. Import Kitchen and Home atomically when practical. For large Home imports, use a resumable import operation with idempotent batch keys and explicit `pending/committing/committed/failed` state; never expose a partially imported Project as complete. Preserve legacy mappings. Re-import behavior must be explicit and deterministic.

### FR-10 Local-first sync
IndexedDB remains the local draft/cache. Persist `baseRevisionId`, local document ID, local canonical hash, last known server hash, sync status and last successful sync timestamp. On reconnect, fetch authoritative current pointer before commit. Never overwrite a remote revision automatically. A conflict preserves the local draft and exposes remote revision metadata and explicit actions: reload remote, keep local as a new branch/draft, or compare/resolve. Do not silently create a new revision from stale state.

### FR-11 Error model
Return typed errors: `UNAUTHENTICATED`, `ORG_MEMBERSHIP_REQUIRED`, `FORBIDDEN`, `NOT_FOUND`, `VALIDATION_FAILED`, `REVISION_CONFLICT`, `IDEMPOTENCY_KEY_REUSED`, `RATE_LIMITED`, `RETRYABLE_UNAVAILABLE`, `INTERNAL`. Avoid leaking cross-tenant resource existence; use not-found semantics where appropriate.

### FR-12 Observability
Emit structured logs and metrics for auth denials, RLS denials, revision commits/conflicts, idempotency replay/mismatch, import outcomes, outbox backlog/retries and sync failures. Correlate requests end-to-end. Do not log JWTs, secrets, full snapshots or sensitive PII.

## 7. Data integrity requirements

- Composite tenant keys for org-owned entities and relationships.
- Foreign keys for Project -> Client, Space -> Project, Revision -> Space, membership -> Project and org membership.
- Same-org constraints for client association and project membership.
- Unique revision sequence per Space; immutable revision payload/hash/parent/actor/created-at after insert.
- Space current_revision_id must reference a revision belonging to that same Space.
- Idempotency uniqueness and request-hash consistency.
- Audit/outbox tenant and target consistency where relationally enforceable.
- Archive must preserve revision and audit history.
- Define deletion/retention as a separate governed operation; no cascading loss of audit evidence.

## 8. API / application contract

Suggested use cases (names illustrative; align to repository conventions):
- `createProject({ name, optionalClientId })`
- `listProjects({ cursor, filters })`
- `getProject({ projectId })`
- `archiveProject({ projectId, idempotencyKey })`
- `createSpace({ projectId, name, type, level, planPositionMm })`
- `listSpaces({ projectId })`
- `commitDesignRevision({ projectId, spaceId, expectedRevisionId, snapshot, idempotencyKey })`
- `importKitchen({ validatedEnvelope, idempotencyKey })`
- `importHome({ validatedEnvelope, idempotencyKey })`
- `getSyncState({ projectId, spaceId })`

The authenticated actor and active org are injected by trusted server context, not accepted as request payload fields. Keep the existing pure `commitSpaceRevision` function for deterministic domain validation/tests if useful, but it must not be presented as durable commit.

## 9. Migration requirements

- Add a new forward-only migration; do not rewrite already-applied migrations in shared environments.
- Before applying, inventory existing rows, constraints, policies, grants, functions and indexes.
- Backfill or repair tenant-consistent relationships before adding NOT VALID constraints; validate after cleanup.
- Make RLS policy behavior explicit for missing claims and every supported role scope.
- Review `ON DELETE SET NULL` on composite FKs where non-null tenant columns participate; use an appropriate constraint design.
- Review security-definer functions for fixed safe search_path, minimal ownership and explicit EXECUTE grants.
- Ensure service-role usage is server-only and never exposed to browser bundles.
- Include clean-install and upgrade-from-current-schema tests, plus rollback/forward-recovery instructions.

## 10. Acceptance criteria

Feature is accepted only when:
1. No protected operation trusts caller-provided identity/tenant/role headers.
2. Missing or invalid identity/tenant context denies access.
3. Cross-tenant reads and writes fail for every table and RPC.
4. Assigned-project access requires active org membership and active project assignment.
5. Explicit all-project permission works only inside the active org.
6. Unsupported scopes are rejected.
7. Project/Space CRUD is durable across reload and another authenticated session.
8. Revision commit is atomic and server-authoritative.
9. Concurrent stale commits yield one winner and one typed conflict.
10. Retry with same idempotency key/request returns same revision; changed payload with same key is rejected.
11. Audit and outbox records are written in the same transaction as the revision.
12. Revisions cannot be mutated/deleted by ordinary application roles.
13. Kitchen and Home imports persist correctly and reopen with legacy IDs/geometry preserved.
14. Offline edits remain available locally; reconnect detects stale base revision without data loss.
15. No false `synced` or `committed` UI state is possible before server acknowledgement.
16. Migration tests, RLS tests, API tests and E2E tests pass in CI.

## 11. Definition of done

- Migrations reviewed and tested on clean and upgraded databases.
- RLS/grants/RPC security review completed.
- Persistence adapter and use cases implemented with typed errors.
- Zustand/UI state reflects server acknowledgement only.
- Automated unit, integration, RLS, API and E2E suites pass.
- Operational metrics/logging and runbook added.
- Feature 034 tasks/status are reconciled with actual evidence.
- No editor rebuild, IndexedDB replacement, or lifecycle scope creep.

## 12. Risks and decisions requiring confirmation

- Whether browser clients call Supabase RPC directly under user JWT or a trusted application API mediates writes. Choose one consistent security boundary; never expose service-role credentials.
- Snapshot maximum size and upload strategy. Large binary assets should use object storage with tenant-scoped paths and signed access, not be embedded in revision JSON.
- Idempotency and audit retention periods must align with product/legal policy.
- Whether import is one transaction or resumable batches depends on realistic Home snapshot sizes; both must preserve atomic user-visible completion.
