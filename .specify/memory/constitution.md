<!--
Sync Impact Report:
- Version change: 2.1.0 → 2.2.0 (MINOR: Added Core Principle X for Multi-Tenant SaaS Architecture, Subscription Entitlements, and Plan-Based Feature Access; established SaaS Access-Control Hierarchy & Unified Policy Evaluation standard; upgraded mandatory feature spec sections to include 8-part SaaS subscription, entitlement, and authorization specification)
- Modified principles: None (Principles I through IX maintained with full fidelity)
- Added principles:
  - Principle X: Multi-Tenant SaaS Architecture, Subscription Entitlements, and Plan-Based Feature Access (NEW: Mandates architectural independence of subscription entitlements from RBAC and tenant isolation, central entitlement registry, capability-based feature keys, usage quotas, explicit subscription lifecycle management, non-destructive downgrade policies, and unified backend-only policy enforcement)
- Added sections & governance requirements:
  - Engineering Standards: SaaS Access-Control Hierarchy & Unified Policy Evaluation Engine
  - Governance Standards: Upgraded mandatory feature specification section: "SaaS Subscription, Entitlement and Authorization Requirements"
  - Constitution Compliance: Extended planning gate checks to cover Core Principles I through X
- Removed sections: None
- Follow-up TODOs: Implement foundational platform feature `031-saas-subscription-entitlements` via Spec Kit SDD lifecycle
-->

# Interior Studio Constitution

## Core Principles

### I. Framework-Free Architectural Layer Isolation & Bounded Topology
`src/domain` and `src/engine` (and sibling domain packages `@studio/core`, `@studio/catalog`, `@studio/measure`, `@studio/commercial`, `@studio/ai`) are strictly framework-free TypeScript libraries. They MUST NEVER import React, Three.js, Zustand, browser DOM APIs (`window`, `document`, `localStorage`), network clients, or any UI code under `src/state`, `src/rendering`, `src/features`, or `src/components`. Dependency direction is strictly downward in a Directed Acyclic Graph (DAG): `features` → `state` → `domain`/`engine`, `features` → `rendering` → `engine` → `domain`, `persistence` → `domain`. Circular dependencies are prohibited. This layer isolation is enforced by ESLint (`no-restricted-imports`) and TypeScript project boundaries.
*Rationale: Guarantees computational determinism, allows core algorithms to execute identically across browser V8, headless Node/Deno servers, and background workers, and keeps the core business logic testable without browser or DOM mocking overhead.*

### II. Single Mutation Path via Command Pattern & Guarded AI Execution
The canonical project state MUST only change through `executeCommand` (`src/domain/commands`). Every inspector property change, catalog placement, grip handle drag, keyboard shortcut, automated script, and AI copilot interaction MUST construct and dispatch typed `DesignCommand`s. Direct in-place mutation of the project object is strictly forbidden. UI-only state shortcuts that bypass domain validation MUST NOT be created. Every command MUST validate against Zod schemas and domain invariants before execution, apply to an Immer draft, and produce an immutable snapshot supporting full undo/redo. AI-assisted operations MUST compile into typed commands and execute through atomic transactions with pre-flight validation, preview diffs, and explicit user confirmation for consequential changes. AI models MUST NEVER directly alter authoritative geometry, bypass construction rules, or override permissions.
*Rationale: Guarantees state validity by construction, ensures complete undo/redo reversibility, eliminates corrupted intermediate states, and prevents AI hallucinations from modifying production designs.*

### III. Deterministic Numerical Contracts & Zero Silent Coercion (Spatial & Commercial)
All real-world dimensions and coordinates within the domain MUST be stored and computed as integer millimetres (`z.number().int()`). Exception: Footprint centroid coordinates ($x, z$) MAY be multiples of 0.5 mm to allow odd-width units to maintain whole-millimetre edge positions. Conversion to 3D world units occurs exclusively at the rendering boundary in `src/rendering/units.ts` ($1\text{ Three.js unit} = 1\text{ metre}$). All commercial monetary values (material unit rates, hardware costs, quote line totals, tax calculations, subscription fees) MUST be stored and calculated as integer paise ($\text{₹}1 = 100\text{ paise}$). Floating-point representation for money is strictly forbidden. Never round, clamp, or silently "fix" invalid measurements or rates: reject unsupported sizes, boundary violations, or invalid inputs with explicit, actionable error messages detailing supported ranges.
*Rationale: Spatial numerical determinism is non-negotiable for factory manufacturing. Commercial integrity requires exact integer arithmetic to eliminate floating-point penny/paise drift across quotes, accounting exports, and tax filings.*

