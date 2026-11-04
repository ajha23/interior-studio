# Feature 034.2.2 — Technical Design & Architecture

## 1. Architectural Blueprint

```
+-------------------------------------------------------------+
|                  Application Bootstrap Root                 |
|                        src/main.tsx                         |
|                             |                               |
|               calls bootstrapPersistence()                  |
|                             v                               |
|        src/infrastructure/persistence/persistenceFactory.ts |
|               /                              \              |
|   (VITE_CLOUD_PERSISTENCE=true)        (local / dev)        |
|              v                                v             |
|   SupabasePersistenceAdapter     InMemoryPersistenceAdapter |
|              \                                /             |
|               v                              v              |
|                setPersistenceAdapter(adapter)               |
|                                                             |
+-------------------------------------------------------------+
```

---

## 2. Key Technical Decisions & Contracts

### 2.1 Bootstrap Persistence (`src/infrastructure/persistence/persistenceFactory.ts`)
```typescript
export function bootstrapPersistence(): CloudPersistencePort {
  const isCloud = import.meta.env.VITE_CLOUD_PERSISTENCE === 'true';
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

  if (isCloud) {
    if (!url || !anonKey) {
      throw new Error(
        'FATAL: Cloud persistence is enabled (VITE_CLOUD_PERSISTENCE=true) but VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing. Failing closed.'
      );
    }
    // In production web client, instantiate and configure Supabase client
    return initializePersistence({
      mode: 'supabase',
      supabaseUrl: url,
      supabaseAnonKey: anonKey,
    });
  }

  // Local development / fallback
  return initializePersistence({ mode: 'in-memory' });
}
```

### 2.2 Nullable Organization Context & Strict Rejection
In `src/state/cloudProjectStore.ts`:
```typescript
export interface CloudProjectState {
  currentOrgId: string | null; // NULL by default; no hardcoded fallback
  activeActorId: string | null; // NULL by default; derived from session
  ...
}

// In mutating actions:
if (!get().currentOrgId) {
  throw CloudPersistenceError.orgMembershipRequired(
    'Organization context is required. No active organization selected.'
  );
}
if (!get().activeActorId) {
  throw CloudPersistenceError.unauthenticated(
    'Authentication required. No active actor session found.'
  );
}
```

### 2.3 Cloud Project UI Modal (`CloudProjectModal.tsx`)
- Eliminate hardcoded `defaultActorId = '00000000-0000-4000-8000-000000000002'`.
- In `handleConnectSession`, check `import.meta.env.DEV`. If in production, disable test session creation and show a link or trigger to authentic login.
- Sync `currentOrgId` and `activeActorId` directly from `useAuthorizationStore` and the authenticated session context.

### 2.4 Production JWT Configuration & Alg Verification
In `src/server/auth/jwtVerifier.ts`:
```typescript
export interface JwtAuthConfig {
  secret: string;
  expectedIssuer: string;
  expectedAudience: string;
  allowedAlgorithms?: ('HS256' | 'RS256')[];
}

export function validateJwtAuthConfig(config: Partial<JwtAuthConfig>): asserts config is JwtAuthConfig {
  if (!config.secret) throw new Error('SUPABASE_JWT_SECRET is required');
  if (!config.expectedIssuer) throw new Error('SUPABASE_JWT_ISSUER is required');
  if (!config.expectedAudience) throw new Error('SUPABASE_JWT_AUDIENCE is required');
}
```

### 2.5 Full-Request Import Idempotency Hashing
In `src/infrastructure/persistence/supabasePersistenceAdapter.ts`:
```typescript
// importKitchen:
const requestHash = computeCanonicalSha256({
  operation: 'import_kitchen',
  projectName: params.projectName || doc.name,
  sourceFileId: params.sourceFileId || 'kitchen_upload',
  snapshotHash: canonicalHash,
});

// importHome:
const requestHash = computeCanonicalSha256({
  operation: 'import_home',
  projectName: params.projectName || home.name,
  homeId: home.id,
  rooms: roomsJsonb.map((r) => ({ id: r.id, hash: r.canonical_hash })),
});
```
This guarantees that altering the project name or source file ID with the same idempotency key is rejected as `IDEMPOTENCY_KEY_REUSED` rather than incorrectly replaying the earlier project.

### 2.6 Migration `00012_runtime_integration_and_security_verification.sql`
- Updates `import_kitchen_project` and `import_home_project` to accept `p_request_hash text`.
- Validates that `v_existing_idemp.request_hash = p_request_hash`.
- Validates that non-service callers cannot set `auth.role() = 'service_role'`.

---

## 3. Database Concurrency & Service-Role Test Suite
`src/infrastructure/persistence/databaseIntegration.test.ts` executes scenarios:
1. Concurrent CAS attempts on the same space revision.
2. Full-request hash verification on import idempotency reuse.
3. Service-role bypass prevention for regular authenticated/anon callers.
4. Transaction rollback on partial insert failure.
