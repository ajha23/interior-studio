# Feature 034.2 — Technical Design

## 1. System Architecture

```
[Browser / Client]
  └─ Zustand useCloudProjectStore
       ├─ activeActorId derived dynamically from Session
       └─ Calls CloudPersistencePort
            ├─ getRevision (Fetches authoritative remote revision)
            ├─ commitDesignRevision (CAS + Idempotency)
            ├─ importKitchen / importHome (Atomic transactional RPCs)
            ▼
[Application / Server Boundary]
  ├─ JWT Cryptographic Verification (HMAC-SHA256 Web Crypto API)
  │    ├─ Signature Validation
  │    ├─ Expiration & Skew Check
  │    └─ Issuer / Audience Matching
  └─ Database Identity Boundary (auth.uid())
       ▼
[PostgreSQL / Supabase Engine]
  ├─ commit_design_revision RPC (SECURITY DEFINER)
  │    ├─ Verify auth.uid() == p_actor_id
  │    ├─ Evaluate public.authorize(p_org_id, 'revisions:commit', p_project_id)
  │    ├─ Lock space FOR UPDATE & verify CAS pointer
  │    ├─ Insert design_revisions
  │    ├─ Advance spaces.current_revision_id
  │    ├─ Insert audit_events (Atomic Audit)
  │    ├─ Insert outbox_events
  │    └─ Ledger idempotency_records
  ├─ import_kitchen_project RPC (Single-Transaction Import)
  └─ import_home_project RPC (Single-Transaction Multi-Room Import)
```

---

## 2. Cryptographic JWT Verification Engine

In `src/server/auth/jwtVerifier.ts`:
- Token Format: `<header>.<payload>.<signature>` (Base64URL).
- Uses `crypto.subtle.importKey('raw', secretBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['verify'])`.
- Verifies signature against `crypto.subtle.verify(...)`.
- Checks claims:
  - `exp`: `Math.floor(Date.now() / 1000) <= exp + clockSkewSeconds`.
  - `nbf`: `Math.floor(Date.now() / 1000) >= nbf - clockSkewSeconds`.
  - `iss`: matches expected issuer when provided.
  - `aud`: matches expected audience when provided.

---

## 3. Database Remediation (`00010_security_and_transactional_remediation.sql`)

### 3.1 Audit Events Schema
```sql
CREATE TABLE IF NOT EXISTS public.audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  metadata_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Append-only trigger: disallow UPDATE or DELETE on audit_events
CREATE OR REPLACE FUNCTION public.prevent_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Audit events are immutable and cannot be updated or deleted.';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_audit_mutation ON public.audit_events;
CREATE TRIGGER trg_prevent_audit_mutation
  BEFORE UPDATE OR DELETE ON public.audit_events
  FOR EACH ROW EXECUTE FUNCTION public.prevent_audit_mutation();
```

### 3.2 Hardened `commit_design_revision` RPC
- Enforces caller UID:
  ```sql
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL AND current_user != 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'UNAUTHENTICATED');
  END IF;
  IF v_caller_uid IS NOT NULL AND p_actor_id IS NOT NULL AND v_caller_uid != p_actor_id AND current_user != 'service_role' THEN
    RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Actor identity mismatch');
  END IF;
  v_actor_id := coalesce(v_caller_uid, p_actor_id);
  ```
- Evaluates scoped authorization:
  ```sql
  IF NOT public.authorize(p_org_id, 'revisions:commit', p_project_id) THEN
    RETURN jsonb_build_object('success', false, 'conflict', false, 'reason', 'FORBIDDEN');
  END IF;
  ```
- Atomically logs audit event:
  ```sql
  INSERT INTO public.audit_events (org_id, actor_id, action, target_type, target_id, metadata_jsonb)
  VALUES (p_org_id, v_actor_id, 'revision.committed', 'space', p_space_id, jsonb_build_object('project_id', p_project_id, 'revision_id', v_new_revision_id, 'canonical_hash', p_canonical_hash));
  ```

### 3.3 Atomic Import RPCs
- `import_kitchen_project`:
  - Inserts project into `projects`.
  - Inserts space into `spaces`.
  - Inserts revision into `design_revisions`.
  - Updates `spaces.current_revision_id`.
  - Inserts mapping into `legacy_import_mappings`.
  - Inserts outbox into `outbox_events`.
  - Inserts audit into `audit_events`.
  - Ledgers idempotency into `idempotency_records`.
  - All wrapped in a single database transaction.
- `import_home_project`:
  - Iterates over room array in a single transaction, creating Project, Spaces, Revisions, Mappings, and Audit records atomically.

---

## 4. Authoritative Remote Revision Fetching

Add `getRevision` to `CloudPersistencePort`:
```ts
export interface GetRevisionParams {
  orgId: string;
  revisionId: string;
}

export interface CloudPersistencePort {
  ...
  getRevision(params: GetRevisionParams): Promise<DesignRevision | null>;
}
```

In `resolveConflictReloadRemote()`:
```ts
const space = await activePersistenceAdapter.getSpace({ orgId: currentOrgId, spaceId: activeSpaceId });
if (!space?.currentRevisionId) return;

const remoteRev = await activePersistenceAdapter.getRevision({
  orgId: currentOrgId,
  revisionId: space.currentRevisionId,
});

if (remoteRev?.snapshot.document) {
  useEditorStore.getState().openProject(remoteRev.snapshot.document);
  set({
    revisions: {
      ...revisions,
      [activeSpaceId]: [...(revisions[activeSpaceId] || []).filter(r => r.id !== remoteRev.id), remoteRev],
    },
    syncState: {
      localProjectId: remoteRev.snapshot.document.id,
      cloudProjectId: space.projectId,
      spaceId: space.id,
      baseRevisionId: remoteRev.id,
      syncStatus: 'synced',
      lastSyncedAt: remoteRev.createdAt,
      serverHash: remoteRev.canonicalHash,
      clientHash: remoteRev.canonicalHash,
    },
  });
}
```
