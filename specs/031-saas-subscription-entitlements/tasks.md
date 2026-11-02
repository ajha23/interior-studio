# Tasks: Multi-Tenant SaaS Subscription, Entitlement and Unified Policy Engine

**Input**: Design documents from `/specs/031-saas-subscription-entitlements/` (`spec.md`, `plan.md`, `research.md`, `data-model.md`, `contracts/`, `quickstart.md`)  
**Prerequisites**: Constitution v2.2.0 (Principles I, III, VI, VII, VIII, IX, X), TypeScript 5.8, Node.js >= 22  
**Governing Authority**: Constitution Principle X (*Multi-Tenant SaaS Architecture, Subscription Entitlements, and Plan-Based Feature Access*)

## Format: `[ID] [P?] [Story] Description`
- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g. US1, US2, US3, US4, US5, US6)
- Exact file paths included in every task description

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization, directory structure, domain schemas, and public exports.

- [x] T001 Create SaaS platform domain module directory structure at `src/domain/platform/saas/` per implementation plan
- [x] T002 Define Zod domain schemas and TypeScript types in `src/domain/platform/saas/types.ts` including `SubscriptionStatusSchema` (`'trial'`, `'active'`, `'past_due'`, `'grace_period'`, `'paused'`, `'cancelled_at_period_end'`, `'expired'`, `'unpaid'`), `BillingCycleSchema` (`'monthly'`, `'annual'`), `CanonicalKeySchema` (regex `/^(module|feature|quota|addon)\.[a-z0-9_.-]+$/`), `SubscriptionPlanSchema` with non-negative integer paise pricing (`priceMonthlyPaise: z.number().int().min(0)`, `priceAnnualPaise: z.number().int().min(0)`), `TenantSubscriptionSchema`, `TenantEntitlementOverrideSchema`, `TenantUsageQuotaSchema`, `PolicyEvaluationContextSchema`, and `PolicyEvaluationResult` interface
- [x] T003 [P] Create initial public barrel export in `src/domain/platform/saas/index.ts` exporting all domain types and schemas

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Relational schema migration and governance audit type infrastructure that MUST be complete before user story implementation.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [x] T004 Create PostgreSQL migration `supabase/migrations/00007_saas_subscriptions_and_entitlements.sql` creating `subscription_plans`, `tenant_subscriptions`, `tenant_entitlement_overrides`, and `tenant_usage_quotas` tables with integer paise columns (`BIGINT NOT NULL DEFAULT 0`), constraints, RLS policies enforcing `org_id = (auth.jwt() ->> 'org_id')::uuid`, and the `authorize_policy()` STABLE SQL function
- [x] T005 [P] Define audit log action types and event schemas in `src/domain/platform/saas/auditTypes.ts` for `subscriptions.plan_changed`, `subscriptions.status_changed`, `subscriptions.override_applied`, and `quotas.reservation_adjusted`

**Checkpoint**: Foundation ready - domain types, relational migration, and audit schemas are established.

---

## Phase 3: User Story 1 - Versioned Subscription Catalog & Capability Entitlement Registry (Priority: P1)

**Goal**: Establish a centralized catalog of commercial plans and a registry of canonical capability identifiers, completely decoupling commercial plan names from business modules.

**Independent Test**: Register a commercial plan version (e.g. `Pro Studio v2`) with canonical keys (`feature.design.3d.render`, `quota.projects.active.max`), and verify that `SubscriptionCatalog` retrieves effective plan definitions and retains `v1` intact for grandfathered tenants.

### Tests for User Story 1 ⚠️
- [x] T006 [P] [US1] Unit test for Subscription Catalog and Entitlement Registry in `src/domain/platform/saas/subscriptionCatalog.test.ts` verifying plan registration, versioned lookups, immutable history retention, and canonical key validation

### Implementation for User Story 1
- [x] T007 [P] [US1] Implement `EntitlementRegistry` in `src/domain/platform/saas/entitlementRegistry.ts` indexing canonical module, feature, quota, and add-on keys (`module.*`, `feature.*`, `quota.*`, `addon.*`)
- [x] T008 [US1] Implement `SubscriptionCatalog` in `src/domain/platform/saas/subscriptionCatalog.ts` implementing `ISubscriptionCatalog` contract with default catalog tiers (`trial`, `starter`, `pro`, `enterprise`, `inhouse`), versioning support, integer paise pricing, and capability mappings (depends on T007)

**Checkpoint**: User Story 1 functional - commercial plans can be registered, versioned, and queried without business module changes.

---

## Phase 4: User Story 2 - Central Policy Evaluation Engine (Unified Access Check) (Priority: P1) 🎯 MVP

