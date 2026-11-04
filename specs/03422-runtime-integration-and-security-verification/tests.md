# Feature 034.2.2 — Test Specification

## 1. Test Matrix

| Component | Target File | Scenarios Covered |
|---|---|---|
| Persistence Factory & Startup | `src/infrastructure/persistence/persistenceFactory.test.ts` | `bootstrapPersistence()` in cloud mode, missing credentials throws, in-memory fallback in local mode |
| Store Organization & Actor | `src/state/cloudProjectStore.test.ts` | Null `currentOrgId` throws `orgMembershipRequired`, null `activeActorId` throws `unauthenticated`, valid org enables persistence operations |
| JWT Config & Verification | `src/server/auth/jwtVerifier.test.ts` | Config validation fails if secret/issuer/audience missing, issuer mismatch rejected, audience mismatch rejected |
| Database Integration & Concurrency | `src/infrastructure/persistence/databaseIntegration.test.ts` | Concurrent revision CAS conflict, full-request import idempotency hash mismatch, service-role spoofing rejection |

## 2. Regression Testing
- Full Vitest suite across all files.
- Production build `npm run build`.
- Playwright E2E suite across all 62 scenarios.
