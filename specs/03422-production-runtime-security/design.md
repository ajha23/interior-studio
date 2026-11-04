# Feature 034.2.2 — Design

## 1. Architectural approach

Keep the existing modular monolith and persistence port. Add a deterministic composition boundary that selects and initializes one persistence adapter from validated runtime configuration and authenticated session state.

Expected high-level flow:

```text
Application bootstrap
  -> load/validate public runtime config
  -> initialize Supabase client (anon/publishable key only)
  -> initialize auth/session integration
  -> initialize persistence adapter
  -> resolve verified actor
  -> resolve active organization membership and permissions
  -> mark cloud runtime ready
  -> enable cloud project operations

Cloud operation
  -> validate runtime readiness
  -> obtain actor + organization context
  -> invoke persistence port
  -> Supabase Auth JWT + RLS / SECURITY DEFINER RPC
  -> PostgreSQL authorization + transaction
  -> return typed result
  -> update UI state only after authoritative success
```

The client MUST NOT possess service-role credentials or signing secrets. Supabase/PostgREST validates the user's JWT at the API boundary; database functions use authenticated claims and authorization tables as the final enforcement point. If a trusted server component independently verifies JWTs, its algorithm/key/issuer/audience configuration must match the actual deployed Supabase project. Do not duplicate or weaken the Supabase trust model.

## 2. Runtime composition

### 2.1 Single composition root

Identify the actual React/Vite entry point and create or extend a bootstrap/composition module. The composition root owns:
- parsing runtime mode;
- validating required environment configuration;
- creating the Supabase client;
- initializing the persistence factory;
- subscribing to auth state changes;
- resolving actor and organization membership;
- publishing a typed runtime readiness state.

Avoid creating clients/adapters in component render functions. Do not call initialization from a modal or feature component. React StrictMode must not cause duplicate side effects or adapter replacement.

### 2.2 Runtime mode policy

| Environment | Permitted mode | Behavior |
|---|---|---|
| Production deployment | Supabase only | Missing config/session integration is a readiness failure; no in-memory fallback |
| Preview/staging | Supabase by default | Explicit isolated test configuration only |
| Local development | Explicitly selected | Supabase or in-memory; in-memory requires an explicit opt-in |
| Unit tests | Explicit dependency injection | In-memory/mock adapter |
| Database integration tests | Real isolated PostgreSQL/Supabase | Apply migrations and execute actual SQL/RPC |

The mode selector must not infer that production should use in-memory when environment variables are absent. Unknown mode values are configuration errors.

### 2.3 Readiness state

Provide a typed state such as:
- `initializing`
- `ready`
- `unauthenticated`
- `organization_required`
- `membership_denied`
- `misconfigured`
- `unavailable`

Only `ready` enables cloud mutations. Re-evaluate readiness on sign-in, sign-out, token refresh, organization switch and membership/permission refresh. Clear stale actor/tenant state on sign-out or membership failure.

## 3. Identity and tenant context

### 3.1 Client-side context

The client may hold actor and organization IDs for routing and UX, but these are not security credentials. The actor comes from the authenticated Supabase session's verified user identity. Organization context comes from an active membership lookup, not a constant or untrusted persisted value.

The membership resolver should return a typed result containing at least:
- authenticated user ID;
- selected organization ID;
- membership ID/status;
- resolved permissions/role version if applicable.

Reject inactive, revoked, expired or ambiguous membership. On organization switch, clear previous tenant's project/space/revision caches before loading the new tenant.

### 3.2 Database enforcement

For direct user requests:
- use Supabase-authenticated claims (`auth.uid()`, `auth.role()`) inside database functions;
- reject actor mismatch for non-service callers;
- authorize organization and project scope using the existing `authorize` model;
- retain RLS on tables and explicit grants on RPCs;
- ensure SECURITY DEFINER functions use a fixed safe `search_path` and minimal privileges.

For service-role requests:
- service role bypasses normal RLS and therefore MUST be server-only;
- the server must authenticate and authorize the end user independently;
- derive actor and organization from trusted server context, not arbitrary client payload;
- log the delegated action and preserve actor attribution;
- restrict the service-role RPC path to the exact required operations.

A database function cannot independently infer the end-user identity from a service-role JWT when `auth.uid()` is null. Therefore the trusted server layer must own that identity mapping. Document this explicitly; do not present a caller-supplied actor parameter as self-authenticating.