**Goal**: Enforce the unified 6-term authorization formula ($\text{AccessAllowed} = \text{TenantValid} \land \text{SubscriptionEntitled} \land \text{RolePermissionGranted} \land \text{ResourceScopeValid} \land \text{UsageWithinLimit} \land \text{ContextualPolicySatisfied}$) across API, command bus, and client components.

**Independent Test**: An authorized administrator grants a designer role permission for `production.download_cutlist`. When tested on a tenant with a `Starter` subscription (which does not entitle CNC cutlists), verify `evaluatePolicy()` rejects the operation with `SUBSCRIPTION_UNENTITLED`.

### Tests for User Story 2 ⚠️
- [x] T009 [P] [US2] Contract and unit tests for unified Policy Evaluation Engine in `src/domain/platform/saas/policyEngine.test.ts` verifying the 6-term formula, deny-by-default on missing parameters, diagnostic reasons, and latency bounds (< 5ms in-memory)
- [x] T011 [P] [US2] Server middleware integration tests in `src/server/policyMiddleware.test.ts` verifying `withPolicyGuard` returns 401 on missing tenant context, 403 on unentitled feature or missing RBAC permission, and 402 on quota exhaustion
- [x] T013 [P] [US2] React hook tests for `useSubscriptionPolicy` in `src/features/shared/useSubscriptionPolicy.test.ts` verifying reactive allowed states, upgrade prompts, and cached evaluation

### Implementation for User Story 2
- [x] T010 [US2] Implement pure `PolicyEvaluationEngine` in `src/domain/platform/saas/policyEngine.ts` implementing `IPolicyEvaluationEngine` contract with asynchronous `evaluatePolicy` and synchronous in-memory `evaluatePolicySync` evaluating tenant validity, subscription entitlement, role permissions, resource scoping, and quota limits (depends on T008)
- [x] T012 [US2] Implement server `withPolicyGuard` middleware in `src/server/policyMiddleware.ts` wrapping API request handlers with unified policy evaluation (depends on T010)
- [x] T014 [US2] Implement `useSubscriptionPolicy` React hook in `src/features/shared/useSubscriptionPolicy.ts` providing `{ allowed, isEntitled, isPermitted, reason, requiredUpgradeTier }` reactive policy state for UI components (depends on T010)

**Checkpoint**: User Story 2 functional (MVP achieved) - central policy engine authoritatively gates operations across domain, server middleware, and UI hooks.

---

## Phase 5: User Story 3 - Quantitative Usage Tracking & Concurrency-Safe Quota Reservation (Priority: P2)

**Goal**: Accurately track quantitative quotas (active projects, designer seats, rendering credits) with atomic reservations that prevent concurrent operations from exceeding licensed limits.

**Independent Test**: A studio on Starter plan (limit: 15 active projects) attempts to create a 16th project. The quota manager rejects the creation with `QUOTA_EXCEEDED` and prompts for an upgrade.

### Tests for User Story 3 ⚠️
- [x] T015 [P] [US3] Unit tests for Usage Quota Manager in `src/domain/platform/saas/quotaManager.test.ts` verifying atomic reservation, commit, release, rollover on billing cycle anchor timestamp, and prevention of over-allocation under concurrent calls
- [x] T017 [P] [US3] Component tests for `UsageQuotaTracker` in `src/features/billing/UsageQuotaTracker.test.tsx` verifying visual meter progress bars for active projects, designer seats, and rendering credits

### Implementation for User Story 3
- [x] T016 [US3] Implement `UsageQuotaManager` in `src/domain/platform/saas/quotaManager.ts` implementing `IUsageQuotaManager` contract with atomic reservations, pessimistic lock decrement simulation, and periodic rollover calculation
- [x] T018 [US3] Implement `UsageQuotaTracker` component in `src/features/billing/UsageQuotaTracker.tsx` rendering live quota consumption meters with warning thresholds (80% yellow, 100% red) and upgrade triggers (depends on T016)

**Checkpoint**: User Story 3 functional - quantitative quotas are tracked atomically, preventing negative balances and over-allocation.

---

## Phase 6: User Story 4 - Layered Tenant-Specific Overrides & Commercial Add-ons (Priority: P2)

**Goal**: Support commercial add-ons (extra seats, storage, rendering bundles) and tenant-specific contractual overrides calculated deterministically as $\text{Base} + \text{Add-ons} + \text{Overrides} + \text{Promotions}$ while enforcing immutable platform architectural safety ceilings.

**Independent Test**: Assign a tenant on Starter tier a commercial add-on for `addon.storage.50gb` and verify that the effective storage limit increases from 5GB to 55GB while refusing overrides exceeding architectural ceilings.

