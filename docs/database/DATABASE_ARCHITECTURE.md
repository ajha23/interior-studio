# Interior Studio — Database Architecture

- Status: Proposed baseline; not a migration script
- Target transactional store: PostgreSQL via Supabase
- Object storage: Supabase Storage or approved S3-compatible provider
- Region: `ap-south-1` is stated in the supplied PRD prompt; confirm actual deployed project region [V]

## 1. Principles

1. PostgreSQL is the authoritative store for committed project and lifecycle state.
2. Tenant ownership is explicit on tenant-owned records.
3. Client PII is separated from general design/production data.
4. Design revisions and production packages are immutable snapshots.
5. Large binary assets are stored outside PostgreSQL; metadata and checksums remain relational.
6. JSONB is used for versioned snapshots and flexible payloads, not as an excuse to remove all relational constraints.
7. Every cross-tenant relationship is validated by database constraints and authorization.
8. Migrations are additive, reviewed, testable and forward-compatible.
9. RLS is defense in depth; server-side authorization remains mandatory.
10. IndexedDB is a cache/offline draft store, not the cloud source of truth.

## 2. Logical model

### 2.1 Organization and access

- `organizations(id, name, slug, status, created_at, updated_at)`
- `org_members(id, org_id, user_id, role_id, status, created_at)`
- `roles(id, org_id nullable, name, rank, is_system_role, status)`
- `permissions(id, module_id, action, description)`
- `role_permissions(role_id, permission_id, scope_type, scope_config)`
- `project_members(project_id, user_id, team_id, assignment_role)`

Use composite uniqueness/foreign-key patterns where needed to prove that a referenced project, client or member belongs to the same organization.

### 2.2 Clients and privacy

- `clients(id, org_id, name, contact data, consent reference, created_at)`
- `consents(id, org_id, client_id, notice_version, purpose, captured_at, withdrawn_at, evidence)`
- `client_access_events` or equivalent audit event for sensitive PII access/export.

Avoid duplicating mobile, email and full site address into project snapshots or production packages unless a documented business need requires it.

Masking is a presentation policy, not a replacement for base-table RLS. Direct table access, views, exports, RPCs and storage downloads all require authorization tests.

### 2.3 Project and spaces

- `projects(id, org_id, client_id, name, status, current_revision_id, created_by, timestamps)`
- `project_members(project_id, user_id, team_id, assignment_role)`
- `spaces(id, org_id, project_id, name, space_type, level, geometry_summary, status)`

A project can contain multiple spaces. Whole-home layouts may be a project-level floor-plan artifact and/or a typed aggregate of spaces. Do not make the existing `HomeRoom.design` embedding the only long-term project representation.

### 2.4 Survey and evidence

- `site_surveys(id, org_id, project_id, space_id, version, status, captured_by, captured_at, verified_by, verified_at)`
- `survey_observations(id, org_id, survey_id, observation_type, wall_id, value_json, unit, coordinate_json, source_type, uncertainty_json, verification_status)`
- `evidence_assets(id, org_id, project_id, survey_id, storage_key, mime_type, checksum_sha256, captured_by, captured_at, metadata_json)`

Preserve raw measurements and original evidence. A correction creates a new observation/version or superseding record; it must not silently overwrite the original evidence.

### 2.5 MOM and requirements

- `meeting_records(id, org_id, project_id, version, meeting_at, attendees_json, source_asset_ids, status, created_by)`
- `requirements(id, org_id, project_id, space_id nullable, category, description, value_json, scope_owner, priority, source_meeting_id, source_evidence_id, confirmation_status, confirmed_by, confirmed_at)`
- `meeting_actions(id, org_id, meeting_id, description, owner_user_id, due_at, status)`

AI-extracted requirements begin as proposed/unconfirmed. Human confirmation is recorded with actor and timestamp.

### 2.6 Design revisions

- `design_revisions(id, org_id, project_id, space_id, parent_revision_id, schema_version, snapshot_jsonb, canonical_hash, created_by, created_at, status)`

Use immutable revision rows. Current revision pointer is mutable on the project/space aggregate, but the revision snapshot itself is not.

Keep stable domain object IDs across revisions when an element is edited in place.

### 2.7 Artifacts and dependencies

- `artifacts(id, org_id, project_id, space_id, artifact_type, source_revision_id, status, storage_key, checksum, generator_version, config_snapshot, created_by, created_at)`
- `artifact_dependencies(artifact_id, dependency_type, dependency_id, dependency_version, dependency_hash)`

Examples of dependencies:
- survey revision;
- MOM/requirements revision;
- design revision;
- MEP revision;
- catalog snapshot;
- rate-card version;
- rule-pack version;
- generator version.

Freshness is derived from dependency comparison, not just from a single project status.

### 2.8 Approval

- `approvals(id, org_id, project_id, space_id, approval_type, source_revision_id, artifact_manifest_jsonb, actor_id, decision, note, decided_at)`

An approval must identify the exact revision and artifact manifest. Never silently retarget an approval to a newer revision.

### 2.9 Commercial

