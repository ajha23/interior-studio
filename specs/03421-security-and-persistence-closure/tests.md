# Feature 034.2.1 — Test Specification

## 1. Test Matrix

| Component | Target File | Scenarios Covered |
|---|---|---|
| JWT Verifier | `src/server/auth/jwtVerifier.test.ts` | Missing `exp` claim, non-numeric `exp`, expired `exp`, single string `aud`, array `aud`, mismatching `aud`, valid signature |
| Actor Resolver | `src/server/auth/actorResolver.test.ts` | Missing secret fails closed, inactive membership rejected, unverified token rejected, tenant header/claim match |
| Supabase Adapter | `src/infrastructure/persistence/supabasePersistenceAdapter.test.ts` | `importKitchen` calls `import_kitchen_project` RPC, `importHome` calls `import_home_project` RPC, response parsing & entity construction, error mapping |
| Persistence Factory | `src/infrastructure/persistence/persistenceFactory.test.ts` | In-memory initialization, Supabase initialization with credentials, missing credentials throws, store adapter replacement |
| Concurrency & RBAC | `src/infrastructure/persistence/concurrencyAndRbac.test.ts` | Concurrent idempotency replay, cross-tenant rejection, unauthenticated rejection, project scoping |

## 2. Regression Testing
- Entire Vitest test suite (all 146 test suites) must pass cleanly.
- Full Playwright E2E suite (62 tests) must pass cleanly.
