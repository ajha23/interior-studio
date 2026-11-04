# Feature 034.1 — Acceptance and Test Plan

## 1. Test layers

- **Unit:** pure authorization decisions, canonicalization/hash, request validation, sync state transitions and error mapping.
- **Database integration:** constraints, transactions, triggers, idempotency, CAS and rollback against real Postgres/Supabase.
- **RLS/security:** run as authenticated users with different orgs, roles and assignments; never rely only on mocked policy evaluation.
- **API integration:** verified identity, authorization, payload validation and typed responses.
- **E2E:** browser workflows with multiple sessions and IndexedDB.
- **Migration:** clean install and upgrade from the currently deployed Feature 034 schema.

## 2. Identity and authorization matrix

| Scenario | Expected |
|---|---|
| No session / expired token | 401 UNAUTHENTICATED |
| Forged x-user-id header | Ignored; verified subject remains actor |
| Forged x-org-id header | Cannot establish membership; deny |
| Inactive/revoked org membership | Deny |
| Assigned scope + active assignment + permission | Allow within that project |
| Assigned scope + no assignment | Deny |
| Assigned scope + null project ID | Deny |
| All-projects permission in active org | Allow only in that org |
| All-projects permission in another org | Deny |
| Unsupported team/client/specific scope | Reject explicitly |
| Resource ID belongs to another tenant | No data disclosure; not-found/forbidden contract |
| Role supplied by browser but absent in DB | Deny |
| User is assigned but action permission absent | Deny |

## 3. RLS and database tests

- Missing tenant context yields zero visible rows and rejects insert/update.
- Null/invalid tenant claim cannot broaden access.
- Every tenant-owned table has RLS and expected grants.
- Cross-org Project/Client, Project/Space, Space/Revision and Project/member references fail constraints.
- Project membership cannot reference a user who is not an active member of the same org.
- Space current_revision_id cannot point to another Space's revision.
- Ordinary application role cannot update/delete committed revisions or audit rows.
- Archive does not cascade-delete revisions, audit or outbox.
- SECURITY DEFINER functions cannot be hijacked via search_path and are not executable by unintended roles.
- Service role key is absent from client build artifacts.

## 4. Transaction and idempotency tests

1. Valid initial revision commit creates revision, updates Space pointer, writes audit/outbox and stores idempotency result.
2. Inject failure after revision insert: transaction leaves no revision/pointer/audit/outbox/idempotency partial state.
3. Inject failure after pointer update: entire transaction rolls back.
4. Two concurrent commits with same expected pointer: exactly one succeeds; other receives REVISION_CONFLICT.
5. Same idempotency key + same request hash: original result is replayed; exactly one revision exists.
6. Same idempotency key + different request hash: IDEMPOTENCY_KEY_REUSED.
7. Network timeout after server commit followed by retry: returns original revision, does not duplicate.
8. Same key concurrently submitted by two requests: one logical operation.
9. Client-supplied actor/org/revision number/hash tampering is ignored or rejected.
10. Revision payload/hash/parent/actor/created timestamp cannot be modified by ordinary role.

## 5. Canonical hash golden vectors

Include fixtures for:
- Different object-key order -> same hash.
- Different array order -> different hash when array order is semantically meaningful.
- Unicode names/materials and combining characters.
- Zero, negative values, integer mm dimensions, decimal edge cases and large safe integers.
- Null vs omitted/undefined fields per explicit contract.
- Volatile UI metadata excluded from hash.
- Snapshot schema/format version included in hash domain.
- Browser and server implementations produce identical vectors.

## 6. Project and Space persistence E2E

- Create Project without Client; reload and verify it exists.
- Associate a same-org Client later; reject cross-org Client.
- Create Space; reload and verify project relationship and metadata.
- Archive Project; it disappears from active listing but revision history remains.
- Open same Project from a second authenticated session and see server state.
- Unauthorized actor cannot list/get/create/archive another org's resources.

## 7. Import tests

### Kitchen
- Valid supported `.kitchen.json` creates one Project, one Space, one initial Revision and one legacy mapping.
- Legacy KitchenProject ID and scene IDs remain unchanged inside snapshot.
- Repeated same idempotency key returns same import result.
- Invalid envelope/schema, oversized payload or hash mismatch writes nothing.

### Home
- Valid `.home.json` creates one Project, N Spaces, N initial Revisions and mappings.
- Preserve Home ID, room IDs, derived room project IDs, levels, plan x/z and embedded designs.
- Failure during staged import does not expose a completed partial Project.
- Retry resumes or replays without duplicates.
- Imported room documents reopen correctly in existing editor.

## 8. Local-first sync tests

- Offline edit persists in IndexedDB and remains after browser reload.
- Base revision ID and local hash are recorded.
- Reconnect fetches latest server pointer before commit.
- If unchanged, commit succeeds and state becomes synced only after server acknowledgement.
- If remote pointer changed, local draft remains intact and state becomes conflict.
- User can reload remote without losing an exported local backup.
- User can keep local as a draft and explicitly resolve against remote.
- Retry after transient network error uses same idempotency key for identical payload.
- Changed payload uses a new key.
- Timeout after server commit followed by retry does not duplicate revision.
- No UI path displays COMMITTED/SYNCED before server acknowledgement.

## 9. Outbox and audit tests

- Revision transaction writes exactly one audit and one outbox event.
- Rollback leaves neither event.
- Worker crash after delivery may redeliver; consumer deduplicates.
- Retry/backoff and terminal failure are recorded.
- Audit entries cannot be updated/deleted by normal application roles.
- Logs contain correlation IDs but no JWT, service key, snapshot body or unnecessary PII.

## 10. Migration and release tests

- Clean database applies all migrations successfully.
- Existing Feature 034 database upgrades without destructive changes.
- Migration is safe to retry according to migration runner semantics.
- Existing data passes new constraints or is reported for explicit remediation.
- RLS policies and grants are tested after migration, not just SQL syntax.
- Backup restore preserves revisions, current pointers, idempotency and audit consistency.
- CI blocks release if any P0 security test fails.

## 11. Exit criteria

All acceptance criteria in `spec.md` pass. No open P0/P1 security or data-integrity defects. Evidence includes CI run links, migration version, RLS test report, E2E report and security review sign-off.