### IV. Pure Derived Artifacts & Immutable Production Package Snapshots
Geometry, 3D meshes, worktops, dimension lines, SVG shop drawings, cutting BOMs, and statutory tax calculations are purely derived from the project state. Never read spatial or configuration data back from Three.js scene graphs, meshes, or DOM elements, and never persist derived artifacts inside the core project document. When a design reaches production freeze or quote issuance, it MUST be snapshotted into an immutable, versioned production package identified by a deterministic SHA-256 hash (`packageHash`). Any subsequent modification to geometry or finishes generates a new, distinct package version, preserving historical auditability and CNC machining repeatability.
*Rationale: Decouples rendering and document generation from source-of-truth state, prevents state desynchronization, and ensures that factory workshops execute exact, tamper-evident design snapshots.*

### V. Manufacturing Traceability, 0-Tolerance Explode & RulePack Governance
Every manufactured component generated by the engine MUST trace to an immutable RulePack (`src/domain/manufacturing/rulePack.ts`). Standard carcass joins, 32mm system boring patterns, drawer slides, hinge drilling coordinates, and edge-banding allowances MUST be deterministically generated by rulepack algorithms with 0 tolerance for unanchored parts. Factory-specific overrides (machine bed kerf, trim margins, minimum part dimensions) MUST be validated through automated readiness checks (`canExportPackage()`). Designs with unresolved collisions, unplaced panels, or invalid hardware drilling MUST be rejected at the production gate with an explanatory defect manifest.
*Rationale: Directly connects visual interior design to CNC machining and panel saws. Guarantees that what is visualized on screen can be fabricated on the factory floor without manual drafting intervention or costly shop-floor errors.*

### VI. Modular Architecture & Configurable Dynamic Authorization
The application MUST follow a modular, capability-driven architecture. Every business module MUST have clearly defined boundaries, responsibilities, interfaces, and dependencies, enabling independent development, testing, maintenance, and evolution without unnecessary coupling.

Every module MUST integrate with a centralized, application-wide authorization framework. Module access and individual operations MUST be governed by dynamically configurable roles and permissions rather than hardcoded role checks or module-specific authorization logic.

Authorized application administrators MUST be able to create and manage custom roles, assign permissions, configure module access, and manage user-role assignments through the application's administrative interface without requiring application code changes. Administrators may configure permissions from the capabilities registered by the application and MUST NOT bypass platform security boundaries. Default built-in system roles (`owner`, `admin`, `designer`, `production`, `viewer`) MUST remain immutable templates and cannot be deleted or directly edited.

Authorization MUST follow least-privilege and deny-by-default principles. Every protected backend API, business operation, and data-access path MUST enforce authorization independently of frontend visibility or navigation restrictions.

Permissions MUST support meaningful action-level access and, where required, resource-level scopes (`all_projects`, `assigned_projects`, `team_projects`, `client_projects`) evaluated via an Additive Union strategy. All modules MUST declare their required permissions and provide authorization tests, including positive and negative access scenarios.

Changes to roles, permissions, and privileged access assignments MUST be auditable. A business module MUST NOT be considered complete until its modular architecture, permission requirements, authorization enforcement, administrative configurability, and access-control tests are implemented and verified.
*Rationale: Prevents monolithic lock-in, eliminates hardcoded permission fragmentation, guarantees enterprise-grade tenant configurability, and ensures that UI hiding is never confused with authoritative backend security.*

### VII. Multi-Tenant Isolation, Data Residency & Statutory DPDP Privacy
All application data MUST be partitioned by tenant (`org_id`). Cross-tenant data access is strictly forbidden and MUST be enforced at the database layer using PostgreSQL Row-Level Security (RLS) policies and STABLE security definer functions, not application-level filters alone. In compliance with India's Digital Personal Data Protection (DPDP) Act 2023, all personally identifiable information (PII)—including client names, phone numbers, email addresses, and site locations—MUST be encrypted at rest, masked in non-privileged UI views, and subject to auditable consent records. All security, commercial, and DPDP actions MUST emit immutable, append-only records to `audit_log` across the 8 standard event families (`auth`, `members`, `clients`, `quotes`, `versions`, `production`, `commercial`, `share_links`).
*Rationale: Protects tenant confidentiality in shared cloud infrastructure, ensures statutory compliance with Indian privacy laws, and provides tamper-evident audit trails for legal and forensic accountability.*

