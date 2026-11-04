# Feature 034.2.2 — Production Runtime Integration & Database Security Verification

**Status:** Proposed / ready for implementation  
**Target branch:** `integration` (implementation PR target)  
**Specification branch:** `spec/03422-production-runtime-security`  
**Depends on:** Feature 034, 034.1, 034.2 and 034.2.1  
**Scope:** Runtime composition, verified identity/tenant context, JWT deployment configuration, database integration verification and idempotency correctness.

## 1. Problem statement

Feature 034.2.1 improves JWT verification, actor resolution, database RPC authorization and transactional imports. Static review of the merged `integration` branch nevertheless found that the runtime can still default to an in-memory adapter, the cloud modal exposes a hardcoded demo actor, and the store retains a default organization ID. The existence of a persistence factory does not prove that the running application uses it.

The current automated concurrency/RBAC tests exercise the in-memory adapter and do not establish that PostgreSQL advisory locks, transaction rollback, grants, RLS and SECURITY DEFINER functions behave correctly against a real database.

Feature 034.2.2 closes these integration and verification gaps. It is a hardening feature, not a redesign of the project/revision domain model.

## 2. Goals

1. Make persistence mode an explicit, validated application-startup decision.
2. Ensure production/cloud mode cannot silently fall back to in-memory persistence.
3. Remove demo identity and hardcoded tenant defaults from production workflows.
4. Establish actor and organization context only from a verified authenticated session and active organization membership.
5. Enforce the deployed Supabase JWT issuer, audience, expiry, not-before and signing-algorithm requirements.
6. Prove database authorization, atomicity, concurrency and idempotency using a real PostgreSQL/Supabase test environment.
7. Ensure idempotency request hashes cover the complete normalized semantic operation.
8. Document the trusted server-side service-role boundary and prove it cannot be reached from browser code.

## 3. Non-goals

- Replacing Supabase/PostgreSQL or changing the modular-monolith architecture.
- Replacing the existing editor, legacy document formats, IDs or IndexedDB draft workflow.
- Introducing microservices, distributed collaboration or last-write-wins synchronization.
- Reworking all project, space and revision CRUD operations beyond what is necessary to establish safe runtime wiring and test the authorization boundary.
- Changing subscription plans, billing or the full RBAC product model.
- Treating in-memory tests as substitutes for database integration tests.
- Claiming production readiness solely because lint, typecheck, unit tests or build pass.

## 4. Current repository findings to address

The reviewed `integration` source contained these concrete conditions:

- `src/state/cloudProjectStore.ts` initialized `activePersistenceAdapter` to `new InMemoryPersistenceAdapter()`.
- The same store retained a constant `DEFAULT_ORG_ID`.
- `src/features/projects/CloudProjectModal.tsx` included `handleConnectSession`, which installed a hardcoded actor UUID and a demo authorization role.
- `src/infrastructure/persistence/persistenceFactory.ts` and its tests existed, but the reviewed runtime path did not establish that the factory was invoked by the application composition root.
- The JWT verifier supported HS256; deployment compatibility and mandatory validation of expected issuer/audience/algorithm needed to be demonstrated against the actual Supabase configuration.
- The concurrency/RBAC test referenced the in-memory adapter; a real database test suite was still required.
- Import idempotency used the supplied canonical snapshot hash, which did not necessarily include all semantic import parameters.

These are implementation starting points, not permission to assume the current code is unchanged. The implementation agent MUST inspect the current `integration` HEAD and reconcile this specification with any intervening changes before editing.

## 5. Functional requirements

### FR-01 — Explicit persistence runtime mode

The application MUST have one explicit runtime composition point that initializes persistence before cloud project operations can execute.

Supported modes:
- `supabase`: production/cloud persistence using a configured Supabase client and verified session.
- `in-memory`: explicitly selected local-development/test mode only.

Requirements:
- Production builds/deployments MUST NOT default to `in-memory`.
- Missing/invalid Supabase URL, anon key, auth session integration or required verification configuration MUST fail closed for cloud mode.
- The UI MUST NOT report a cloud operation as successful when the active adapter is in-memory.
- Adapter initialization MUST happen once in a deterministic startup lifecycle; repeated React renders MUST NOT replace/reset it.
- The runtime MUST expose a typed readiness state so cloud UI can distinguish initializing, ready, unauthenticated, misconfigured and unavailable.
- Tests MAY inject an in-memory adapter explicitly.

