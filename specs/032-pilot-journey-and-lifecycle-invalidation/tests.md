# Tests Spec 032: End-to-End Pilot Journey, Lifecycle Invalidation & Cut-List Part Traceability

## Unit Tests
1. `src/domain/project/lifecycle.test.ts`:
   - Validates state transitions (`draft` → `client_presented` → `quote_approved` → `design_approved` → `factory_validated` → `production_released`).
   - Asserts `evaluateLifecycleInvalidation()` returns `isCurrent: true` when revisions match, and `isCurrent: false` with invalidated milestones when current revision differs.
2. `src/engine/manufacturing/explodeTraceability.test.ts`:
   - Asserts 100% of parts emitted by `explodeScene` have non-empty `moduleId`, `moduleType`, `rulePackId`, `rulePackVersion`, `generationAlgorithmVersion`.
   - Asserts zero unlinked or orphaned parts.
3. `src/domain/commercial/rateCard.test.ts`:
   - Validates `RateCardSchema` with integer paise.
   - Verifies rate card snapshotting during quote calculation.

## E2E Acceptance Test
1. `e2e/pilot-journey-vertical-slice.spec.ts`:
   - Tests all 12 steps of the pilot vertical slice:
     - Step 1: Create client & project.
     - Step 2: Open Site Capture modal, verify ±10mm closure.
     - Step 3: Verify room 3D geometry rendered.
     - Step 4: Verify parametric kitchen layout.
     - Step 5: Deliverables view -> approve revision.
     - Step 6: Mutate design -> verify invalidation banner appears.
     - Step 7: Factory approved RulePack -> verify canonical SHA-256 package hash.
     - Step 8: Verify 100% part lineage traceability.

