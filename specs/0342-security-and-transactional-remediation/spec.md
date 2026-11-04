# Feature 034.2 — Security and Transactional Correctness Remediation

**Status:** Proposed specification  
**Parent:** Feature 034.1 — Cloud Persistence & Security Hardening  
**Scope:** Remediate 7 critical security, authorization, and transactional correctness vulnerabilities identified in static review before enabling production cloud persistence.  
**Non-goal:** Rebuild the CAD engine, replace IndexedDB offline draft cache, implement collaborative CRDT multi-user editing, or introduce Feature 035 Project Lifecycle stages.

---

## 1. Problem Statement

A thorough static security review of the merged Feature 034.1 implementation identified 7 high-risk gaps preventing production readiness:
1. **Critical — Actor identity is hardcoded:** `src/state/cloudProjectStore.ts` hardcodes `actorId = '00000000-0000-4000-8000-000000000002'` during project creation, archiving, revision commits, and imports, bypassing authenticated session resolution.
2. **Critical — JWT payload is decoded without cryptographic verification:** `src/server/auth/actorResolver.ts` decodes JWT payload using Base64, without verifying cryptographic signature, `iss`, `aud`, `exp`, or key rotation.
3. **Critical — SECURITY DEFINER RPC trusts caller-supplied identity:** In `00009_cloud_persistence_hardening.sql`, `commit_design_revision` accepts `p_actor_id` from the caller without verifying that it matches `auth.uid()`, allowing actor impersonation.
4. **High — Project-level authorization is missing from RPC:** `commit_design_revision` checks active organization membership, but does not enforce scoped project access (`all_projects` vs `assigned_projects`).
5. **High — Audit event is missing from the revision transaction:** The RPC atomically updates revisions, spaces, outbox, and idempotency, but omits append-only audit records.
6. **High — Imports are not atomic:** Kitchen and Home imports perform sequential mutations across multiple queries, leaving orphaned projects or spaces if a revision fails.
7. **High — Conflict reload relies on local memory cache:** `resolveConflictReloadRemote()` searches locally cached revisions rather than fetching the authoritative revision from the server via `getRevision()`.

---

## 2. Goals

1. **Dynamic Verified Actor Identity:** Cloud store and persistence actions must obtain the authenticated actor dynamically from the verified session context (`useAuthStore` / session context); remove all hardcoded actor UUIDs.
2. **Cryptographic JWT Verification:** Verify JWT signatures using Web Crypto API (`crypto.subtle.verify` HMAC-SHA256 / RS256) or Supabase session verification, checking signature, issuer (`iss`), audience (`aud`), expiration (`exp`), and active organization membership.
3. **Hardened SECURITY DEFINER RPC:** In `00010_security_and_transactional_remediation.sql`, enforce `v_caller_uid := auth.uid()` in `commit_design_revision`. Reject any request where caller identity does not match the actor (unless service-role), preventing actor spoofing.
4. **Enforce Project Scopes in RPC:** Verify `public.authorize(p_org_id, 'revisions:commit', p_project_id)` within `commit_design_revision`, enforcing `all_projects` and active `project_members` assignment for `assigned_projects`.
5. **Atomic Audit Logging:** Insert an immutable audit record in `public.audit_events` within the revision commit transaction.
6. **Atomic Database Imports:** Implement `import_kitchen_project` and `import_home_project` PostgreSQL RPCs to create project, space(s), initial revision(s), import mappings, outbox, and audit events in a single atomic database transaction.
7. **Authoritative Remote Revision Fetching:** Add `getRevision(orgId, revisionId)` to `CloudPersistencePort` and implement it across adapters. Update `resolveConflictReloadRemote()` to fetch the remote revision over the wire before replacing the local document.

---

## 3. Non-Goals

- Multi-user collaborative CRDT or operational transformation editing.
- Silent last-write-wins conflict resolution.
- Changing `KitchenProject.id`, scene entity IDs, or command pipeline invariants.
- Moving CAD geometry or domain calculations into PostgreSQL.
- Storing client PII in design snapshots or audit logs.

---

## 4. Functional Requirements

### FR-01: Dynamic Verified Session Actor
- Remove `const actorId = '00000000-0000-4000-8000-000000000002'` from `src/state/cloudProjectStore.ts`.
- Introduce `activeActorId: string | null` in the store with `setActiveActor(actorId: string | null)`.
- If an unauthenticated caller attempts a mutating cloud action (`createProject`, `createSpace`, `commitCurrentDesign`, `importKitchen`, `importHome`), fail immediately with `CloudPersistenceError.unauthenticated()`.

