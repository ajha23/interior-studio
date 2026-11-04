# Feature 034 — Repository-Level Design Review

**Review status:** Complete at source-inspection level; revised feature remains draft pending product/security validation.  
**Reviewed branch:** `refactorV2`  
**Documentation branch:** `docs/lifecycle-architecture-baseline`  
**Application code changed:** No.  
**Runtime/database verification:** Not performed.

## 1. Executive decision

Do not implement the original Feature 034 draft unchanged. The product direction is sound, but its identity, persistence, authorization and migration contracts are too abstract to safely implement against the repository as it exists.

The revised feature must:
1. Treat the existing `KitchenProject` as a **space design document/editor aggregate**, not the SaaS project.
2. Introduce UUID-backed tenant/project/space/revision records while preserving existing editor IDs and file formats as opaque legacy identifiers.
3. Model whole-home `Home` files as one project containing multiple spaces, with each room design retained as a space-specific snapshot.
4. Create a real canonical projects table and explicit tenant-consistent relationships; the inspected migration chain does not create it.
5. Establish a verified authentication and resource-authorization boundary before cloud persistence is enabled.
6. Use a transactionally atomic revision commit with compare-and-swap, idempotency and audit/outbox writes.
7. Migrate local data by explicit import and mapping, not by silently adopting browser-local IDs as database primary keys.

Feature 034 should deliver a narrow but real vertical slice: tenant → client → project → space → import/open existing design → commit immutable revision → reopen from another authorized session.

## 2. Source files inspected

### Existing domain and persistence
- `src/domain/schema.ts`: `SCHEMA_VERSION = 2`; `KitchenProjectSchema` has string `id`, room, surfaces, cabinets, appliances, materials, viewpoints, furniture, preferences, openings, MEP and production settings. Lengths are integer millimetres; element IDs are strings.
- `src/domain/project/serialization.ts`: `interior-studio/kitchen` JSON envelope; schema migrations; validation through `KitchenProjectSchema` and `validateProject`.
- `src/persistence/projectDb.ts`: IndexedDB stores `projects`, `homes`, `packages`, `assets`; local project primary key is `KitchenProject.id`; local save/list/load/delete are browser operations.
- `src/domain/home/schema.ts`: `Home` contains `HomeRoom[]`; each room embeds `KitchenProjectSchema`; `roomProjectId(home, room)` derives a string ID as `home.id--room.id`.
- `src/domain/commands/schema.ts` and `src/domain/commands/execute.ts`: Zod discriminated command schema and immutable Immer execution; commands mutate the existing `KitchenProject` model.

### Authorization
- `src/domain/platform/authorization/types.ts`: resource scopes include `all_projects`, `assigned_projects`, `team_projects`, `client_projects`, `specific_projects`.
- `src/domain/platform/authorization/evaluator.ts`: no-resource-context branch allows the first granted scoped permission; `specific_projects` is not evaluated.
- `src/domain/platform/saas/policyEngine.ts`: a second RBAC/scope implementation; it stops after the first role grant and only performs a partial assigned-project check in the inspected implementation.
- `src/server/authorizationMiddleware.ts`: default actor resolver reads `x-user-id`, `x-org-id`, `x-user-roles`, `x-team-id`, `x-client-id` headers.

### Database migrations
- `00001_security_hardening.sql`: conditionally enables RLS only if organizations/org_members/projects already exist; migration order means organizations/projects may not yet exist at this point.
- `00002_rbac_and_entitlements.sql`: creates organizations, roles, permissions, role_permissions and org_members. It does not create a projects table in the inspected content.
- `00003_dpdp_clients_and_consents.sql`: creates clients and consents; consent rows have org_id but no client_id; clients have consent_id; projects.client_id is added only if projects already exists. The migration does not itself enable RLS or define policies for clients and consents.
- `00004_append_only_audit_log.sql`: audit log is partitioned and has row-level UPDATE/DELETE trigger; TRUNCATE is revoked from PUBLIC/authenticated. Organization FK cascades on delete.
- `00005_immutable_production_packages.sql`: production package project_id is text; package table uses RLS expression based on `current_setting('app.current_org_id', true)`; policy is FOR ALL with USING and no explicit WITH CHECK.
- `00006_dynamic_custom_roles.sql`: project_members.project_id is UUID but has no FK to projects in this migration; `authorize` only evaluates all_projects and assigned_projects. For assigned_projects, a NULL project ID is accepted by the SQL condition.
- `00007_saas_subscriptions_and_entitlements.sql`: tenant subscription/override/quota RLS uses a JWT org_id claim; `authorize_policy` is STABLE and checks quota availability but does not reserve quota atomically.

