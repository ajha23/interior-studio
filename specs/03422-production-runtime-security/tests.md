# Feature 034.2.2 — Verification and Test Plan

## 1. Test strategy

Use four complementary layers:

1. **Unit tests:** configuration parsing, runtime state transitions, canonical request hashing, actor/membership resolution and adapter behavior.
2. **Application integration tests:** actual bootstrap/composition path, auth state changes, store gating and UI behavior.
3. **Database integration tests:** real PostgreSQL/Supabase migrations, roles, JWT claims, RLS, SECURITY DEFINER RPCs, concurrency, rollback and audit/outbox behavior.
4. **Build/deployment verification:** production bundle inspection, environment exposure checks and deployment readiness validation.

Mocked Supabase clients and in-memory adapters are useful for deterministic unit tests. They MUST NOT be counted as evidence for PostgreSQL concurrency, RLS, SQL grants or transaction atomicity.

## 2. Runtime configuration and bootstrap

| ID | Scenario | Expected result |
|---|---|---|
| RT-001 | Production mode, missing Supabase URL | Startup/cloud readiness fails; no in-memory adapter |
| RT-002 | Production mode, missing anon/publishable key | Startup/cloud readiness fails |
| RT-003 | Production mode, valid Supabase config | Supabase adapter initialized once |
| RT-004 | Unknown runtime mode | Configuration error; no adapter fallback |
| RT-005 | Local mode with explicit in-memory opt-in | In-memory adapter initialized |
| RT-006 | Local mode without explicit in-memory opt-in | Follow configured safe default; never infer in-memory from missing credentials |
| RT-007 | React StrictMode/bootstrap invoked twice | One effective adapter and one auth subscription |
| RT-008 | Auth session expires during operation | Subsequent operation denied; no false synced state |
| RT-009 | Adapter initialization fails | Readiness unavailable; cloud actions disabled |
| RT-010 | Unit test injects adapter explicitly | Test isolation maintained; production defaults unaffected |

Assertions:
- spy on adapter construction and ensure no implicit in-memory construction in production mode;
- assert the real application entry point invokes the composition root;
- assert readiness transitions are deterministic and observable;
- ensure no optimistic cloud success on startup failure.

## 3. Identity and tenant tests

| ID | Scenario | Expected result |
|---|---|---|
| ID-001 | No authenticated session | Actor unresolved; cloud operation rejected |
| ID-002 | Valid authenticated session | Actor ID equals verified session subject |
| ID-003 | Caller supplies a different actor ID | Client context cannot override verified actor |
| ID-004 | Active membership in selected org | Tenant context becomes ready |
| ID-005 | Inactive/revoked membership | Tenant context denied |
| ID-006 | User has no membership in selected org | Denied before data access and again by DB authorization |
| ID-007 | Organization switch | Membership reloaded; old tenant caches cleared |
| ID-008 | Sign out | Actor/org/permissions/remote caches cleared; local drafts retained |
| ID-009 | Missing organization selection | Cloud operations rejected |
| ID-010 | Cross-organization project ID | No data disclosed; operation forbidden/not found per policy |

The test suite MUST assert both application-level denial and database-level denial. UI hiding is not a security control.

## 4. JWT and secret-boundary tests

Run only the tests applicable to the actual configured Supabase signing architecture.

- valid token with expected issuer/audience accepted;
- expired token rejected;
- token not yet valid rejected outside documented clock skew;
- wrong issuer rejected;
- wrong audience rejected, including array-valued audience edge cases;
- missing subject or malformed required claim rejected;
- `alg=none` and algorithm-confusion attempts rejected;
- invalid signature rejected;
- unknown `kid` rejected;
- key rotation from old to new valid key handled according to documented overlap policy;
- unavailable JWKS/key configuration fails cloud readiness, never decode-only fallback;
- no JWT signing secret, private key or service-role key appears in browser bundle, source maps or client-visible env;
- anon/publishable key may be public but is never treated as signing authority.

For a browser-only Supabase SDK trust path, test session handling and authenticated API rejection at the Supabase boundary rather than implementing an unnecessary custom browser JWT verifier.

## 5. Idempotency contract tests

### 5.1 Canonical hash

Verify deterministic output for equivalent normalized payloads and distinct output for semantically different operations.

Required mutation pairs:
- same kitchen snapshot, different project name;
- same kitchen snapshot, different source file identity;
- same home rooms, changed room name/type/level/position;
- same revision snapshot, different project or space;
- same revision snapshot, different expected base revision;
- same payload, different canonicalization version;
- object key order changed but semantic content unchanged.

### 5.2 Replay and key reuse

| ID | Scenario | Expected result |
|---|---|---|
| IDEM-001 | First request with new key | One transaction committed |
| IDEM-002 | Exact replay with same key | Original response replayed; no duplicate writes |
| IDEM-003 | Same key, changed semantic envelope | Stable idempotency conflict; no writes |
| IDEM-004 | Concurrent identical requests | One logical mutation; all callers receive equivalent result |
| IDEM-005 | Concurrent same key, different request hashes | At most one request commits; other receives key-reuse conflict |
| IDEM-006 | Transaction fails before commit | No durable idempotency record or partial mutation |
| IDEM-007 | Retry after network response loss | Same key returns original committed result |