### FR-02: Cryptographic JWT Verification
- In `src/server/auth/actorResolver.ts`, implement `verifyJwtSignature(token, secretOrPublicKey, options)`.
- Verify HMAC-SHA256 signature using `crypto.subtle.verify`.
- Validate standard claims:
  - `exp`: current timestamp must not exceed expiration (+60s tolerance for clock skew).
  - `iss`: issuer must match configured Supabase project URL or auth service.
  - `aud`: audience must match `authenticated`.
- Reject malformed, expired, or tampered tokens with `401 UNAUTHENTICATED`.

### FR-03: Hardened Database Identity Boundary
- In migration `00010_security_and_transactional_remediation.sql`, update `public.commit_design_revision`:
  - Derive caller: `v_caller_uid := auth.uid()`.
  - If `v_caller_uid IS NULL` AND `current_user != 'service_role'`: return `{ "success": false, "reason": "UNAUTHENTICATED" }`.
  - If `v_caller_uid IS NOT NULL` AND `p_actor_id IS NOT NULL` AND `v_caller_uid != p_actor_id` AND `current_user != 'service_role'`: return `{ "success": false, "reason": "FORBIDDEN", "error": "Actor identity mismatch" }`.
  - Use `coalesce(v_caller_uid, p_actor_id)` as the authoritative actor ID for all revision, audit, and idempotency records.

### FR-04: Authorize Scoped Permissions in Revision Commit RPC
- Inside `commit_design_revision`, call:
  ```sql
  IF NOT public.authorize(p_org_id, 'revisions:commit', p_project_id) THEN
    RETURN jsonb_build_object(
      'success', false,
      'conflict', false,
      'reason', 'FORBIDDEN',
      'error', 'Actor lacks permission to commit revisions for this project'
    );
  END IF;
  ```
- Deny when project is unassigned and role is scoped to `assigned_projects`.

### FR-05: Transactional Audit Logging
- Ensure `public.audit_events` table exists:
  - Columns: `id`, `org_id`, `actor_id`, `action`, `target_type`, `target_id`, `metadata_jsonb`, `created_at`.
- Inside `commit_design_revision`, insert an audit event within the exact same transaction:
  ```sql
  INSERT INTO public.audit_events (
    org_id, actor_id, action, target_type, target_id, metadata_jsonb
  ) VALUES (
    p_org_id, v_actor_id, 'revision.committed', 'space', p_space_id,
    jsonb_build_object('project_id', p_project_id, 'revision_id', v_new_revision_id, 'canonical_hash', p_canonical_hash)
  );
  ```

### FR-06: Atomic Database Import RPCs
- Create `public.import_kitchen_project(...)` and `public.import_home_project(...)` RPCs:
  - Takes validated document payload, project metadata, canonical hash, and idempotency key.
  - Creates Project, Space(s), Revision(s), Legacy Mapping(s), Outbox Event(s), Audit Event(s), and Idempotency Record in a single database transaction.
  - On failure, all writes roll back cleanly.

### FR-07: Authoritative Remote Revision Fetch on Conflict
- Add `getRevision(params: { orgId: string; revisionId: string }): Promise<DesignRevision | null>` to `CloudPersistencePort`.
- Implement `getRevision` in `InMemoryPersistenceAdapter` and `SupabasePersistenceAdapter`.
- In `resolveConflictReloadRemote()`:
  - Fetch target Space to read `currentRevisionId`.
  - Fetch authoritative remote `DesignRevision` via `adapter.getRevision(...)`.
  - If found, load its snapshot document into `editorStore` and update the store's revisions cache.

---

## 5. Acceptance Criteria

1. **No Hardcoded Actor IDs:** Zero instances of hardcoded actor UUIDs in `src/state/` or `src/features/`.
2. **Cryptographic Verification Tested:** JWT verification passes with valid HMAC signature and rejects forged/expired/tampered tokens.
3. **RPC Identity Enforcement:** `commit_design_revision` fails when caller identity does not match `p_actor_id`.
4. **Scoped RBAC in Database:** RPC rejects commit when user is in target org but not assigned to the project under `assigned_projects` scope.
5. **Audit Invariant:** Every revision commit produces an immutable row in `audit_events`.
6. **Atomic Import:** Import failure leaves zero partial rows in `projects`, `spaces`, or `revisions`.
7. **Authoritative Conflict Reload:** Stale local memory cache is not used; remote revision document is fetched via network port.
8. **Definition of Done:** Passes `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.
