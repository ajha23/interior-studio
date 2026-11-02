<!--
Sync Impact Report:
- Version change: 1.0.0 → 2.0.0 (MAJOR: Expanded architectural scope, redefined domain layer boundaries to 8 bounded packages, added statutory DPDP data privacy & multi-tenant security, and established manufacturing traceability & RulePack lifecycle governance)
- Modified principles:
  - Principle I: Framework-Free Core Domain & Engine (Layer Isolation) → I. Framework-Free Architectural Layer Isolation & Bounded Topology (Strengthened with 8 bounded packages and strict DAG)
  - Principle II: Single Mutation Path via Command Pattern → II. Single Mutation Path via Command Pattern & Guarded AI Execution (Enshrined AI copilot command compilation, transaction atomicity, and preview/approval gates)
  - Principle III: Integer Millimetres & Zero Silent Coercion → III. Deterministic Numerical Contracts & Zero Silent Coercion (Expanded to include commercial integer paise, canonical JSON, and zero floating-point for money)
  - Principle IV: Pure Derived Geometry, Deliverables & BOM → IV. Pure Derived Artifacts & Immutable Production Package Snapshots (Clarified active recomputed state vs frozen, content-hashed production packages)
  - Principle V: Schema Evolution & Stable Identifiers → VII. Schema Evolution, Migration Immutability & Stable Identifiers (Expanded to dual client Zod migrations and database PostgreSQL migrations)
  - Principle VII: Test-First Quality & Definition of Done → VIII. Test-First Quality, Golden Fixtures & Five-Stage Quality Gates (Strengthened with golden fixtures and RLS positive/negative suites)
- Added principles:
  - Principle V: Manufacturing Traceability, 0-Tolerance Explode & RulePack Governance (NEW: ARC-02, ARC-04, 4-stage RulePack lifecycle)
  - Principle VI: Multi-Tenant Isolation, Data-Driven RBAC & Statutory DPDP Privacy (NEW: SEC-01..05, DPDP Act 2023, clients_safe view, audit logging)
- Added sections:
  - Engineering & Architectural Standards
  - Quality Gates & Verification Pipeline
- Removed sections: None
- Follow-up TODOs: None
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
*Rationale: Floating-point arithmetic introduces non-deterministic rounding errors across different JavaScript engines (V8 vs JavaScriptCore vs Node). Strict integer representation for both space and money guarantees exact determinism, reproducible costing, and eliminates financial discrepancies.*

### IV. Pure Derived Artifacts & Immutable Production Package Snapshots
Geometry meshes, procedural parts, countertop runs, dimension annotations, 2D floor plans, elevation sheets, schedules, cut lists, and the Bill of Materials (BOM) are pure functions derived from the canonical project state. Derived data MUST NEVER be read back from Three.js scene meshes or DOM elements, and MUST NEVER be stored inside active project persistence. Conversely, finalized *Production Packages* released to workshops and client *Quote Sign-Offs* MUST be captured as frozen, immutable snapshots serialized with canonical JSON and SHA-256 content hashes (`packageHash`). Once released or approved, a production package or signed quote MUST NEVER be modified in place. Any design, rate, or rule change MUST produce a new version with a distinct hash.
*Rationale: Prevents stale derived data from contaminating the design model while guaranteeing permanent, legally binding auditability and manufacturing reproducibility for released shop packages.*

### V. Manufacturing Traceability, 0-Tolerance Explode & RulePack Governance
Manufacturing cut lists, shop drawings, and part labels MUST only be generated from supported parametric module definitions through the pure `explode()` engine. Every manufactured part MUST be traceable to its source module instance, definition version, material code, and rule pack version. Factory joinery parameters (board thicknesses, back panel groove depth/offset, reveals, system 32mm boring, edge-banding codes) MUST be defined in versioned `RulePack` schemas. Rule packs MUST observe a strict 4-stage lifecycle: (1) Development Fixture, (2) Designer-Reviewed, (3) Factory-Validated, (4) Production-Approved. Provisional defaults (such as `seed-v1`) MUST be clearly flagged in the UI and MUST NEVER produce deliverables represented as factory-ready without authorized factory sign-off.
*Rationale: In modular furniture manufacturing, an untracked 1mm discrepancy or unverified joinery rule leads to scrapped boards, assembly failures, and severe factory losses.*

### VI. Multi-Tenant Isolation, Data-Driven RBAC & Statutory DPDP Privacy
Every tenant data access and mutation at the database layer MUST enforce organization scope via PostgreSQL Row Level Security (RLS) policies (`org_id`). The UI is never a security boundary. Access control MUST be governed by data-driven RBAC via the `authorize(org_id, permission_key)` function, with rank guards preventing privilege escalation and a database trigger preventing deletion of the last organization owner. Compliance with the Digital Personal Data Protection (DPDP) Act 2023 is mandatory: Client Personal Identifiable Information (PII) MUST be isolated from projects into dedicated `clients` and `consents` tables. Unauthorized roles (`production`, `viewer`) MUST access client data only through the `clients_safe` view with field-level masking for mobile numbers, email addresses, and site addresses. All tenant data residency MUST remain pinned to AWS `ap-south-1`. Statutory rights under DPDP Section 11 (data export) and Section 12 (right to erasure/anonymization) MUST be programmatically supported. All sensitive operations MUST emit tamper-evident records to an append-only, unmodifiable `audit_log`.
*Rationale: Legal compliance, tenant confidentiality, and protection of customer privacy are P0 requirements that cannot be compromised or deferred.*