### VIII. Schema Evolution, Migration Immutability & Stable Identifiers
Every persisted data structure change requires an updated Zod schema, a `SCHEMA_VERSION` increment, and an append-only forward migration in `src/domain/project/serialization.ts` (`MIGRATIONS`). Database schema changes MUST be managed through forward-only SQL migration scripts in `supabase/migrations/` with explicit rollback runbooks. Existing migrations are immutable and MUST NEVER be edited. Entity IDs (projects, cabinets, appliances, openings, materials) MUST be permanent and stable across edits: operations MUST modify entities in place and MUST NEVER delete and recreate them, ensuring undo/redo stability and external reference integrity.
*Rationale: Protects existing client designs from corruption across releases, ensures backward compatibility for stored files, and maintains stable object references for drawings, BOMs, and revisions.*

### IX. Test-First Quality, Golden Fixtures & Five-Stage Quality Gates
No feature or bugfix is complete without automated test coverage across appropriate layers:
- Pure domain, geometry, and commercial logic: Vitest unit tests colocated next to code (`*.test.ts`).
- Deterministic calculations and exports: Golden test fixtures asserting exact JSON output and SHA-256 hashes across runtimes.
- Multi-tenant security: Positive and negative RLS authorization tests asserting cross-tenant access rejection.
- UI Components: React Testing Library (`*.test.tsx`).
- End-to-end workflows: Playwright integration tests in `e2e/`, synchronizing on `canvas[data-rendered]`.
Acceptance criteria MUST be documented in `docs/ACCEPTANCE_TESTS.md` with corresponding automated test suites. The Non-Negotiable Five-Stage Quality Gate MUST run and pass cleanly in exact order before merging:
`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
*Rationale: Eliminates regressions, verifies strict typing and lint boundaries, and proves real-world correctness across the entire 3D WebGL and manufacturing stack before deployment.*

### X. Multi-Tenant SaaS Architecture, Subscription Entitlements, and Plan-Based Feature Access
The application MUST be designed as a secure, multi-tenant SaaS platform. Every tenant MUST have an explicit, verifiable identity and an enforceable data-isolation boundary across all application layers, including APIs, databases, storage, caches, background jobs, and integrations.

Subscription entitlements MUST be architecturally independent of user roles and permissions. Subscription plans define the modules, features, capabilities, and usage limits licensed to a tenant. RBAC defines which users within that tenant may exercise those capabilities. Neither mechanism may bypass tenant isolation or the other applicable authorization requirements.

The application MUST provide centralized subscription entitlement management. Modules and capabilities MUST declare their entitlement requirements using stable, registered feature identifiers rather than hardcoded subscription names, plan IDs, or tier-specific conditions.

The platform MUST support configurable subscription plans, feature entitlements, quantitative usage limits, licensed seats, subscription add-ons, and tenant-specific commercial entitlements where required.

Subscription lifecycle transitions, including trials, activation, upgrades, downgrades, payment failures, grace periods, pauses, renewals, and cancellation, MUST follow explicitly defined business policies. Access changes MUST respect their applicable effective dates and billing commitments.

Authorized platform administrators MUST be able to manage the subscription catalog, plans, feature availability, and plan limits without requiring changes to business-module code. Tenant administrators MUST be able to manage users and roles only within the capabilities and limits available to their tenant.

All subscription entitlement checks and quota enforcement MUST be performed on trusted backend boundaries. Frontend feature visibility MUST NOT be considered a security control. Internal feature flags MUST NOT replace subscription authorization.

Tenant-owned data MUST remain isolated across every operation, including asynchronous processing, caching, file storage, reporting, and resource access. Authentication or role authorization alone MUST NOT be treated as proof of tenant isolation.

Changes to subscriptions, entitlements, plan configurations, usage allocations, and administrative overrides MUST be auditable. Entitlement updates MUST be reliable, consistent, and protected against duplicate or out-of-order processing.

New and modified modules MUST explicitly declare their subscription entitlement requirements, applicable usage limits, required RBAC permissions, tenant resource boundaries, lifecycle behavior, and authorization tests.

Subscription downgrades, cancellations, or entitlement removals MUST NOT silently destroy customer data. Data retention, restricted-access, export, and deletion behavior MUST follow documented product policies, contractual obligations, and applicable legal requirements.
*Rationale: Establishes a commercial SaaS foundation that scales to arbitrary plans, usage models, and enterprise contracts without compromising tenant data isolation or embedding commercial pricing logic into business modules.*

## Engineering & Architectural Standards

### Bounded Package Boundaries & Dependency Direction
The project architecture is organized around eight bounded domain packages and two application shells:
- `@studio/core`: Canonical schemas, 32mm system units, Command pipeline, undo/redo snapshots.
- `@studio/platform`: RBAC, multi-tenancy, Razorpay billing, DPDP compliance, append-only audit logging.
- `@studio/catalog`: Parametric module definitions (kitchen, wardrobes, vanity, loose furniture), finishes, hardware.
- `@studio/engine`: Pure geometric kernel: procedural parts, collision, 32mm boring, OptiCut CSV, packageHash.
- `@studio/measure`: Mobile site measurement wizard, ±10mm wall closure diagnostic solver, compass-tagged photos.
- `@studio/commercial`: Indian GST engine (HSN 9403 / SAC 9954), Tally/Zoho accounting CSV, cost-down advisor.
- `@studio/deliverables`: AutoCAD DXF generator, single-module SVG shop drawings, thermal part labels, readiness gates.
- `@studio/ai`: Layout generative solver, voice NL copilot, camera walkthrough script generator.
- `apps/web`: Single-page Vite/React/Three.js desktop & mobile designer application.
- `apps/workers`: Headless background workers (walkthrough video rendering, heavy batch PDF/DXF exports).

### Centralized Module Registry & Authorization Management Architecture
All business modules (Projects, Floor Plans, 2D Design, 3D Design, Furniture Catalog, Materials, Commercial Estimates, Client Deliverables) MUST integrate with a centralized authorization architecture structured as follows:
- **Application Administration:** Administrative UI enabling authorized tenant administrators to manage users, create custom roles, configure resource scopes, and assign registered permissions without code changes.
- **Central Module Registry:** The authoritative catalog of all business modules, features, and capabilities registered by application code.
- **Permission Registry:** Granular action-level permissions registered by modules, with support for resource scopes (`all_projects`, `assigned_projects`, `team_projects`, `client_projects`).
- **RBAC Engine & Central Authorization Service:** Pure domain and backend evaluators assessing `can(actor, org, permission, resourceScope)` with deny-by-default logic on every protected operation.
- **Frontend Presentation Controls:** Dynamic UI navigation, screen availability, and action controls reflecting active user permissions.
- **Backend & Data Access Enforcement:** Authoritative backend API, RPC, and PostgreSQL RLS policy enforcement operating independently of UI state.

### SaaS Access-Control Hierarchy & Unified Policy Evaluation Engine
Access across the multi-tenant platform is governed by a strict five-tier hierarchy evaluated centrally:
1. **Platform Governance:** Defines commercial plans, platform capabilities, and administrative boundaries.
2. **Tenant Subscription:** Determines what the organization has purchased and its applicable limits.
3. **Tenant RBAC:** Determines which organizational users can perform which actions.
4. **Resource Authorization:** Determines which projects, clients, designs, and resources a user can access.
5. **Tenant Isolation:** Ensures that no customer can access another customer's data under any condition.

A protected operation is permitted if and only if all applicable checks succeed simultaneously:
$$\text{AccessAllowed} = \text{TenantValid} \land \text{SubscriptionEntitled} \land \text{RolePermissionGranted} \land \text{ResourceScopeValid} \land \text{UsageWithinLimit} \land \text{ContextualPolicySatisfied}$$

Internal release feature flags MUST remain strictly decoupled from commercial subscription entitlements: feature flags decide whether code is deployed or rolled out; subscription entitlements decide whether a tenant has purchased the capability.

### Commercial & Accounting Integrity
Commercial operations must adhere to Indian statutory standards:
- Tax calculation must separate goods (HSN 9403 at 18% GST) from design/assembly services (SAC 9954 at 18% GST) with support for CGST/SGST (intra-state) and IGST (inter-state).
- Accounting exports must emit standard ERP-compatible CSVs matching Tally Prime and Zoho Books specifications with itemized tax splits and voucher numbers.
- Client-facing presentations and quotes must strictly suppress internal production costs, supplier rates, and studio profit margins.

### UI/UX & Real Controls Standard
Every interactive control in the UI MUST perform a real, working operation:
- Placeholder buttons, dummy toggles, fake telemetry, and non-functional mock controls are strictly prohibited.
- Features not yet implemented MUST be omitted from the UI entirely rather than rendered as disabled stubs with empty handlers.
- UI primitives live in `src/components/ui/` (shadcn/ui style, Tailwind CSS tokens from `src/app/index.css`).

### The Five-Stage Non-Negotiable Quality Gate
Every commit, pull request, and deployment must pass all five stages in exact order:
1. `npm run lint` — ESLint passes with zero warnings or errors. Enforces `no-restricted-imports`.
2. `npm run typecheck` — TypeScript compiler (`tsc --noEmit`) passes with zero type errors in strict mode.
3. `npm test` — Vitest unit and integration tests pass (100% test passing rate).
4. `npm run build` — Production Vite bundle builds without errors or missing chunk dependencies.
5. `npm run e2e` — Playwright end-to-end integration tests pass, synchronizing on `canvas[data-rendered]`.

### Golden Fixtures & Security Verification
Critical subsystems require golden fixture regression tests:
- HSN/SAC GST calculations (`src/domain/commercial/gst.golden.json`).
- OptiCut CSV output and packageHash calculation (`src/engine/manufacturing/opticut.golden.csv`).
- PostgreSQL Row-Level Security policies tested against simulated tenant cross-access attempts.

## Governance & Engineering Rules

### Authority & Supremacy
This constitution is the supreme architectural document for the Interior Studio repository. It supersedes all informal design notes, PRD drafts, and agent instructions. Coding agents (Claude Code, GitHub Copilot, Codex, Antigravity) and human engineers MUST comply with every principle herein. No shortcut, prototype exception, or emergency patch may bypass these rules without an explicit, ratified constitutional amendment.

### Spec-Driven Development (SDD) Lifecycle
All non-trivial feature development MUST follow the GitHub Spec Kit lifecycle:
1. `/speckit-specify`: Create or update feature specification in `specs/NNN-<name>/spec.md`.
2. `/speckit-clarify`: Resolve ambiguous edge cases and requirements before planning.
3. `/speckit-plan`: Generate architecture blueprint, data models, contracts, and quickstart in `design.md`.
4. `/speckit-tasks`: Decompose the plan into dependency-ordered, testable tasks in `tasks.md`.
5. `/speckit-analyze`: Non-destructive cross-artifact consistency analysis.
6. `/speckit-implement`: Implement tasks sequentially with test-driven discipline.
7. `/speckit-converge`: Verify implementation completeness against the spec and capture follow-ups.

### Mandatory Feature Spec Section: SaaS Subscription, Entitlement and Authorization Requirements
Every future feature specification (`specs/NNN-<name>/spec.md`) created via `/speckit-specify` MUST include a dedicated **SaaS Subscription, Entitlement and Authorization Requirements** section answering:
1. **Module Registration:** Module identifier, parent module, module capabilities, dependencies.
2. **Subscription Entitlement Requirements:** Required entitlement identifiers, plans that include this capability, available add-ons, feature availability conditions.
3. **Usage and Commercial Limits:** Applicable quotas, seat requirements, usage measurement, monthly reset rules, behavior when limits are reached, overage or upgrade behavior.
4. **RBAC Requirements:** Required action permissions, applicable system and custom roles, resource-level permissions, administrative management requirements.
5. **Multi-Tenant Requirements:** Tenant-owned resources, tenant isolation boundaries, storage and cache isolation, background worker tenant context.
6. **Subscription Lifecycle Behavior:** Trial behavior, upgrade behavior, downgrade behavior, payment failure behavior, cancellation and expiration behavior, existing customer data preservation.
7. **Enforcement Requirements:** Frontend visibility and interaction rules, backend/API authorization guards, background worker enforcement, quota reservation/enforcement, audit requirements, entitlement cache invalidation.
8. **Acceptance Criteria and Security Tests:** Included-plan access tests, excluded-plan denial tests, RBAC permission tests, tenant isolation tests, quota boundary tests, concurrent usage tests, subscription transition tests.
Specifications lacking this section MUST NOT pass the `/speckit-plan` Constitution Check.

### Constitution Compliance & Planning Checks
Every technical plan (`design.md` or `plan.md`) MUST include a Constitution Check section evaluating the proposed architecture against Core Principles I through X. Any planned deviation requires an explicit, justified exception approved prior to implementation.

### Exception Management
Architectural exceptions must be documented in an Architecture Decision Record (ADR) under `docs/` or within the feature's `design.md`. The exception record MUST identify:
- The specific Core Principle(s) affected.
- Detailed technical rationale and justification.
- The precise scope and boundary of the exception.
- The accountable engineering owner.
- An expiration milestone or review condition.
Undocumented or permanent unmanaged exceptions are strictly prohibited.

### Amendment Procedure & Versioning Policy
Amendments to this constitution must be proposed with a clear engineering rationale and ratified through team review. Constitution versioning adheres to Semantic Versioning:
- **MAJOR (X.0.0)**: Backward-incompatible governance changes, removal or fundamental redefinition of Core Principles.
- **MINOR (x.Y.0)**: Addition of a new Core Principle, introduction of new architectural standards, or materially expanded governance.
- **PATCH (x.y.Z)**: Non-semantic clarifications, wording precision, typographic corrections, or cross-reference updates.

**Version**: 2.2.0 | **Ratified**: 2026-11-01 | **Last Amended**: 2026-11-02