## 3. Critical design corrections

### 3.1 Separate SaaS Project, Space and editor document identity

Do not rename or reinterpret `KitchenProject.id` as a SaaS Project UUID.

Target:
- `projects.id`: UUID, canonical engagement identity.
- `spaces.id`: UUID, canonical room/area identity.
- `design_revisions.id`: UUID, immutable revision identity.
- `design_revisions.snapshot_jsonb`: validated versioned scene/document snapshot.
- `design_revisions.legacy_source_id`: optional opaque source identifier for imported editor data, not a relational key.

Keep `KitchenProject.id` unchanged inside the scene snapshot during initial cloud migration. It may be useful for editor-local lookup and file compatibility; it must not be used as an authorization key.

For whole-home import:
- One `Home` envelope maps to one SaaS Project.
- Each `HomeRoom` maps to one Space.
- Each room's embedded `design` maps to the initial DesignRevision for that Space.
- Preserve the room's original `id`, `Home.id`, derived `roomProjectId` and embedded design IDs in import provenance/legacy mapping.
- Do not flatten all rooms into a single KitchenProject or lose floor/level/plan coordinates.

For standalone kitchen import:
- One kitchen file maps to one Project and one Kitchen Space, unless the user explicitly selects an existing project/space.
- A later import into an existing space creates a new revision; it does not overwrite prior revision history.

### 3.2 Avoid premature UUID migration of legacy IDs

The existing editor schema permits opaque alphanumeric, underscore and hyphen IDs up to 64 characters. Home room IDs are derived strings. There is no evidence that all current editor IDs are UUIDs.

Use UUIDs for new relational entities and preserve legacy IDs as text in a mapping table:
- org_id
- source_format
- source_entity_type
- source_entity_id
- target_project_id
- target_space_id nullable
- first_imported_revision_id nullable
- imported_by
- imported_at

Unique key should include organization + source format + source entity type + source entity ID. The import flow must still allow an explicit “import as a copy” that creates a new mapping.

### 3.3 Fix the authorization boundary before exposing cloud APIs

P0:
- Replace default header-based actor resolution with verified Supabase auth/session resolution.
- Caller-supplied org/project IDs are selectors only.
- Resolve active organization membership from the database; do not trust a client-provided org claim as sole proof.
- One canonical evaluator must be used by API/use cases and RLS helper functions where feasible.
- Missing project context for project-scoped permission must deny.
- Implement all scopes or reject unsupported scope definitions. For Feature 034, if full team/client/specific scope semantics are not ready, permit only `all_projects` and `assigned_projects` and explicitly reject the other three rather than silently broadening access.
- Do not allow a server service-role client to become a hidden authorization bypass. Prefer user-scoped JWT database access or narrowly scoped SECURITY DEFINER RPCs that validate auth.uid(), membership, permission, resource and tenant internally.

Do not attempt a broad role-management UX rewrite in Feature 034. Make the minimal security changes required for project/space CRUD and revision commit; track full evaluator convergence as a dependent platform task if it cannot be completed safely in this feature.

### 3.4 Make the relational schema executable

The inspected migrations do not establish a canonical projects table. Feature 034 must create it, not assume it exists.

Use composite tenant constraints:
- organizations(id)
- clients(id, org_id) UNIQUE (id, org_id)
- projects(id, org_id, client_id) with FK to clients(id, org_id)
- spaces(id, org_id, project_id) with FK to projects(id, org_id)
- design_revisions(id, org_id, project_id, space_id) with composite FK to spaces(id, org_id, project_id)
- project_members(org_id, project_id, user_id) with same-tenant project FK and org-member FK

Current project_members has UUID project_id without a projects FK; add/repair constraints in a new migration only after the project table exists and orphan rows are reconciled.

Avoid cascading deletion from organizations into audit history. Use explicit tenant offboarding/anonymization workflow and retention policy.

### 3.5 Correct client and consent relationship

Current `consents` has no client_id and `clients.consent_id` is nullable. Decide the business meaning before schema implementation.

