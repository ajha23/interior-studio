# Feature 034.1 — Technical Design

## 1. Architecture

Use a modular-monolith application boundary:

```
React UI
  -> Zustand UI state/actions
    -> Application use cases (framework-independent ports)
      -> Authorization context + validation
      -> Persistence port
        -> Supabase/Postgres adapter (user JWT/RPC or trusted API)
          -> RLS + constraints + transactional functions
      -> IndexedDB draft/cache adapter
```

The editor domain remains independent. Domain functions validate snapshots, canonicalize/hash data and calculate deterministic outcomes. The database adapter persists them. UI state changes to `synced` only after a server response confirms commit.

## 2. Recommended module boundaries

Adapt names to repository structure; do not create parallel abstractions if equivalents exist.

- `domain/project`: entities, invariants, snapshot schema, canonical hash, pure CAS decision.
- `application/projects`: create/list/archive project and create/list space use cases.
- `application/revisions`: commit revision, fetch latest pointer, resolve conflict.
- `application/import`: validate and persist legacy Kitchen/Home import.
- `infrastructure/supabase`: generated DB types, repositories, RPC clients.
- `infrastructure/indexeddb`: local draft/cache persistence.
- `state/cloudProjectStore`: UI orchestration only; no direct SQL or false local cloud success.
- `server/auth`: verified session, active org membership and authorization context.

## 3. Authentication and authorization sequence

1. Verify Supabase access token/session cryptographically through supported Supabase server/client integration.
2. Resolve actor ID from verified subject.
3. Resolve active org from a trusted membership selection/claim, then verify active membership in DB. Treat an org ID supplied by the browser only as a requested context, never proof of membership.
4. Evaluate action permission and supported scope.
5. Execute query/RPC under the user identity so RLS remains effective, or through a narrowly scoped server API that revalidates the actor. Service-role credentials stay server-side.
6. Audit denied high-risk operations without leaking cross-tenant resource existence.

RLS must be a second enforcement layer, not the only place where business action semantics live.

## 4. RLS and schema design guidance

- Enable RLS on every tenant-owned table.
- Prefer `USING (org_id = auth_org_id())` and `WITH CHECK (org_id = auth_org_id())` where `auth_org_id()` returns NULL for absent/invalid context; SQL NULL comparison then denies. Never coalesce missing context to the row's own org.
- Ensure helper functions are stable, safe, correctly owned and have a fixed safe search_path if SECURITY DEFINER.
- Separate SELECT, INSERT, UPDATE and DELETE policies. Avoid broad FOR ALL policies unless every operation has identical semantics.
- Ordinary clients should not have DELETE on immutable revisions or audit rows.
- For assigned-project scope, require active org membership AND EXISTS active project_members for the same project/org/user. For all-projects, require explicit permission in active org. Reject unsupported scopes.
- Composite FKs/unique keys enforce same-org relationships even if application code is bypassed.
- Review whether FORCE ROW LEVEL SECURITY is appropriate for table owners and ensure service-role/bypass behavior is deliberate and documented.

## 5. Transactional revision commit

Expose one RPC/use case as the only write path for revision commits.

Pseudo-transaction:

```sql
BEGIN;
-- derive actor from verified auth context; resolve active org membership
-- validate project/space authorization and snapshot metadata
-- compute/verify canonical request hash
-- acquire idempotency key (unique scoped key; handle concurrent insert)
-- if existing key:
--   same request hash => return stored response
--   different request hash => raise IDEMPOTENCY_KEY_REUSED
-- lock target space row FOR UPDATE
-- compare current_revision_id with expected_revision_id
-- on mismatch => return REVISION_CONFLICT (no writes)
-- calculate next revision number
-- insert design_revisions (immutable payload/hash/parent/actor)
-- update spaces.current_revision_id and revision counter
-- insert audit event
-- insert outbox event
-- store idempotency response
COMMIT;
```

Prefer SQLSTATE/application error codes mapped to typed API errors. A conflict should be a normal typed outcome, not a generic 500. Unique constraints remain the final concurrency defense. Avoid trusting client-computed revision number, actor, org or current pointer.

## 6. Canonical hash contract

- Keep a single documented canonicalization version.
- Define object-key ordering, array ordering semantics, number serialization, treatment of undefined/null, Unicode normalization policy and excluded volatile fields.
- Encode canonical JSON as UTF-8 and SHA-256.
- Hash the exact immutable snapshot content and relevant format/schema metadata.
- Do not include client PII or transient UI state.
- Add golden vectors for ASCII, Unicode, nested objects, numeric edge cases, arrays and key-order permutations.
- If server and browser implementations differ, server hash is authoritative and mismatch rejects commit with a diagnosable validation error.

## 7. Idempotency and outbox

Idempotency table unique key: `(org_id, actor_id, operation, idempotency_key)`. Store request hash and response envelope. Concurrent requests must not both execute the operation.

Outbox is transactionally written with revision commit. Worker claims rows safely (e.g. SKIP LOCKED), delivers at least once, retries with backoff, and records terminal failure. Consumer event ID is stable; consumers deduplicate. Do not make external side effects part of the DB transaction.

## 8. Import design

Validate complete input before writing. Kitchen import creates project + space + first revision + legacy mapping in one transaction. Home import creates project + N spaces + N initial revisions + N mappings in one transaction where feasible. If payload size/transaction duration requires batches, stage records under an import ID and mark import/project visible as complete only after finalization. Retries must reuse the same idempotency key and not duplicate entities.

Preserve the legacy Home/room IDs and derived identifiers exactly as Feature 034 specifies. Do not use those IDs as SaaS UUIDs.

## 9. Local-first sync state machine

States: `local_only`, `pending_upload`, `syncing`, `synced`, `conflict`, `retryable_error`, `validation_error`.

- Local edit: persist draft + baseRevisionId + local hash; state pending_upload.
- Commit: fetch/confirm server pointer; submit expected pointer and idempotency key.
- Server success: update baseRevisionId/hash and state synced.
- CAS conflict: preserve local draft, fetch remote revision metadata, state conflict.
- Network failure: preserve local draft and key; state retryable_error.
- Retry: same idempotency key for same immutable request; changed request gets a new key.
- Explicit conflict resolution produces a new request based on the chosen remote revision; never overwrite silently.

## 10. Observability and operations

Metrics: commit success/failure/conflict, idempotency replay/mismatch, auth denial by reason, import duration/outcome, outbox oldest age/retry count, sync retry rate. Logs include correlation ID and opaque resource IDs only. Alert on sustained outbox backlog, elevated auth failures, migration drift and revision commit failures.

## 11. Failure and recovery

- Transaction rollback guarantees no partial revision/audit/outbox/pointer update.
- Network timeout after commit is recovered by idempotency replay.
- Worker outage does not roll back committed revision; outbox catches up later.
- Migration failure: stop rollout, inspect transaction state, use forward repair; do not edit already-applied migration.
- Backup restore: verify FK integrity, revision hashes and current pointers; document recovery point/time objectives before production.
