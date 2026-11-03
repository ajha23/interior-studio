# 034 — Project Foundation and Cloud Persistence: Design

**Status:** Proposed design; requires review before implementation.

## 1. Design principles

- Preserve the current editor and command engine.
- Introduce the project lifecycle outside the scene model.
- PostgreSQL owns committed project metadata and revisions.
- Design revision snapshots are immutable.
- Verified actor and tenant context are established server-side.
- Local persistence remains a cache/draft/import-export capability.
- Use a modular monolith; do not introduce microservices for this feature.

## 2. Component responsibilities

### Web application
- Project/client/space forms and workspace navigation.
- Existing design editor hosted for a selected space.
- Local draft/cache UX.
- Displays server authorization and revision conflicts.
- Does not make approval or tenant authorization decisions.

### Application use cases
- Create client.
- Create project.
- Add space.
- List/open project and space.
- Commit design revision.
- Import existing local project.
- Resolve draft conflict.

### Core domain
- Project and space schemas.
- Revision metadata.
- Stable identity and lifecycle invariants.
- Existing scene schema and command execution.

### Platform
- Verified actor context.
- Organization membership.
- RBAC/resource scope.
- Audit event creation.
- RLS and trusted database access.

### Persistence adapter
- PostgreSQL repositories.
- Transaction boundaries.
- Optimistic concurrency.
- Idempotency record.
- Transactional outbox.

## 3. Transactional design revision commit

Input:
- authenticated actor from verified session;
- organization and project selectors;
- space ID;
- expected current revision ID;
- canonical scene snapshot or validated command batch;
- idempotency key.

Transaction:
1. Resolve actor and active organization membership.
2. Load project and space under tenant scope.
3. Evaluate project/space permission and resource scope.
4. Check idempotency key.
5. Lock or compare-and-swap current revision pointer.
6. Verify expected revision matches.
7. Validate snapshot against current scene schema and domain invariants.
8. Calculate canonical content hash.
9. Insert immutable revision row.
10. Update space current revision pointer.
11. Insert audit/outbox event.
12. Commit.

If expected revision does not match, return a conflict containing the current revision identifier. Do not silently overwrite.

## 4. Local cache transition

- Existing IndexedDB project files remain importable.
- A local project is not automatically trusted as belonging to a tenant.
- On import, an authorized user selects/creates the target project and space.
- The server validates the imported snapshot.
- A cloud revision is created with import provenance.
- Subsequent edits use expected-revision commits.
- Offline edits are explicit drafts based on a known server revision.
- Conflict resolution must compare domain changes; no silent last-write-wins.

## 5. Data consistency

Use transactionally consistent writes for:
- project and client association;
- project/space creation;
- revision insert and current pointer update;
- idempotency record;
- audit/outbox record.

Use database constraints for same-tenant references. Do not rely only on frontend validation.

## 6. Compatibility

- Retain existing `KitchenProjectSchema` and serialization envelope during the first migration.
- Map a Kitchen space to the existing scene type.
- Keep existing stable element IDs and command behavior.
- Add a persistence adapter rather than importing Supabase clients into domain or engine packages.
- Keep the old IndexedDB adapter available for local cache and migration.

## 7. Security design

- Do not use caller-controlled `x-user-id`, `x-org-id` or `x-user-roles` as identity proof.
- Verify Supabase JWT/session in a trusted server context.
- RLS policies validate organization membership and row ownership.
- Server use cases validate permission and project scope.
- Client IDs/project IDs are selectors only.
- Object storage keys are generated/scoped server-side; direct object URLs are not authorization.
- Sensitive actions generate audit records.

## 8. Failure handling

- Stale revision: conflict response; retain local draft.
- Duplicate idempotency key: return original result.
- Validation failure: no revision inserted.
- Authorization failure: no data mutation.
- Storage failure: transaction rolls back or outbox/retry policy applies.
- Audit/outbox failure: mutation must not commit if the audit is mandatory.
- Network loss: preserve explicit local draft and show sync state.

## 9. Test seams

Inject:
- clock;
- ID generator;
- repository interfaces;
- actor resolver;
- transaction boundary;
- hash/canonicalizer.

Use deterministic test fixtures for revisions and idempotency.