Recommended:
- Consent is a client-linked event with `org_id`, `client_id`, notice/version, purpose, capture channel, captured_at, withdrawn_at and evidence reference.
- Add a composite FK to ensure consent and client belong to same org.
- Support multiple consent events over time; do not overwrite historical consent when withdrawn.
- Do not make consent a hard prerequisite to creating a project unless the actual processing purpose and approved legal basis require it [V].
- Minimize or avoid storing raw IP address unless justified and retention-governed.

### 3.6 Revision contract and concurrency

The original draft's `Project.currentRevisionId` is ambiguous for a multi-space project. Use `spaces.current_revision_id` as the active design pointer. Project is a container and can have many independently revised spaces.

A revision is immutable and stores:
- UUID id, org/project/space IDs;
- parent_revision_id (same space);
- snapshot_format (e.g. kitchen/home-room design);
- snapshot_schema_version;
- canonicalizer_version;
- snapshot_jsonb;
- canonical_hash;
- actor and timestamp;
- import/source provenance.

Commit should be a single database transaction/RPC:
1. Validate auth.uid and active org membership.
2. Validate project/space relationship and permission/scope.
3. Check idempotency key and request hash.
4. Validate payload size and schema version; application validates Zod schema/domain invariants before RPC, with RPC validating trusted metadata/relationship.
5. Insert immutable revision.
6. Compare-and-swap `spaces.current_revision_id` against expected revision (including NULL for first revision).
7. Insert audit event and outbox event in the same transaction.
8. Store idempotency result.
9. Commit.

If compare-and-swap affects zero rows, rollback revision/audit/outbox and return a conflict. Duplicate key with same request hash returns original result; same key with different request hash returns idempotency conflict.

Do not depend on a separate app-side read then write. Do not make the revision snapshot mutable to support editing.

### 3.7 Canonical hashing

Do not assume `JSON.stringify` output is a cross-runtime canonical representation.

Define canonicalization version with:
- deterministic object-key ordering;
- explicit handling of undefined/omitted/default fields;
- numeric serialization contract;
- UTF-8 byte encoding;
- SHA-256;
- documented exclusion/inclusion of volatile envelope fields such as savedAt;
- golden test vectors including non-ASCII material names and labels.

The existing file envelope includes savedAt; the revision hash must cover canonical scene content and schema metadata, not incidental export timestamp.

### 3.8 RLS and trusted write path

- Add RLS for every new tenant-owned table.
- Policies must use verified auth.uid() + database membership and resource relationship, not an untrusted session variable or a caller-controlled org selector.
- Add explicit INSERT WITH CHECK and UPDATE USING/WITH CHECK policies where direct table writes are allowed.
- If writes are RPC-only, revoke direct table mutations from authenticated and grant EXECUTE only on RPCs; RPC must verify actor, membership and project scope.
- SECURITY DEFINER functions must pin search_path, use fully qualified names, revoke PUBLIC, validate auth.uid and have tests for direct RPC invocation.
- Add object-storage path policies using org/project/space ownership; signed URLs must be short-lived and only minted after authorization.

### 3.9 Audit/outbox atomicity

Use a transactional outbox for reliable downstream work. A project/revision mutation and its required audit/outbox rows must commit or roll back together.

Audit log hardening should include:
- no ON DELETE CASCADE from organizations;
- explicit retention and tenant-offboarding policy;
- revoke mutation rights from app roles;
- protect partitions/default partition as well as parent;
- TRUNCATE privileges/trigger and owner boundary documented;
- never claim protection from database owner/superuser;
- do not put raw PII, tokens or complete scene snapshots in metadata.

### 3.10 Entitlement boundary

Feature 034 is not a subscription billing implementation. It must call the canonical entitlement service only if a project/space quota is already product-defined. Do not invent a project cap in this feature.

Authorization = authenticated actor ∧ active tenant membership ∧ RBAC/resource scope ∧ entitlement (when a feature gate applies). Quota reservation is not part of ordinary project create unless the product defines a metered limit. When a metered operation is added, use a separate transactional reservation flow.

## 4. Recommended migration sequence

Migration numbers must be allocated after checking the latest migration on the target integration branch; do not assume an available sequence from this review branch.

### M034-A — Project foundation tables
Create projects, spaces, design_revisions, project_members constraints, legacy_import_mappings, idempotency_records and outbox table (or reuse an existing proven outbox if present). Add same-tenant composite keys/FKs and indexes. Do not alter old migrations.