## 4. JWT and Supabase compatibility

First inspect project configuration and determine the actual signing mode:
- legacy symmetric JWT secret / HS256, or
- asymmetric signing keys/JWKS (for example ES256 or RS256, as configured).

Use the supported Supabase SDK for browser session management and PostgREST calls. Do not expose signing secrets. If a server-side verifier is required, it must:
- accept only configured algorithms;
- resolve the correct key using configured key material/JWKS and `kid`;
- validate `iss`, `aud`, `exp`, `nbf`, `sub` and claim types;
- define bounded clock skew;
- refresh/cache keys safely and handle rotation;
- reject unknown key IDs and unavailable key configuration.

Required issuer and audience values must be explicit deployment configuration, not optional values silently omitted by callers. Configuration failure prevents cloud readiness. Never decode JWT payloads and treat claims as verified.

If no custom server verifier is required because the browser SDK and Supabase API boundary perform verification, remove redundant custom verification from the browser path and document the API trust boundary. The security requirement is verified authentication, not a particular custom verifier implementation.

## 5. Persistence adapter lifecycle

The persistence factory should receive a validated discriminated configuration:
- Supabase mode requires an initialized client and auth-aware request context.
- In-memory mode requires an explicit development/test opt-in.
- invalid or absent mode is an error.

The cloud store must not construct its own default adapter. Prefer explicit dependency injection from bootstrap. Store operations must check readiness before delegating. Tests should inject adapters using a test-only setup path.

A runtime transition from authenticated to unauthenticated or membership-denied must clear tenant-sensitive caches and prevent new cloud operations. It must not discard unsynced local drafts.

## 6. Idempotency design

Introduce a canonical operation-envelope hash, distinct from the snapshot hash.

Suggested logical envelope:

```json
{
  "operation": "import_kitchen",
  "canonicalizationVersion": 1,
  "orgId": "<uuid>",
  "actorId": "<uuid>",
  "projectName": "<normalized name>",
  "sourceFormat": "interior-studio/kitchen",
  "sourceFileId": "<stable source identity or null>",
  "snapshotHash": "<canonical snapshot sha256>",
  "options": {}
}
```

For revision commit, include project ID, space ID, expected revision ID, schema/format and snapshot hash. For home import, include normalized home identity and ordered normalized room envelopes/hashes. The precise fields must match the actual operation semantics.

Hash canonical JSON with stable key ordering and well-defined normalization. Persist the request hash and replay response under the same transaction and lock scope. Retain database uniqueness constraints for the idempotency tuple. Advisory locks reduce concurrent duplicate races; unique constraints remain the final integrity guard.

Do not silently change the meaning of an existing idempotency key. If a request hash changes during a retry because of normalization-version change, return a deterministic key-reuse conflict.

## 7. Database integration test architecture

Use the repository's existing Supabase local development configuration if present. Otherwise provide a documented isolated PostgreSQL harness that can apply all migrations in sequence and supports the Supabase auth functions/roles required by policies and RPCs.

Tests should use:
- isolated database/schema per suite or deterministic fixture reset;
- dedicated test users and organizations;
- real JWT/session claims or Supabase-supported test auth;
- concurrent independent database connections for race tests;
- SQL assertions against all affected tables;
- fault injection that causes a real SQL exception after partial inserts but before transaction completion.

A mocked Supabase client is still useful for adapter mapping tests, but it is not evidence for database concurrency, RLS or transaction behavior.

## 8. Failure handling

- Configuration failure: prevent cloud initialization; show actionable non-secret error.
- Unauthenticated: clear cloud identity and require sign-in.
- Membership denied: clear selected tenant and tenant-specific caches; preserve local drafts.
- Forbidden: show permission-specific failure; do not retry automatically.
- Revision conflict: retain existing conflict resolution workflow and base revision.
- Transient network/database failure: preserve idempotency key and retry only operations designed for safe replay.
- Unknown RPC response: typed failure; never optimistic success.

## 9. Compatibility and migration strategy

No schema migration should be added unless the complete-request hash or integration tests reveal a required schema constraint/index. If a migration is necessary:
- add a new forward-only migration after 00011;
- preserve existing rows and idempotency records;
- do not rewrite historical revision hashes;
- include rollback/upgrade verification;
- update the schema and migration test matrix.

Keep editor persistence and legacy project IDs intact. The feature should alter runtime wiring and test evidence, not the editor document model.