### Tests for User Story 4 ⚠️
- [x] T019 [P] [US4] Unit tests for Layered Effective Entitlements in `src/domain/platform/saas/effectiveEntitlements.test.ts` verifying strict layered precedence ($\text{Effective} = \text{Base Plan} + \text{Add-ons} + \text{Overrides} + \text{Promotions}$), expiration dates, and enforcement of immutable platform architectural safety ceilings

### Implementation for User Story 4
- [x] T020 [US4] Implement `EffectiveEntitlementManager` in `src/domain/platform/saas/effectiveEntitlements.ts` implementing `IEffectiveEntitlementManager` contract computing cumulative features and quotas, evaluating active expiration windows, and bounding values against system safety ceilings (depends on T008)

**Checkpoint**: User Story 4 functional - custom commercial overrides and add-ons calculate deterministically without altering base plan definitions.

---

## Phase 7: User Story 5 - Explicit Subscription Lifecycle & Non-Destructive Downgrade Retention (Priority: P2)

**Goal**: Manage subscription lifecycle states (`trial`, `active`, `past_due`, `grace_period`, `paused`, `cancelled_at_period_end`, `expired`, `unpaid`), ensure non-destructive plan downgrades with project roster selection, and protect customer designs in read-only archive mode.

**Independent Test**: Downgrade a tenant with 20 active projects from Pro (unlimited) to Starter (limit: 15). Verify that all 20 projects remain viewable and exportable, the studio owner can designate 15 active projects, unselected projects enter read-only archive mode, and new project creation is blocked.

### Tests for User Story 5 ⚠️
- [x] T021 [P] [US5] Unit tests for Subscription Lifecycle State Machine in `src/domain/platform/saas/lifecycleManager.test.ts` verifying all 8 states, 7-day past_due grace transitions, and 30-day export retention
- [x] T023 [P] [US5] Unit tests for Downgrade Retention in `src/domain/platform/saas/downgradeRetention.test.ts` verifying zero silent data deletion, owner project designation up to new tier quota, read-only locking of unselected projects, and blocking of new creations
- [x] T024 [P] [US5] Component tests for `PlanUpgradeModal` in `src/features/billing/PlanUpgradeModal.test.tsx`
- [x] T026 [P] [US5] Component tests for `ProjectRosterModal` in `src/features/billing/ProjectRosterModal.test.tsx`

### Implementation for User Story 5
- [x] T022 [US5] Implement `LifecycleManager` in `src/domain/platform/saas/lifecycleManager.ts` managing subscription status transitions, calculating grace periods, and determining operational read/write restrictions
- [x] T025 [US5] Implement `PlanUpgradeModal` in `src/features/billing/PlanUpgradeModal.tsx` displaying current tier, missing capability details, tier comparison table in integer paise, and upgrade action button
- [x] T027 [US5] Implement `ProjectRosterModal` in `src/features/billing/ProjectRosterModal.tsx` allowing studio owners during a plan downgrade to select active projects up to the quota limit while transitioning unselected projects to read-only archive status

**Checkpoint**: User Story 5 functional - subscription lifecycle is fully managed and downgrades preserve all customer design assets non-destructively.

---

## Phase 8: User Story 6 - Auditable Governance & Commercial Billing Integration (Priority: P3)

**Goal**: Emit tamper-evident audit records for all subscription lifecycle events, ingest billing provider webhooks, and provide reactive client state management.

**Independent Test**: Apply an administrative quota override; verify that `audit_log` records event `subscriptions.override_applied` with actor ID, timestamp, previous allocation, and new allocation.

### Tests for User Story 6 ⚠️
- [x] T028 [P] [US6] Unit tests for Client Subscription Store in `src/state/subscriptionStore.test.ts` verifying plan loading, quota updates, override caching, and optimistic policy evaluation
- [x] T030 [P] [US6] Unit tests for billing webhook processing and audit event generation in `src/domain/platform/saas/billingWebhook.test.ts`

### Implementation for User Story 6
- [x] T029 [US6] Implement client Zustand store in `src/state/subscriptionStore.ts` managing tenant subscription state, effective entitlements, quota counters, and reactive cache invalidation
- [x] T031 [US6] Implement webhook ingestion handler and audit logger in `src/domain/platform/saas/billingWebhook.ts` verifying signatures, synchronizing plan upgrades/downgrades atomically, and recording events to `audit_log`
- [x] T032 [US6] Integrate `UsageQuotaTracker` and `PlanUpgradeModal` into `src/features/billing/BillingSettingsView.tsx` and `src/features/table-editor/StudioTableEditor.tsx`