## 6. Database integration tests

### 6.1 Harness requirements

- Start an isolated local Supabase stack or supported PostgreSQL test instance with required Supabase auth functions/roles.
- Apply all migrations in repository order from a clean database.
- Fail the suite if any migration fails or is skipped.
- Use independent DB connections for concurrency tests.
- Create deterministic test organizations, users and memberships.
- Never use production credentials/data.
- Preserve logs and database version/migration inventory in CI artifacts.

### 6.2 Authorization and RLS

| ID | Scenario | Expected result |
|---|---|---|
| DB-001 | Authenticated active member reads own org project | Allowed when permission permits |
| DB-002 | Unauthenticated direct table read | Denied/no rows |
| DB-003 | Member reads another org project | Denied/no rows |
| DB-004 | Inactive membership reads org data | Denied |
| DB-005 | Member lacks project permission | RPC denied |
| DB-006 | Project-scoped permission for assigned project | Allowed |
| DB-007 | Project-scoped permission for unassigned project | Denied |
| DB-008 | Authenticated caller supplies another actor ID | RPC rejects impersonation |
| DB-009 | Anonymous/public role invokes privileged RPC | Execute denied |
| DB-010 | SECURITY DEFINER function called with hostile search_path objects | No privilege escalation; fixed search_path effective |

### 6.3 Revision transaction and concurrency

| ID | Scenario | Expected result |
|---|---|---|
| DB-011 | Valid commit with expected current revision | New immutable revision, space pointer update, audit/outbox/idempotency in one transaction |
| DB-012 | Stale expected revision | Conflict; no new revision or audit/outbox mutation |
| DB-013 | Two concurrent same-key/same-payload commits | One revision; second response replays first |
| DB-014 | Two concurrent different payloads with same key | One commit maximum; other receives idempotency conflict |
| DB-015 | Two concurrent different keys against same expected revision | At most one CAS success; other gets revision conflict |
| DB-016 | Failure after revision insert before transaction end | Entire transaction rolled back |
| DB-017 | Audit insert failure | Revision and space pointer changes rolled back |
| DB-018 | Outbox insert failure | Revision, audit and pointer changes rolled back |

### 6.4 Atomic imports

| ID | Scenario | Expected result |
|---|---|---|
| DB-019 | Valid kitchen import | Project, space, revision, mapping, audit, outbox and idempotency committed together |
| DB-020 | Kitchen import lacks projects:create | Denied; zero writes |
| DB-021 | Concurrent identical kitchen import | One project/space/revision and one logical event |
| DB-022 | Valid multi-room home import | One project and expected spaces/revisions/mappings; one logical audit/outbox event |
| DB-023 | Home import lacks projects:create | Denied; zero writes |
| DB-024 | Home import fails after an intermediate room | All project/space/revision/mapping/audit/outbox/idempotency writes rolled back |
| DB-025 | Same import key with changed project name/source identity | Key-reuse conflict; no additional writes |
| DB-026 | Empty/malformed/oversized rooms payload | Validation error; zero writes |

### 6.5 Service-role boundary

- Confirm service-role key is never in browser code or build artifacts.
- Confirm a browser-authenticated user cannot select or invoke a service-role client.
- Confirm trusted server endpoint independently authenticates user and resolves actor/org before service-role RPC.
- Confirm arbitrary actor/org request parameters cannot impersonate another user.
- Confirm service-role bypass is limited to intended operations and creates attributable audit records.
- Confirm server logs redact credentials and bearer tokens.

## 7. Regression tests

- Kitchen legacy import retains legacy document ID and complete snapshot.
- Home import creates one SaaS Space/revision per source room and preserves source room IDs in mappings.
- Existing editor can open a committed revision without schema/data loss.
- Local IndexedDB drafts remain available while unauthenticated or offline.
- Signing out or switching tenant does not erase local drafts.
- Conflict reload/fork workflows remain functional and never silently overwrite a newer revision.
- Existing 2D/3D editor, measurements, units and drawing behavior are unchanged.

## 8. CI and release gates

Required independent jobs:
1. lint;
2. typecheck;
3. unit tests;
4. production build;
5. E2E;
6. database migration + integration suite;
7. browser bundle/secret scan.

Database tests MUST fail (not skip) in the dedicated integration job if the database is unavailable. Pull requests may use a local service container or ephemeral Supabase environment.

## 9. Evidence template

Record in the feature PR:

- Integration base SHA:
- Feature implementation SHA:
- Supabase/PostgreSQL version:
- Migration range applied:
- JWT signing mode and issuer/audience configuration (no secret values):
- Runtime mode tested:
- Commands executed:
- Unit test count/result:
- E2E result:
- Database integration test count/result:
- Concurrency test repetitions:
- Rollback/failure-injection cases:
- Bundle secret-scan result:
- Known limitations:
- Security reviewer:

A test result is evidence only for the environment and code revision on which it ran. Do not report mocked tests as database integration coverage.
