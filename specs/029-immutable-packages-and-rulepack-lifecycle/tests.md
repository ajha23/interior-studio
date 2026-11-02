# Tests 029 — Immutable Production Packages, SHA-256 Hashing & RulePack Lifecycle Gates

## Unit Test Matrix
1. `src/domain/manufacturing/rulePack.test.ts`:
   - Validates rule pack with status `provisional`, `factory_validated`, and `production_approved`.
   - Ensures `SEED_RULE_PACK_V1` has status `provisional` and `FACTORY_VALIDATED_RULE_PACK_V1` has status `production_approved`.
2. `src/engine/manufacturing/packageHash.test.ts`:
   - Serializes objects with keys in alphabetical order regardless of insertion order.
   - Computes deterministic SHA-256 hash (64 hex characters).
   - Produces identical hash for identical content across multiple runs.
   - Produces different hash when even 1 dimension or part count changes.
3. `src/engine/manufacturing/explode.test.ts`:
   - Emits `canonicalHash` and `rulePackStatus` in `ManufacturingPackage`.
   - Modifying a cabinet width changes the `canonicalHash`.
4. `src/engine/deliverables/readiness.test.ts`:
   - Rejects approval if the rule pack is `provisional` with blocking error.
   - Allows approval when rule pack is `factory_validated` or `production_approved`.

## E2E Scenario (`e2e/immutable-package-and-rulepack.spec.ts`)
- Open project and go to Deliverables Studio.
- Verify Package Hash badge displays a valid 64-character SHA-256 string.
- Open Client Presentation Portal and verify digital sign-off records the package's canonical SHA-256 hash.