- `rate_cards(id, org_id nullable, version, effective_from, effective_to, payload_jsonb, status, approved_by)`
- `quotes(id, org_id, project_id, source_revision_id, rate_card_id, rate_card_version, tax_config_version, quote_snapshot_jsonb, canonical_hash, status, accepted_by, accepted_at)`

A quote stores the rates, quantities, tax treatment and terms used at generation time. Changing a rate card must not mutate an existing quote.

Money is represented in integer paise or another explicit fixed-point currency contract. Tax classifications and rates require qualified review [V].

### 2.10 Rule packs and production

- `rule_packs(id, version, status, payload_jsonb, checksum, submitted_by, reviewed_by, factory_approved_by, approved_at)`
- `production_packages(id, org_id, project_id, space_id, source_revision_id, rule_pack_id, rule_pack_version, catalog_version, generator_version, canonical_hash, payload_jsonb, generated_by, created_at)`
- `work_orders(id, org_id, production_package_id, status, released_by, released_at)`
- `installation_records(id, org_id, work_order_id, status, evidence_manifest, signed_off_by, signed_off_at)`

The production package is an immutable snapshot. It records exact parts, hardware, edge-band summary, validation, source revisions, rule/catalog/generator versions and export profile version.

## 3. JSONB versus normalized records

Use relational tables for:
- tenant and access boundaries;
- entities queried independently;
- assignment and membership;
- approval state;
- subscription and quota counters;
- artifact references and status;
- audit indexing.

Use JSONB for:
- canonical design snapshot;
- structured survey observation details;
- flexible requirement value;
- immutable production package payload;
- generator configuration snapshot;
- artifact manifest.

Use object storage for:
- photographs and video;
- high-resolution renders;
- PDFs, DXFs, SVG exports and source files.

Do not create independently mutable part rows merely because a production package contains many parts. Add a query projection/table only when operational searches, inventory, barcode scanning or factory reporting require it. If such a projection is added, it must remain traceable to the immutable package.

## 4. Tenant isolation and RLS

Every tenant-owned table must have:
- explicit `org_id` or an enforceable parent relationship;
- RLS enabled;
- SELECT/INSERT/UPDATE/DELETE policies appropriate to the resource;
- tenant-consistent foreign keys;
- indexes supporting policy predicates;
- negative cross-tenant tests.

RLS policy design must not rely on a caller-controlled `app.current_org_id` setting unless the trusted server/database path establishes it and prevents arbitrary caller override.

For SECURITY DEFINER functions:
- pin `search_path`;
- revoke PUBLIC execute;
- grant only to required roles;
- validate `auth.uid()` and organization membership inside the function;
- use fully qualified table/function names;
- test direct RPC invocation.

Production package insert policies need explicit `WITH CHECK`, not only read visibility.

## 5. Audit log

Audit events should capture:
- organization;
- actor;
- event family/action;
- resource type/id;
- timestamp;
- correlation/request ID;
- relevant before/after summary or immutable references;
- source revision/package ID where relevant.

Protect ordinary application paths against UPDATE, DELETE and TRUNCATE. Revoke mutation privileges from application roles. Define backup, retention, legal hold and organization-deletion behavior. A database owner/superuser remains a privileged trust boundary; do not claim absolute immutability against that actor.

Avoid logging raw PII, tokens, secrets or full documents in event metadata.

## 6. Quota transaction

Quota reservation must be a database transaction, not an in-memory mutex:

1. Authenticate actor and tenant.
2. Evaluate subscription entitlement and RBAC/resource scope.
3. Lock the applicable quota row with `SELECT ... FOR UPDATE`.
4. Check `consumed + reserved + requested <= limit`.
5. Insert reservation with unique idempotency key.
6. Increment reserved amount.
7. Commit.
8. On success, move reserved to consumed.
9. On failure/cancel/expiry, release reserved amount.

Handle duplicate requests and worker retries idempotently.

## 7. Indexing and retention

Initial indexes should cover:
- `(org_id, project_id)` for tenant/project-owned records;
- `(project_id, created_at)` for activity and revisions;
- `(space_id, created_at)` for design revisions;
- `(source_revision_id, artifact_type)` for artifact lookup;
- `(org_id, actor_id, created_at)` for audit;
- quota unique key `(org_id, quota_key, period_anchor)`;
- package `(org_id, project_id, canonical_hash)`.

Add GIN indexes on JSONB only for demonstrated query patterns. Define partitioning for high-volume audit/usage data only after expected volume and retention requirements are agreed.

## 8. Migration strategy

- Preserve existing local JSON file envelope and migrations for import/export compatibility.
- Introduce server tables additively.
- Build import/reconciliation tooling before retiring local-only persistence.
- Backfill only with explicit user/tenant ownership mapping.
- Never merge projects into a tenant based on unverified browser data.
- Keep a rollback/restore plan for every migration.
- Test migrations against a clean database and a copy of representative existing data.
- Do not modify previously applied migrations; add new migrations.

## 9. Open decisions [V]

- Confirm actual Supabase region and data residency obligations.
- Decide UUID mapping for existing string project IDs.
- Define PII retention/deletion and consent withdrawal behavior.
- Define audit retention and legal hold.
- Decide whether package part query projections are needed for the first factory pilot.
- Confirm expected tenant/project/asset volumes before partitioning.
