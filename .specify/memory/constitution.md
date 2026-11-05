<!--
Sync Impact Report:
- Version change: 2.2.0 → 2.3.0 (MINOR: two Core Principles added; Definition of Done, branching
  rule and SaaS-section exemption added to Governance. No principle removed or redefined.)
- Rationale: Features 034.1 to 034.2.2 hardened a cloud path that production never ran (no
  sign-in, unapplied migrations, completion reports accepted as evidence). These rules make that
  impossible to repeat. Source: specs/040-freeze-and-decide/spec.md (FR-010 to FR-014).
- Modified principles:
  - IX. Test-First Quality, Golden Fixtures & Five-Stage Quality Gates: the five-stage gate is now
    stated as necessary but not sufficient; completion is decided by the Definition of Done.
- Added principles:
  - XI. The Database Is the Security Boundary
  - XII. Official Clients, No Hand-Written Security Code
- Added sections & governance requirements:
  - Governance: Definition of Done (Evidence, Not Reports)
  - Governance: Branching & Trunk Rule
  - Mandatory Feature Spec Section: "Not applicable: foundation spec" exemption for items 1-4, 6
    and 7; item 8 never optional
  - Constitution Compliance: planning checks extended to Core Principles I through XII
- Removed sections: None
- Dependent files updated: AGENTS.md, CLAUDE.md (rules mirrored)
- Templates: .specify/templates/* read the constitution at runtime; no change required. The plan
  template's Constitution Check should list principles XI and XII when next regenerated.
- Follow-up TODOs:
  - "Bounded Package Boundaries" describes eight packages that are 8-18 line stubs today; the
    foundation plan (spec 053, review "Repository" decision) collapses them into one package.
    Revisit that section in a later amendment once the repository restructure lands.
  - The database CI job that makes the Definition of Done checkable arrives in spec 048; until
    then, migrations are applied with `npm run db:reset` and `npm run db:test` (spec 041).
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
Passing this gate is necessary but not sufficient: a feature is complete only when it meets the Definition of Done (Evidence, Not Reports) in Governance.
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

### XI. The Database Is the Security Boundary
Postgres decides every read and write; no other layer authorizes.
- Every table in the `public` schema MUST have row-level security enabled and policies covering `select`, `insert`, `update` and `delete`. A table without RLS MUST fail CI.
- Tenant isolation MUST be decided by Postgres policies and RPCs using `auth.uid()`. Browser permission checks only decide what to show; they MUST NEVER authorize.
- Every `SECURITY DEFINER` function MUST set `search_path = ''` and use schema-qualified names, and `EXECUTE` MUST be revoked from `public`, `anon` and `authenticated` before it is granted to the one role that needs it.
- User-facing RPCs MUST NEVER accept an actor id or trust a service role. Privileged server work MUST use its own narrow function, granted only to the role that runs it.
- Every schema change MUST ship in the same pull request as pgTAP tests proving: own studio allowed, other studio denied, anonymous denied.
*Rationale: One enforcement point that every client (web, mobile capture, worker, AI functions) passes through, and that can be proven by tests. Features 034.1 to 034.2.2 placed authorization in browser and server code that production never executed; policies in the database cannot be bypassed that way.*

### XII. Official Clients, No Hand-Written Security Code
- Browser and server code MUST talk to Supabase only through `@supabase/supabase-js`. Hand-rolled HTTP clients for Supabase are prohibited.
- Tokens MUST be verified with Supabase's JWKS (`auth.getClaims` or the `jose` library). Hand-written JWT, HMAC or other cryptographic code is prohibited.
- Default user, studio or organisation ids MUST NOT exist outside test fixtures. Every actor and studio comes from a verified session and a database membership.
*Rationale: The hand-built client sent the anon key as the bearer token, so `auth.uid()` was always null, and the custom JWT verifier guarded no handler. Official clients get identity right by default; security code written by hand is where those gaps came from.*

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

Foundation and infrastructure specifications MAY answer items 1 to 4, 6 and 7 with "Not applicable: foundation spec" followed by one sentence of reason. Item 5 MUST state the tenant boundary whenever the spec touches tenant data. Item 8 (tenant isolation and security tests) is never optional and MUST NOT be answered "Not applicable".

### Constitution Compliance & Planning Checks
Every technical plan (`design.md` or `plan.md`) MUST include a Constitution Check section evaluating the proposed architecture against Core Principles I through XII. A plan that adds a custom API server, a hand-written Supabase client, or hand-written authentication or cryptographic code MUST be rejected. Any planned deviation requires an explicit, justified exception approved prior to implementation.

### Definition of Done (Evidence, Not Reports)
A feature is done when all of the following hold:
1. Its pull request is merged to `main` with green CI.
2. CI applied its migrations to a fresh local Supabase and ran its pgTAP policy tests.
3. A person signed into the Vercel preview and used the feature.
Reported command output, pasted test summaries and completion reports are not evidence. The evidence is the link to the CI run and the preview URL, both recorded in the pull request. A task MUST NOT be marked complete without the exact commands run and their output.

### Branching & Trunk Rule
`main` is the only long-lived branch and is always deployable. Feature branches MUST live at most 3 days and merge only to `main`. Spec, code and tests land together in one pull request; spec-only branches and secondary integration branches are prohibited. Work not finished within 3 days is split into smaller slices.

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

**Version**: 2.3.0 | **Ratified**: 2026-11-01 | **Last Amended**: 2026-11-05