### M034-B — Client/consent repair
Add client/consent composite relationship, nullable/optional client association policy, explicit RLS and field access strategy. Backfill/repair only after profiling existing rows.

### M034-C — RLS and authorization RPCs
Create tenant/project membership helpers and secure project/space/revision operations. Replace insecure header fallback in application server. Ensure scope semantics are explicit and tested.

### M034-D — Revision commit RPC
Create atomic commit function with compare-and-swap, idempotency and audit/outbox writes. Add immutability enforcement and grants.

### M034-E — Import mapping and app adapter
Add repository adapter, project/space use cases, local import flow, cache metadata and UI sync/conflict behavior.

Each migration:
- is additive and idempotent where safe;
- is tested against clean DB and a restored representative copy;
- includes rollback/forward-recovery notes;
- never silently drops or rewrites existing local data;
- verifies constraints and row counts before adding NOT NULL/FKs;
- is applied in staging before production.

## 5. Scope boundary

### In scope
- Canonical tenant/client/project/space records.
- Verified identity and minimal project/space authorization.
- Cloud-backed project/space metadata.
- Immutable design revision snapshots.
- Atomic commit, idempotency and concurrency.
- Import mapping for existing kitchen and whole-home files.
- Local cache/draft state and cloud reopen.
- Audit/outbox.
- Tests and operational documentation.

### Out of scope
- Full MOM, survey, MEP and artifact lifecycle.
- Full offline collaborative merge.
- Client portal and external sharing.
- Full subscription billing/entitlement engine redesign.
- Full role-management UI and all resource-scope variants unless required to close a security defect.
- Production package generation and factory release.
- Conversion of all editor IDs to UUID.
- Destructive migration of existing IndexedDB data.

## 6. Go/no-go conditions

Do not enable cloud writes until:
1. Canonical project table exists and has tenant-consistent constraints.
2. Verified actor resolver replaces the header fallback.
3. Cross-tenant API and direct-RLS tests pass.
4. Revision commit is atomic and stale writes are rejected.
5. Idempotency and audit/outbox are transactional.
6. Kitchen and Home import round-trip tests pass.
7. Existing editor behavior and local file compatibility remain intact.
8. Migration dry-run succeeds against representative data.
9. No secrets or production PII are used in test fixtures.

## 7. Unresolved product/security decisions

- Can a project have multiple client contacts or multiple client entities?
- Is client mobile mandatory at creation, or can a lead/project begin with minimal identity?
- Which exact consent notice, purposes and capture evidence are required? Legal review needed.
- What is the project deletion/archival and client PII retention policy?
- Is project assignment the only scope required in Feature 034, or must team/client/specific-project scope be implemented now?
- Confirm whether authenticated users access Supabase directly or all mutations pass through server APIs.
- Confirm actual Supabase region and deployment project.
- Confirm offline drafts can be created before tenant selection.
- Confirm whether whole-home floor-plan geometry is a project-level artifact in the first release.

## 8. Product decisions confirmed after review

The product owner has confirmed the following; these are no longer open decisions for Feature 034:

1. **Client requirement: optional.** A project may be created without a client. The relational `client_id` is nullable; later association is allowed only to a client in the same organization. No mobile number, consent or client PII is required at project creation.
2. **Authorization scopes: assigned.** Feature 034 implements assigned-project scope. An explicit all-projects permission remains available for roles that are intentionally organization-wide. Team, client and specific-project scopes are out of scope and must be rejected rather than silently expanded. Missing project context denies scoped access.
3. **Offline strategy: existing.** Preserve IndexedDB local editing and add cloud synchronization. Do not introduce full offline collaborative merge. Store base revision/sync status and preserve local drafts on stale-write conflict.

### Resulting implementation order

1. Nullable client association and tenant-safe FK.
2. Verified identity and assigned-project evaluator, with explicit all-projects grant.
3. Atomic revision commit and cloud persistence.
4. IndexedDB-to-cloud synchronization and conflict handling.
5. Kitchen/Home import and end-to-end verification.

Client/consent schema repair is not a blocker for clientless project creation, but remains required before storing or exposing client consent/PII through the cloud project workflow.

**Code-change status:** no application code changed. Only Feature 034 documentation is updated.
