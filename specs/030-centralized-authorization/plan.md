# Implementation Plan: Centralized Modular Architecture & Dynamic Authorization Platform

**Branch**: `030-centralized-authorization` | **Date**: 2026-11-02 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/030-centralized-authorization/spec.md`

---

## Summary

This feature implements the foundational capability mandated by **Constitution Principle VI**: a centralized, reusable, administrator-configurable authorization platform. All business modules (Projects, Floor Plans, 2D/3D Design, Furniture, Materials, Estimates, Client Deliverables) register their capabilities and granular permissions with a central `ModuleRegistry`. Tenant administrators can create, clone, customize, and deactivate custom studio roles, assign granular permissions, and enforce resource-level scopes (`all_projects`, `assigned_projects`, `team_projects`, `client_projects`) through an administrative UI. Authorization is strictly enforced at the database boundary (PostgreSQL RLS) and command transactions using deny-by-default and additive union multi-role evaluation.

---

## Technical Context

**Language/Version**: TypeScript 5.8 / Node.js >= 22 (ES2023, strict null checks, zero `any`)  
**Primary Dependencies**: React 19, Zustand 5, Immer 11, Zod 3/4, Tailwind CSS 4, shadcn/ui primitives  
**Storage**: PostgreSQL 16 (Supabase), Row-Level Security (RLS), IndexedDB (client persistence cache)  
**Testing**: Vitest 3 (`*.test.ts`), React Testing Library (`*.test.tsx`), Playwright 1.50 (`e2e/*.spec.ts`)  
**Target Platform**: Modern Desktop & Tablet Browsers (Chrome, Safari, Firefox, Edge) + Node.js Serverless runtime  
**Project Type**: Monolith-to-Monorepo Web Application & pure domain TypeScript libraries  
**Performance Goals**: Authorization evaluation < 10ms per check; role/permission administrative update < 500ms  
**Constraints**: Zero UI/DOM/network imports in `src/domain/platform/authorization/`; deny-by-default; strict integer representations; tamper-evident audit logging  
**Scale/Scope**: Multi-tenant support across 10,000+ organizations, up to 50 custom roles per tenant, hundreds of concurrent active projects per organization  

---

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- [x] **I. Architectural Layer Isolation & Bounded Topology**: `src/domain/platform/authorization/` is 100% framework-free TypeScript (zero React/DOM/network imports). ESLint `no-restricted-imports` passes cleanly.
- [x] **II. Single Mutation Path via Command Pattern & Guarded AI Execution**: Role and permission changes execute through typed admin actions; UI changes dispatch commands; AI copilot cannot alter roles or bypass authorization.
- [x] **III. Deterministic Numerical Contracts & Zero Silent Coercion**: Role ranks (1-100) are integer bounded; monetary values in billing/commercial remain integer paise; no silent coercion.
- [x] **IV. Pure Derived Artifacts & Immutable Production Package Snapshots**: Authorization evaluations are pure functions derived from actor context and registry definitions; immutable production package downloads require explicit permissions.
- [x] **V. Manufacturing Traceability, 0-Tolerance Explode & RulePack Governance**: Manufacturing operations (`production.cutlist.download`) are registered and guarded by action permissions.
- [x] **VI. Modular Architecture & Configurable Dynamic Authorization**: Primary focus of this feature. Central `ModuleRegistry`, `PermissionRegistry`, dynamic custom roles, resource scopes, deny-by-default backend enforcement, and full test matrices implemented.
- [x] **VII. Multi-Tenant Isolation, Data Residency & Statutory DPDP Privacy**: All custom roles and member assignments scoped by `org_id` in PostgreSQL with RLS. Client PII permissions (`clients:view_pii`) guarded. Role changes logged to append-only `audit_log`.
- [x] **VIII. Schema Evolution, Migration Immutability & Stable Identifiers**: Relational schema updates added as forward-only migration `00006_dynamic_custom_roles.sql`; entity IDs remain permanent UUIDs.
- [x] **IX. Test-First Quality, Golden Fixtures & Five-Stage Quality Gates**: Comprehensive Vitest unit tests, RTL component tests, and negative RLS authorization integration tests prepared. Full five-stage gate passes.

---

## Project Structure

### Documentation (this feature)

```text
specs/030-centralized-authorization/
├── spec.md              # Feature specification with clarifications and acceptance criteria
├── checklists/
│   └── requirements.md  # Quality validation checklist (16/16 passing)
├── plan.md              # Implementation plan (this document)
├── research.md          # Technical research and architecture decisions
├── data-model.md        # Domain schemas and PostgreSQL relational models
├── quickstart.md        # Step-by-step runnable validation guide
├── contracts/           # TypeScript interface contracts
│   ├── module-registry.contract.ts
│   ├── authorization-evaluator.contract.ts
│   └── admin-rbac.contract.ts
└── tasks.md             # Sequential implementation tasks (/speckit-tasks output)
```

### Source Code Layout

```text
src/
├── domain/
│   └── platform/
│       └── authorization/
│           ├── types.ts                    # Zod schemas, ModuleDefinition, PermissionDefinition, Scope types
│           ├── moduleRegistry.ts           # Central ModuleRegistry with topological cycle detection
│           ├── moduleRegistry.test.ts      # Unit tests for module & capability registration
│           ├── evaluator.ts                # Pure evaluateAuthorization() with additive union scope resolution
│           ├── evaluator.test.ts           # Exhaustive unit test matrix (positive & negative scenarios)
│           ├── adminRoleService.ts         # Pure domain service for custom role lifecycle and validation
│           └── adminRoleService.test.ts    # Unit tests for role creation, cloning, and safety guards
├── state/
│   ├── authorizationStore.ts               # Zustand store for client-side active permissions and cache
│   └── authorizationStore.test.ts          # State store unit tests
├── features/
│   ├── table-editor/
│   │   ├── RoleManagementPanel.tsx         # Admin UI for creating, cloning, and editing custom roles
│   │   ├── RoleManagementPanel.test.tsx    # RTL component tests for role administration
│   │   ├── PermissionMatrixGrid.tsx        # Module-grouped capability matrix with scope selectors
│   │   └── PermissionMatrixGrid.test.tsx   # RTL component tests for permission assignment
│   └── shared/
│       └── useAuthorize.ts                 # React hook for declarative permission checks & UI guards
└── server/
    └── authorizationMiddleware.ts          # Server-side API & RPC request authorization guard

supabase/
└── migrations/
    └── 00006_dynamic_custom_roles.sql      # PostgreSQL migration: custom roles, scopes, updated authorize()
```

---

## Complexity Tracking

> **Constitution Check has zero violations. No exceptions required.**

| Violation | Why Needed | Simpler Alternative Rejected Because |
| :--- | :--- | :--- |
| *None* | Fully aligned with Constitution v2.1.0 | N/A |
