# Implementation Plan: Multi-Tenant SaaS Subscription, Entitlement and Unified Policy Engine

**Branch**: `031-saas-subscription-entitlements` | **Date**: 2026-11-02 | **Spec**: [specs/031-saas-subscription-entitlements/spec.md](file:///Users/akhil/WorkSpace/interior-studio-rewrite/specs/031-saas-subscription-entitlements/spec.md)

---

## Summary

This feature establishes the core commercial and authorization capability mandated by **Constitution Principle X**: a unified **Multi-Tenant SaaS Subscription, Entitlement, and Policy Evaluation Platform**. It decouples subscription licensing from tenant RBAC and tenant isolation, executing access checks through a single authoritative formula:

$$\text{AccessAllowed} = \text{TenantValid} \land \text{SubscriptionEntitled} \land \text{RolePermissionGranted} \land \text{ResourceScopeValid} \land \text{UsageWithinLimit} \land \text{ContextualPolicySatisfied}$$

The architecture provides a versioned `SubscriptionCatalog`, a canonical `EntitlementRegistry` (`module.*`, `feature.*`, `quota.*`), layered effective entitlement computation ($\text{Base} + \text{Add-ons} + \text{Overrides} + \text{Promotions}$), concurrency-safe atomic quota reservations (`SELECT ... FOR UPDATE`), an 8-state subscription lifecycle machine, non-destructive plan downgrades with project roster management, and backend-only deny-by-default enforcement.

---

## Technical Context

**Language/Version**: TypeScript 5.8 / Node.js >= 22 (strict mode, `verbatimModuleSyntax: true`, zero `any`)  
**Primary Dependencies**: React 19, Zustand 5, Immer 11, Zod 3/4, Tailwind CSS 4, shadcn/ui primitives  
**Storage**: PostgreSQL 16 (Supabase), Row-Level Security (RLS), Web Crypto HMAC-SHA256, IndexedDB client cache  
**Testing**: Vitest 3 (`*.test.ts`), React Testing Library (`*.test.tsx`), Playwright 1.50 (`e2e/*.spec.ts`)  
**Target Platform**: Modern Desktop & Tablet Browsers (Chrome, Safari, Firefox, Edge) + Node.js Serverless runtime  
**Project Type**: Monolith-to-Monorepo Web Application & pure domain TypeScript platform modules  
**Performance Goals**: Policy evaluation < 5ms in-memory, < 15ms database boundary; webhook synchronization < 500ms  
**Constraints**: Zero UI/DOM/network imports in `src/domain/platform/saas/`; integer paise for all monetary values; non-destructive data retention on downgrade  
**Scale/Scope**: Multi-tenant isolation across 10,000+ organizations, up to 50 custom roles per tenant, hundreds of concurrent active projects per organization  

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Architectural Layer Isolation & Bounded Topology**: `src/domain/platform/saas/` is 100% framework-free TypeScript (zero React/DOM/network imports). ESLint `no-restricted-imports` is strictly honored.
- [x] **II. Single Mutation Path via Command Pattern & Guarded AI Execution**: Role, entitlement, and quota updates occur through typed domain methods; AI copilot cannot alter plans, bypass entitlements, or elevate privileges.
- [x] **III. Deterministic Numerical Contracts & Zero Silent Coercion**: All plan prices and add-on fees stored as integer paise ($\text{₹}1 = 100\text{ paise}$). Quotas are strict non-negative integers.
- [x] **IV. Pure Derived Artifacts & Immutable Production Package Snapshots**: Effective entitlements and policy evaluations are pure deterministic functions derived from subscription state.
- [x] **V. Manufacturing Traceability, 0-Tolerance Explode & RulePack Governance**: Manufacturing operations (`feature.manufacturing.cnc_cutlist`) are registered capabilities guarded by subscription tier.
- [x] **VI. Modular Architecture & Configurable Dynamic Authorization**: Integrates directly with `ModuleRegistry` and `AdminRoleService` from Feature 030. Admins can only assign permissions for entitled capabilities.
- [x] **VII. Multi-Tenant Isolation, Data Residency & Statutory DPDP Privacy**: All subscription and quota tables scoped by `org_id` with PostgreSQL RLS. Tamper-evident logging of commercial actions into `audit_log`.
- [x] **VIII. Schema Evolution, Migration Immutability & Stable Identifiers**: Relational schema updates added as forward-only migration `00007_saas_subscriptions_and_entitlements.sql`.
- [x] **IX. Test-First Quality, Golden Fixtures & Five-Stage Quality Gates**: Comprehensive Vitest unit tests, RTL component tests, RLS penetration tests, and Playwright E2E suites verifying DoD: `npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`.
- [x] **X. Multi-Tenant SaaS Architecture, Subscription Entitlements, and Plan-Based Feature Access**: Core mandate of this feature. Decouples subscription licensing from RBAC and isolation, implements capability registry, layered entitlements, concurrency-safe quotas, lifecycle transitions, and non-destructive downgrades.

---

## Project Structure

### Documentation (this feature)

```text
specs/031-saas-subscription-entitlements/
├── spec.md               # Feature specification with clarifications and acceptance criteria
├── checklists/
│   └── requirements.md   # Quality validation checklist
├── plan.md               # Implementation plan (this document)
├── research.md           # Technical research and architecture decisions
├── data-model.md         # Domain schemas and PostgreSQL relational models
├── quickstart.md         # Step-by-step runnable validation guide
├── contracts/            # TypeScript interface contracts
│   ├── policy-engine.contract.ts
│   ├── subscription-catalog.contract.ts
│   └── quota-manager.contract.ts
└── tasks.md              # Sequential implementation tasks (/speckit-tasks output)
```

### Source Code Layout

```text
src/
├── domain/
│   └── platform/
│       └── saas/
│           ├── types.ts                    # Zod schemas: Plans, Entitlements, Quotas, Lifecycle
│           ├── subscriptionCatalog.ts      # Versioned commercial plans and capability mappings
│           ├── subscriptionCatalog.test.ts # Catalog indexing & versioning tests
│           ├── entitlementRegistry.ts      # Registry of canonical feature and quota keys
│           ├── effectiveEntitlements.ts    # Layered calculation: Base + Add-on + Override + Grant
│           ├── effectiveEntitlements.test.ts # Layered precedence & safety ceiling tests
│           ├── quotaManager.ts             # Quantitative quota consumption & reservation logic
│           ├── quotaManager.test.ts        # Atomic quota reservation & rollover tests
│           ├── lifecycleManager.ts         # Subscription state transitions & grace policies
│           ├── lifecycleManager.test.ts    # State machine and transition tests
│           ├── policyEngine.ts             # Unified PolicyEvaluationEngine (6-term formula)
│           ├── policyEngine.test.ts        # Exhaustive multi-layer access evaluation tests
│           ├── downgradeRetention.test.ts  # Non-destructive downgrade roster tests
│           └── index.ts                    # Public domain platform exports
├── server/
│   ├── policyMiddleware.ts                 # Server API & RPC withPolicyGuard middleware
│   └── policyMiddleware.test.ts            # Server-side 401/403/402 guard integration tests
├── state/
│   ├── subscriptionStore.ts                # Client Zustand store for active plan & quotas
│   └── subscriptionStore.test.ts           # State store unit tests
├── features/
│   ├── shared/
│   │   └── useSubscriptionPolicy.ts       # React hook: { allowed, isEntitled, isPermitted }
│   └── billing/
│       ├── PlanUpgradeModal.tsx            # Commercial upgrade CTA and tier selector
│       ├── UsageQuotaTracker.tsx           # Visual meter for seats, projects, and credits
│       └── ProjectRosterModal.tsx          # Non-destructive downgrade project selection dialog
supabase/
└── migrations/
    └── 00007_saas_subscriptions_and_entitlements.sql # Relational tables, RLS, authorize_policy()
e2e/
└── saas-subscription-lifecycle.spec.ts     # Playwright E2E verifying upgrades, quotas, downgrades
```

---

## Complexity Tracking

| Architectural Component | Complexity | Mitigation Strategy |
| :--- | :--- | :--- |
| **6-Term Policy Formula Evaluation** | High | Pure deterministic domain function evaluated in a single pass; in-memory caching for client performance. |
| **Atomic Quota Reservation** | Medium | PostgreSQL row-level pessimistic locking (`SELECT ... FOR UPDATE`) prevents concurrency race conditions. |
| **Layered Entitlement Calculation** | Medium | Strict mathematical precedence ($\text{Base} + \text{Add-ons} + \text{Overrides} + \text{Grants}$) bounded by immutable safety ceilings. |
| **Non-Destructive Downgrades** | Medium | Dedicated roster state machine allowing owner to designate active projects while preserving archived projects in read-only mode. |
