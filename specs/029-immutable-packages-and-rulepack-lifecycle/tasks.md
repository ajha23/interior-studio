# 029 Tasks — Immutable Production Packages, SHA-256 Hashing & RulePack Lifecycle Gates

## Task List

- [x] Task 1: RulePack Lifecycle Schema & Factory-Approved Fixtures (`ARC-04`, `MFG-02`)
  - File: `src/domain/manufacturing/rulePack.ts`
  - Add `RulePackStatusSchema` (`provisional`, `designer_reviewed`, `factory_validated`, `production_approved`).
  - Update `SEED_RULE_PACK_V1` to `provisional`.
  - Add `FACTORY_VALIDATED_RULE_PACK_V1` with `production_approved` status signed off by factory.
  - Unit tests: `src/domain/manufacturing/rulePack.test.ts`.

- [x] Task 2: Deterministic Canonical JSON & SHA-256 Hasher (`ARC-02`, `ARC-03`)
  - File: `src/engine/manufacturing/packageHash.ts`
  - Implement sorted-key `canonicalStringify` and pure SHA-256 hasher.
  - Unit tests: `src/engine/manufacturing/packageHash.test.ts`.

- [x] Task 3: Package Hash Integration in Explode Engine (`ARC-02`)
  - File: `src/engine/manufacturing/explode.ts`
  - Compute `canonicalHash` across parts, hardware, and edge band summary.
  - Unit tests: `src/engine/manufacturing/explode.test.ts`.

- [x] Task 4: Production Readiness Gate Enforcement (`MFG-02`)
  - File: `src/engine/deliverables/readiness.ts`
  - Gate: Check rule pack status; block approval with clear error when `status === 'provisional'`.
  - Unit tests: `src/engine/deliverables/readiness.test.ts`.

- [x] Task 5: UI Integration in Deliverables & Presentation Portal
  - File: `src/features/deliverables/DeliverablesView.tsx`
  - File: `src/features/deliverables/PresentationPortal.tsx`
  - Display verified package SHA-256 hash and RulePack lifecycle status badge.
  - Unit tests: `src/features/deliverables/PresentationPortal.test.tsx`.

- [x] Task 6: Playwright E2E Test & Full DoD Verification
  - File: `e2e/immutable-package-and-rulepack.spec.ts`
  - Verify: Open deliverables -> Observe package SHA-256 hash -> Check readiness gate with provisional vs approved rule pack.
  - Full DoD check: `npm run lint && npm run typecheck && npm test && npm run build && npx playwright test e2e/immutable-package-and-rulepack.spec.ts`.