### VII. Schema Evolution, Migration Immutability & Stable Identifiers
Every persisted data structure change requires an updated Zod schema, a `SCHEMA_VERSION` increment, and an append-only forward migration in `src/domain/project/serialization.ts` (`MIGRATIONS`). Database schema changes MUST be managed through forward-only SQL migration scripts in `supabase/migrations/` with explicit rollback runbooks. Existing migrations are immutable and MUST NEVER be edited. Entity IDs (projects, cabinets, appliances, openings, materials) MUST be permanent and stable across edits: operations MUST modify entities in place and MUST NEVER delete and recreate them, ensuring undo/redo stability and external reference integrity.
*Rationale: Protects existing client designs from corruption across releases, ensures backward compatibility for stored files, and maintains stable object references for drawings, BOMs, and revisions.*

### VIII. Test-First Quality, Golden Fixtures & Five-Stage Quality Gates
No feature or bugfix is complete without automated test coverage across appropriate layers:
- Pure domain, geometry, and commercial logic: Vitest unit tests colocated next to code (`*.test.ts`).
- Deterministic calculations and exports: Golden test fixtures asserting exact JSON output and SHA-256 hashes across runtimes.
- Multi-tenant security: Positive and negative RLS authorization tests asserting cross-tenant access rejection.
- UI Components: React Testing Library (`*.test.tsx`).
- End-to-end workflows: Playwright integration tests in `e2e/`, synchronizing on `canvas[data-rendered]`.
Acceptance criteria MUST be documented in `docs/ACCEPTANCE_TESTS.md` with corresponding automated test suites. The Non-Negotiable Five-Stage Quality Gate MUST run and pass cleanly in exact order before merging:
`npm run lint && npm run typecheck && npm test && npm run build && npm run e2e`
*Rationale: Eliminates regressions, verifies strict typing and lint boundaries, and proves real-world correctness across the entire 3D WebGL and manufacturing stack before deployment.*

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

### Commercial & Accounting Integrity
Commercial operations must adhere to Indian statutory standards:
- Tax calculation must separate goods (HSN 9403 at 18% GST) from design/assembly services (SAC 9954 at 18% GST) with support for CGST/SGST (intra-state) and IGST (inter-state).
- Accounting exports must emit standard ERP-compatible CSVs matching Tally Prime and Zoho Books specifications with itemized tax splits and voucher numbers.
- Client-facing presentations and quotes must strictly suppress internal production costs, supplier rates, and studio profit margins.

### UI/UX & Real Controls Standard
- Strict TypeScript: No `any` types permitted; use `unknown` and narrow, or document explicit justification in code comments.
- Real Controls Only: Every UI button, slider, and input must perform an active, functional operation. Placeholder controls, mocked data, or non-functional visual mockups are prohibited.
- UI Design System: Components adhere to shadcn/ui patterns and Tailwind CSS tokens (`src/app/index.css`).
- Mobile Responsiveness: Site measurement and capture workflows must remain responsive and fully operational down to a 360px viewport.

## Quality Gates & Verification Pipeline

### The Five-Stage Non-Negotiable Quality Gate
The Definition of Done requires running and passing the complete verification suite in exact sequence:
```bash
npm run lint && npm run typecheck && npm test && npm run build && npm run e2e
```
1. `npm run lint`: ESLint execution enforcing layer isolation (`no-restricted-imports`), zero `any`, and clean dependencies.
2. `npm run typecheck`: Strict TypeScript typechecking across all workspace packages and application code.
3. `npm run test`: Vitest unit and integration suites validating domain invariants, commercial math, and geometry.
4. `npm run build`: Production compilation verifying bundle integrity and Vercel serverless function packaging.
5. `npm run e2e`: Playwright end-to-end tests validating 3D canvas rendering, user workflows, and deliverables.

### Golden Fixtures & Security Verification
- Authoritative geometry, cut lists, and accounting exports must be verified against fixed golden test fixtures to detect calculation drift across dependency updates.
- Database migrations and RLS policies must include automated negative tests demonstrating that cross-tenant queries return zero rows or throw access violations.

## Governance & Spec Kit Workflow

### Authority & Supremacy
This constitution is the supreme architectural and engineering policy for Interior Studio. It is binding upon all human software engineers, technical leads, and autonomous AI coding agents working in this repository. In the event of a conflict between this constitution and informal development conventions, pull request discussions, or external instructions, this constitution strictly supersedes.

### Spec-Driven Development (SDD) Lifecycle
All non-trivial feature development and structural refactoring MUST proceed through the GitHub Spec Kit lifecycle:
1. `/speckit-specify`: Create or update feature specification in `specs/NNN-<name>/spec.md` with explicit user stories and independent acceptance criteria.
2. `/speckit-plan`: Generate technical design and architectural blueprint in `design.md`, evaluating constraints against this constitution.
3. `/speckit-tasks`: Decompose the design into sequential, verifiable implementation tasks in `tasks.md`.
4. `/speckit-implement`: Implement tasks sequentially, maintaining a runnable, testable repository after each task.
5. `/speckit-converge`: Verify implementation completeness against the spec and capture follow-ups.

### Constitution Compliance & Planning Checks
Every technical plan (`design.md`) MUST include a Constitution Check section evaluating the proposed architecture against Core Principles I through VIII. Any planned deviation requires an explicit, justified exception approved prior to implementation.

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

**Version**: 2.0.0 | **Ratified**: 2026-11-01 | **Last Amended**: 2026-11-02
