# Feature 034.2 — Acceptance and Test Plan

## 1. Cryptographic JWT Verification Tests
- Valid HMAC-SHA256 signature resolves actor claims successfully.
- Tampered token payload with original signature fails verification and returns null.
- Modified signature with original payload fails verification.
- Expired token (`exp < now - 60s`) fails verification.
- Token before valid window (`nbf > now + 60s`) fails verification.
- Wrong audience (`aud != 'authenticated'`) fails verification.

## 2. Database RPC & Authorization Tests
- Caller `auth.uid()` matches `p_actor_id`: commit proceeds.
- Caller `auth.uid()` differs from `p_actor_id`: commit rejected with `FORBIDDEN` (identity mismatch).
- Caller is not authenticated (`auth.uid() IS NULL`) and not service_role: commit rejected with `UNAUTHENTICATED`.
- Caller has `assigned_projects` role but is not assigned to `p_project_id`: commit rejected with `FORBIDDEN`.
- Revision commit inserts row into `audit_events` with matching `org_id`, `actor_id`, `space_id`, `project_id`, and `canonical_hash`.
- `audit_events` row cannot be updated or deleted by normal users.

## 3. Dynamic Session Actor Tests
- Attempting `createProject`, `createSpace`, `commitCurrentDesign`, `importKitchen`, or `importHome` with `activeActorId = null` throws `CloudPersistenceError.unauthenticated()`.
- Setting `activeActorId` allows operations and records the correct actor in project and revision metadata.

## 4. Atomic Import RPC Tests
- Kitchen import executes atomically, creating project, space, initial revision, mapping, audit, and outbox event in one transaction.
- Failure during room processing in Home import rolls back the entire project and leaves zero orphaned spaces.
- Same idempotency key returns stored import response without duplicating records.

## 5. Authoritative Conflict Reload Tests
- When local store lacks cached revision object for remote pointer, `resolveConflictReloadRemote()` calls `adapter.getRevision(space.currentRevisionId)` over the wire.
- Remote revision document is loaded into `useEditorStore` and local store revision cache is updated.
- Conflict state is cleared.