**Checkpoint**: User Story 6 functional - billing webhooks synchronize entitlements, audit records are emitted, and UI displays live subscription state.

---

## Phase 9: Polish & Cross-Cutting Concerns

**Purpose**: End-to-end user journey verification, package exports, and five-stage quality gates.

- [x] T033 [P] Playwright E2E test in `e2e/saas-subscription-lifecycle.spec.ts` testing full user journey: plan upgrade, quota enforcement on project creation, and non-destructive downgrade roster selection
- [x] T034 Export all public domain modules in `src/domain/platform/saas/index.ts` and verify ESLint architectural layer isolation (`no-restricted-imports`)
- [x] T035 Run full project quality gates verification: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`

---

## Dependencies & Execution Order

### Phase Dependencies
- **Setup (Phase 1)**: No dependencies - can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion - BLOCKS all user stories
- **User Story 1 (Phase 3)**: Depends on Foundational completion
- **User Story 2 (Phase 4 - MVP)**: Depends on User Story 1 completion
- **User Story 3 (Phase 5)**: Depends on User Story 2 completion
- **User Story 4 (Phase 6)**: Depends on User Story 1 completion
- **User Story 5 (Phase 7)**: Depends on User Story 3 completion
- **User Story 6 (Phase 8)**: Depends on User Story 5 completion
- **Polish (Phase 9)**: Depends on all user stories completion

### User Story Dependencies
- **US1 (P1)**: Catalog & Entitlement Registry (Foundational for all downstream access evaluation)
- **US2 (P1 🎯 MVP)**: Policy Evaluation Engine (Consumes US1 catalog and capability keys)
- **US3 (P2)**: Quota Management (Integrates with US2 policy engine quota terms)
- **US4 (P2)**: Overrides & Add-ons (Extends US1 catalog with layered effective entitlements)
- **US5 (P2)**: Lifecycle & Downgrades (Consumes US3 quotas for roster management)
- **US6 (P3)**: Auditable Governance & UI (Binds all features into Zustand store, table editor, and audit logs)

### Parallel Opportunities
- Within Phase 1: T003 can run in parallel with T002.
- Within Phase 2: T005 can run in parallel with T004.
- Within User Story 1: T006 (tests) and T007 (registry) can run in parallel.
- Within User Story 2: T009 (tests), T011 (middleware tests), and T013 (hook tests) can run in parallel.
- Within User Story 3: T015 (tests) and T017 (component tests) can run in parallel.
- Within User Story 4: T019 (tests) can run in parallel with earlier story work.
- Within User Story 5: T021, T023, T024, and T026 (tests) can run in parallel.
- Within User Story 6: T028 and T030 (tests) can run in parallel.
- Within Polish: T033 (E2E test) and T034 (exports check) can run in parallel.

---

## Parallel Example: User Story 2 (Central Policy Evaluation Engine)

```bash
# Launch test suites together:
Task T009: "src/domain/platform/saas/policyEngine.test.ts"
Task T011: "src/server/policyMiddleware.test.ts"
Task T013: "src/features/shared/useSubscriptionPolicy.test.ts"

# Implement core engine and downstream adapters:
Task T010: "src/domain/platform/saas/policyEngine.ts"
Task T012: "src/server/policyMiddleware.ts"
Task T014: "src/features/shared/useSubscriptionPolicy.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 + User Story 2)
1. Complete Phase 1: Setup (`types.ts`, `index.ts`)
2. Complete Phase 2: Foundational (`00007_saas_subscriptions_and_entitlements.sql`, `auditTypes.ts`)
3. Complete Phase 3: User Story 1 (`subscriptionCatalog.ts`, `entitlementRegistry.ts`)
4. Complete Phase 4: User Story 2 (`policyEngine.ts`, `policyMiddleware.ts`, `useSubscriptionPolicy.ts`)
5. **STOP and VALIDATE**: Test User Story 1 & 2 independently (`npm test src/domain/platform/saas/policyEngine.test.ts`)
6. Deliver MVP increment!

### Incremental Delivery
1. Add User Story 3: Quota Tracking (`quotaManager.ts`, `UsageQuotaTracker.tsx`)
2. Add User Story 4: Layered Overrides (`effectiveEntitlements.ts`)
3. Add User Story 5: Lifecycle & Downgrades (`lifecycleManager.ts`, `ProjectRosterModal.tsx`, `PlanUpgradeModal.tsx`)
4. Add User Story 6: Billing Webhooks & Store (`subscriptionStore.ts`, `billingWebhook.ts`, `StudioTableEditor.tsx`)
5. Final Polish: E2E Playwright test (`e2e/saas-subscription-lifecycle.spec.ts`) + 5-stage quality gates.
