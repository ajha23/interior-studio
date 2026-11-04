# Feature 034.2.1 — Technical Design & Architecture

## 1. Overview
Feature 034.2.1 provides the final security, authorization, and transactional persistence closure for the cloud storage layer. It guarantees that:
1. JWT verification is strictly cryptographic with mandatory `exp`, array audience support, and fail-closed secret requirements.
2. Multi-tenant cloud actor resolution requires active organization membership verification.
3. `SupabasePersistenceAdapter` executes atomic database RPCs (`import_kitchen_project`, `import_home_project`) rather than sequential multi-step operations.
4. Database RPCs use `auth.role()` (not `current_user`) inside `SECURITY DEFINER` functions, enforce caller identity via `auth.uid()`, and check `public.authorize(p_org_id, 'projects:create')`.
5. Idempotency checks are concurrency-safe using transaction-scoped advisory locks or `ON CONFLICT` serialization.
6. A runtime composition root (`persistenceFactory.ts`) explicitly configures production adapters and prevents silent in-memory fallback.

---

## 2. Component Design & Changes

### 2.1 JWT Verifier & Actor Resolver (`src/server/auth/`)
```typescript
// src/server/auth/jwtVerifier.ts
export interface JwtVerificationOptions {
  secret: string;
  expectedIssuer?: string;
  expectedAudience?: string;
  clockSkewSeconds?: number;
}

// Validation rules:
// 1. Header alg MUST be HS256
// 2. crypto.subtle.verify MUST succeed
// 3. exp MUST exist and be a number; now < exp + skew
// 4. nbf (if present) MUST satisfy now >= nbf - skew
// 5. iss (if expected) MUST equal payload.iss
// 6. aud (if expected) MUST match payload.aud (string or string[])
```

In `actorResolver.ts`:
```typescript
// If secret is missing:
if (!secret) {
  throw CloudPersistenceError.unauthenticated(
    'JWT verification secret is not configured. Failing closed.'
  );
}

// In cloud mode, membership verification is mandatory:
if (!options.membershipLookup) {
  throw CloudPersistenceError.unauthenticated(
    'Active organization membership verification is mandatory for cloud operations.'
  );
}
```

### 2.2 Supabase Persistence Adapter (`src/infrastructure/persistence/`)
Replace sequential imports with direct atomic RPC calls:

```typescript
// importKitchen:
async importKitchen(params: ImportKitchenParams) {
  const doc = JSON.parse(params.fileContent);
  const snapshot: DesignSnapshot = {
    schemaVersion: 2,
    format: 'interior-studio/kitchen',
    document: doc,
  };
  const canonicalHash = computeCanonicalSha256(snapshot);
  const idempotencyKey = params.idempotencyKey || `import_kitch_${generateUUID()}`;

  const { data, error } = await this.client.rpc('import_kitchen_project', {
    p_org_id: params.orgId,
    p_actor_id: params.actorId,
    p_project_name: params.projectName || doc.name || 'Imported Kitchen Project',
    p_snapshot_jsonb: snapshot,
    p_canonical_hash: canonicalHash,
    p_idempotency_key: idempotencyKey,
    p_source_file_id: params.sourceFileId || 'kitchen_upload',
  });

  if (error || !data) {
    throw CloudPersistenceError.validationFailed('Failed to import kitchen project', error);
  }

  const res = data as Record<string, unknown>;
  if (res.success === false) {
    throw new Error(`Import failed: ${res.reason || res.error}`);
  }

  // Construct domain entities from authoritative RPC response
  ...
}
```

Similarly for `importHome`:
Transform rooms into JSON array of `{ name, type, level, x, z, snapshot, canonical_hash, id }` and invoke `this.client.rpc('import_home_project', ...)`.

### 2.3 Migration `00011_final_security_and_persistence_closure.sql`

#### A. Caller Identity & Role Resolution in `SECURITY DEFINER`
In PostgreSQL `SECURITY DEFINER` functions:
- `current_user` evaluates to the owner of the function.
- In Supabase / PostgREST, `auth.uid()` returns caller's UUID and `auth.role()` returns caller's JWT role (`authenticated`, `anon`, `service_role`).
- Therefore, bypass checks MUST use:
  ```sql
  v_caller_role := auth.role();
  v_is_service := (v_caller_role = 'service_role');
  ```
- Caller verification:
  ```sql
  v_caller_uid := auth.uid();
  IF v_caller_uid IS NULL AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'reason', 'UNAUTHENTICATED');
  END IF;
  IF v_caller_uid IS NOT NULL AND p_actor_id IS NOT NULL AND v_caller_uid != p_actor_id AND NOT v_is_service THEN
    RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Actor impersonation disallowed');
  END IF;
  v_actor_id := coalesce(v_caller_uid, p_actor_id);
  ```

#### B. Authorization in Import RPCs
```sql
SELECT public.authorize(p_org_id, 'projects:create') INTO v_authorized;
IF NOT v_authorized AND NOT v_is_service THEN
  RETURN jsonb_build_object('success', false, 'reason', 'FORBIDDEN', 'error', 'Caller lacks permission to create projects in this organization');
END IF;
```

#### C. Concurrency-Safe Idempotency
Use transaction-scoped advisory locks based on a 64-bit hash of `(p_org_id, v_actor_id, operation, p_idempotency_key)`:
```sql
-- Acquire transaction-scoped advisory lock to serialize concurrent identical requests
PERFORM pg_advisory_xact_lock(
  hashtext(p_org_id::text || ':' || v_actor_id::text),
  hashtext('commit_design_revision:' || p_idempotency_key)
);
```
Or insert with `ON CONFLICT (org_id, actor_id, operation, idempotency_key)` handling.

### 2.4 Explicit Runtime Persistence Factory (`src/infrastructure/persistence/persistenceFactory.ts`)
```typescript
export interface PersistenceConfiguration {
  mode: 'supabase' | 'in-memory';
  supabaseUrl?: string;
  supabaseAnonKey?: string;
}

export function initializePersistence(config: PersistenceConfiguration): CloudPersistencePort {
  if (config.mode === 'supabase') {
    if (!config.supabaseUrl || !config.supabaseAnonKey) {
      throw new Error('Cannot initialize cloud persistence: Supabase credentials missing');
    }
    const client = createSupabaseClient(config.supabaseUrl, config.supabaseAnonKey);
    const adapter = new SupabasePersistenceAdapter(client);
    setPersistenceAdapter(adapter);
    return adapter;
  }
  const adapter = new InMemoryPersistenceAdapter();
  setPersistenceAdapter(adapter);
  return adapter;
}
```

---

## 3. Threat Modeling & Security Posture
- **Threat**: Client sends forged actor ID in RPC argument.
  - **Mitigation**: RPC derives actor strictly from `auth.uid()` and rejects mismatches.
- **Threat**: Token without expiration used indefinitely.
  - **Mitigation**: `verifyJwtSignature` strictly requires valid numeric `exp` claim.
- **Threat**: Actor commits revision or imports project to organization without permissions.
  - **Mitigation**: `public.authorize()` validates tenant membership and scoped project permissions.
- **Threat**: Network retry causes concurrent duplicate imports.
  - **Mitigation**: Advisory transaction locking serializes requests on the exact idempotency key.