### FR-02 — Remove demo authentication from production

- Remove the hardcoded demo actor/session action from production UI paths.
- No production UI handler may manufacture an actor UUID, role, permission or organization membership.
- Authentication MUST be obtained from the configured Supabase Auth session (or the project's existing trusted auth integration).
- A user without a verified session MUST be unauthenticated; do not substitute a sample identity.
- If demo fixtures are needed, they MUST be confined to tests/storybook/development-only fixtures and guarded by build/runtime mode.

### FR-03 — Verified actor context

- The actor ID MUST be derived from the verified authenticated session.
- Client-provided actor IDs are context hints only and MUST NOT establish identity or authorization.
- The database remains the final authorization boundary and MUST derive/validate the caller identity using Supabase-authenticated claims for direct user requests.
- Membership lookup MUST be mandatory for cloud operations.
- Membership MUST be active and belong to the selected organization.
- A user switching organization MUST trigger a fresh membership/permission resolution before subsequent operations.
- Missing, expired, disabled or ambiguous membership MUST fail closed.
- No default actor or privileged role is permitted.

### FR-04 — Verified organization context

- Remove the default organization UUID from production state initialization.
- Organization context MUST be null/unresolved until selected or established from verified membership.
- All cloud operations MUST reject missing organization context before issuing database calls.
- The selected organization MUST be one for which the authenticated actor has active membership.
- Do not trust local storage, URL parameters, request body fields or Zustand state alone as proof of membership.
- Existing tenant-scoped database constraints and RLS policies remain mandatory.

### FR-05 — JWT validation matches deployment

The implementation MUST inspect the actual Supabase project signing configuration and choose a verifier compatible with it. Do not assume HS256 is the deployed algorithm.

For the configured accepted algorithm(s), verification MUST:
- use a cryptographic signature verification path and an explicit algorithm allow-list;
- reject `none`, unexpected algorithms, malformed tokens and unsupported key types;
- validate required `exp` and `nbf` semantics, with a documented bounded clock-skew allowance;
- validate exact expected issuer and audience (including documented array handling);
- validate subject and required claim types;
- handle key rotation using the supported Supabase/JWKS/key configuration, including `kid` where applicable;
- fail startup or cloud readiness when required verification configuration cannot be loaded;
- never fall back to base64 decoding or unverified claim parsing.

Secrets MUST remain server-side. A Supabase anon key is not a JWT signing secret. Never ship a JWT secret, service-role key or private signing key to the browser.

If browser code relies on Supabase Auth's session handling and PostgREST verifies JWTs, do not add a redundant client-side signing secret. Keep cryptographic verification in the trusted server/database boundary and validate the session through the supported SDK. Document the actual trust boundary.

### FR-06 — Idempotency request identity

For each transactional operation, compute a deterministic request hash from the complete normalized semantic request, not just the design snapshot.

At minimum include:
- operation name and canonicalization/schema version;
- organization ID and actor identity scope (where applicable);
- project/space identifiers and expected revision for revision commits;
- complete normalized snapshot or room payload;
- import project name and source format;
- source file/entity identity when it affects import semantics;
- import options and metadata that change the result.

Rules:
- Normalize before hashing; key ordering and equivalent representations MUST be deterministic.
- Persist the request hash and response in the same transaction as the mutation.
- Same idempotency scope + same request hash MUST replay the original result without duplicate writes.
- Same idempotency scope + different request hash MUST return a stable conflict/error and MUST NOT mutate data.
- Idempotency scope MUST be documented and protected by database uniqueness constraints and transaction-level serialization.
- Do not include volatile values (timestamps generated during execution, random IDs generated after request acceptance) in the request hash.

### FR-07 — PostgreSQL integration verification

Create a repeatable integration-test suite against a real PostgreSQL instance using the repository's Supabase migrations and supported local Supabase setup.

It MUST apply migrations from a clean database in order and exercise:
- authenticated user success and unauthenticated denial;
- active and inactive membership;
- cross-organization access denial;
- project-level permission success and denial;
- direct table access under RLS;
- RPC execution grants and denial for unauthorized roles;
- revision compare-and-swap conflict;
- concurrent duplicate idempotency requests;
- same key with different semantic request;
- atomic kitchen import;
- atomic home import with multiple rooms;
- rollback when a deliberately injected mid-transaction failure occurs;
- audit and outbox rows written exactly once with successful transactions;
- absence of partial project/space/revision/mapping/idempotency/audit/outbox records after rollback.

Tests MUST use isolated fixtures and clean up deterministically. Do not point automated destructive tests at production.

### FR-08 — Service-role boundary

- Service-role credentials MUST be server-only and absent from browser bundles, source maps, client-visible environment variables, logs and test snapshots.
- Browser code MUST use the anon/publishable key and the authenticated user's session.
- Any trusted server endpoint using service role MUST authenticate the caller independently, resolve actor and organization from trusted context, authorize the requested operation, validate inputs and write an audit event.
- RPC service-role bypass behavior MUST be narrowly scoped and explicitly tested.
- Never accept arbitrary `p_actor_id` as authority for a service-role operation without a trusted server-side actor-resolution step.
- A user-facing client must not be able to choose service-role mode.

### FR-09 — Runtime observability and safe errors

- Cloud readiness and persistence mode MUST be inspectable without exposing secrets or tokens.
- Misconfiguration, unauthenticated, forbidden, conflict, network and database failures MUST remain distinguishable.
- No success toast or synced status may be emitted before the authoritative database operation succeeds.
- Logs MUST contain correlation/operation identifiers and safe error codes, not bearer tokens, signing keys or full sensitive design snapshots.
- Retry behavior MUST preserve idempotency keys.

## 6. Acceptance criteria

1. A production/cloud startup with missing Supabase configuration fails closed and displays a recoverable configuration/unavailable state; it never uses the in-memory adapter.
2. An explicitly configured local/test run can use the in-memory adapter.
3. No production UI action can create or install a hardcoded actor, role or tenant.
4. Cloud operations cannot run until a verified session and active organization membership are resolved.
5. No default organization UUID is used as an operational tenant.
6. JWT/session trust behavior is documented and matches the deployed Supabase signing configuration; no decode-only fallback exists.
7. The service-role key and signing secrets are absent from the browser build output.
8. Real PostgreSQL integration tests prove the authorization, RLS, RPC, atomicity and concurrency cases in FR-07.
9. Concurrent identical requests produce one logical mutation and replay the same response.
10. A reused key with a changed semantic request is rejected without writes.
11. Failure injection proves import and revision transactions leave no partial records.
12. Audit and outbox events are committed atomically and exactly once per logical successful operation.
13. Existing editor documents, legacy IDs, IndexedDB drafts, revision snapshots and conflict workflows remain compatible.
14. Lint, typecheck, unit tests, production build, E2E and database integration suite pass with recorded commands and environment versions.

## 7. Security invariants

- Identity is established by verified authentication, never by client-supplied actor IDs.
- Tenant selection is not tenant authorization.
- Every cloud read/write is scoped by organization and appropriate project membership/permission.
- Missing auth, tenant context, membership or configuration means deny.
- In-memory persistence is never a production fallback.
- Service role is never browser-accessible.
- Mutations, idempotency records, audit and outbox events commit or roll back together.
- Offline drafts remain local until explicit authorized synchronization; no silent last-write-wins behavior.

## 8. Dependencies and implementation constraints

- Preserve the canonical SaaS Project/Space/DesignRevision model introduced by Feature 034.
- Preserve legacy `KitchenProject` and `Home` identifiers inside revision snapshots.
- Preserve integer-millimetre domain semantics.
- Preserve existing editor behavior and IndexedDB local draft capability.
- Prefer incremental changes at the application composition/auth boundary.
- No broad refactor, schema redesign or UI redesign unless a concrete blocking defect requires it and is documented.
- Implementation MUST inspect all current migrations, auth wiring, environment variable conventions, build modes and deployment entry points before changing code.

## 9. Definition of done

All acceptance criteria pass, integration evidence is reproducible, deployment configuration is documented, and the implementation review confirms there is no production path to demo identity, default tenant or silent in-memory persistence. A passing unit suite alone is insufficient.
