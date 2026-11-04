# MASTER PROMPT: Create Interior Studio PRD v2.1 — Consolidated Product, Architecture & Delivery Specification

## 1. Role and mission

Act as a **Principal Product Manager, Staff/Principal Software Architect, Interior Design Domain Expert, Furniture Manufacturing Systems Architect, Security Architect, and Technical Program Manager**.

Your task is to produce a complete, implementation-ready **Interior Studio Product Requirements Document v2.1**, using the existing PRD v2 and the Executive Architectural Review of PRD v2 as the primary source materials.

This is a consolidation and gap-closure exercise, not a greenfield rewrite.

The resulting PRD must be sufficiently specific that a software engineering team can translate its requirements into architecture decision records (ADRs), database migrations, API contracts, implementation tickets, automated tests, and release gates without repeatedly rediscovering product decisions.

Do not merely recommend improvements. Convert accepted improvements into explicit, testable requirements.

## 2. Source documents and authority

Read and analyze the complete contents of these source documents before drafting:

1. **Interior Studio — Product Requirements Document v2.pdf**
   - The baseline product specification and primary source of truth.
   - Contains meeting decisions, requirements, priorities, acceptance criteria, current application details, data model, security, manufacturing, costing, and implementation phases.

2. **Executive Architectural Review of PRD v2** (provided as Pasted text(1).txt)
   - Contains proposed architecture corrections, monorepo boundaries, deterministic calculation requirements, database design recommendations, security hardening, and implementation sequencing.

Use the following source hierarchy:

1. Explicit meeting-established decisions in PRD v2.
2. Existing testable requirements and confirmed application behavior.
3. Architectural-review recommendations that do not conflict with established decisions.
4. Derived requirements necessary for correctness, security, usability, maintainability, and production readiness.
5. Unresolved assumptions requiring product-owner, designer, or factory confirmation.

Preserve the source provenance tags:

- `[M]` — Established in meeting notes.
- `[D]` — Derived requirement or engineering recommendation.
- `[V]` — Requires validation or an explicit business decision.

Do not silently convert `[V]` into `[M]`. Do not represent a proposed architecture as already implemented. Distinguish current state, target state, decisions, assumptions, and open questions.

Where sources conflict, document the conflict and resolve it explicitly where the evidence supports a decision. Otherwise, mark it as an open decision with an owner, impact, and deadline or implementation gate.

## 3. Product context

Product name: **Interior Studio**

Repository: `ajha23/interior-studio`

Backend: Supabase/PostgreSQL

Current deployment region: `ap-south-1`

Initial users: approximately 2–5 interior designers and associated studio staff.

The product must evolve from a visual interior-design application into a reliable **design-to-manufacture workflow system**.

A single approved design should produce consistent, traceable outputs for:

- Client-facing 3D presentations.
- Accurate, dimensioned 2D floor plans and elevations.
- Furniture and cabinet schedules.
- Materials and hardware bills of materials.
- Cost estimates and client quotations.
- Manufacturing parts and cut lists for supported construction methods.
- Part labels, edge-banding schedules, and hardware schedules.
- Shop drawings and other supported production documents.
- Versioned approvals and a traceable audit history.

The same underlying design data must drive these outputs. Independently maintained representations that can silently contradict one another are not acceptable.

### Product scope beyond kitchens

Preserve the kitchen-to-manufacturing vertical slice as the first production milestone, but make the overall product roadmap explicitly support:

- Complete residential interiors.
- Modular kitchens.
- Wardrobes and storage systems.
- TV units and wall-mounted cabinetry.
- Beds, dining tables, and other custom furniture.
- Loose furniture that can be represented visually without necessarily having a supported manufacturing specification.
- Commercial layouts such as conference rooms, washrooms, and restaurants.
- Plumbing, electrical, and other MEP elements where included in the approved roadmap.

Do not force every furniture type into the kitchen cabinet construction model. Separate visual modeling capability from validated manufacturing capability.

## 4. Required output

Produce a new document titled:

**Interior Studio — Product Requirements Document v2.1: Consolidated Product and Engineering Specification**

The document must be complete, coherent, version-controlled, and detailed enough for implementation.

Include:

- Version and change history.
- Executive summary.
- Source-of-truth and provenance rules.
- Product vision, goals, and measurable outcomes.
- Current-state assessment and target-state architecture.
- User personas, permissions, and workflows.
- Product scope, exclusions, and phased roadmap.
- Functional and non-functional requirements.
- Data model and state transitions.
- Architecture decisions and package boundaries.
- Manufacturing and costing correctness rules.
- Security, privacy, and auditability.
- UI/UX and 2D/3D editing behavior.
- AI-agent behavior and approval controls.
- APIs, data contracts, export formats, and integrations.
- Testing strategy and measurable acceptance criteria.
- Migration and backward-compatibility strategy.
- Implementation phases, dependencies, and release gates.
- Requirement traceability matrix.
- Gap-resolution log and open-decision register.

Do not omit requirements simply because they are difficult or not part of the first release. Assign them to a phase, mark them as deferred, and explain the dependency.

## 5. Consolidation and gap-analysis instructions

Create a requirement-by-requirement comparison of the existing PRD and the architectural review.

For each gap, identify:

- Gap ID.
- Existing PRD section or requirement ID.
- Issue or contradiction.
- Why it matters.
- Decision: accept, modify, defer, reject, or needs validation.
- Updated requirement or ADR.
- Priority.
- Owner.
- Acceptance test.
- Implementation phase.

Retain existing requirement IDs wherever possible. Introduce new stable IDs for new requirements and maintain a mapping from previous IDs to v2.1 IDs.

Do not renumber requirements merely to make the document look cleaner.

## 6. Mandatory architectural resolutions

### ARC-01: Monorepo structure and dependency boundaries

Resolve the package-count inconsistency.

Adopt **eight bounded domain packages** unless the source evidence demonstrates a compelling reason not to:

- `@studio/core`
- `@studio/platform`
- `@studio/catalog`
- `@studio/engine`
- `@studio/measure`
- `@studio/commercial`
- `@studio/deliverables`
- `@studio/ai`

Place billing under `@studio/platform/billing`; do not introduce an unexplained ninth package.

Propose a workspace structure using pnpm and Turborepo, with the existing web application and background workers as separate applications.

Define dependency rules, ownership, import restrictions, test responsibilities, and CI enforcement.

The engine must remain pure: no database access, browser UI dependencies, network calls, filesystem access, or uncontrolled clock dependencies.

Do not split the system into microservices without a demonstrated operational or scaling need. Prefer a modular monolith plus asynchronous workers initially.

### ARC-02: Production-package storage and immutability

Evaluate the proposed immutable production-package snapshot.

The default design should use a canonical, schema-versioned production package containing structures such as:

- `parts[]`
- `hardware[]`
- `edge_band_summary`
- Source design version.
- Module-definition versions.
- Rule-pack version.
- Material and hardware catalog versions.
- Costing input/version references where applicable.
- Generation metadata.
- Validation results.
- Canonical content hash.

Store the immutable package snapshot as JSONB with a SHA-256 digest, provided this satisfies the querying, audit, storage, and performance requirements.

Do not automatically normalize every manufactured part into an independently mutable row. Evaluate relational child tables only where required for traceability, filtering, reporting, inventory, or operational queries.

If child tables are selected, justify the trade-off and define indexing and partitioning strategy.

Define canonical serialization, schema evolution, package immutability, and reproducibility.

Changing a design or rule pack must create a new package. It must never silently mutate a package already approved or downloaded for production.

### ARC-03: Deterministic geometry and manufacturing calculations

Define a deterministic numerical contract for all authoritative geometry, part generation, material quantities, pricing, and manufacturing calculations.

Integer micrometres or another documented fixed-point representation may be used for dimensions. However, do not assume integer storage alone guarantees deterministic results.

Specify:

- Internal dimension precision.
- Fixed-point scaling and arithmetic rules.
- Integer division behavior.
- Rounding rules and the stage at which rounding occurs.
- Decimal or fixed-point arithmetic for money and tax.
- Treatment of angles, trigonometry, areas, and volume calculations.
- Canonical JSON serialization.
- Hash generation.
- Overflow and invalid-input behavior.
- Deterministic ordering of generated parts.
- Versioning of calculation algorithms.

The browser may run a preview calculation, but the server-generated production package must be authoritative.

Create golden test fixtures that run against the supported browser and server runtimes, including Chromium and Node/Deno where applicable.

For identical canonical inputs and engine/rule versions, require identical canonical outputs and hashes. If a calculation cannot meet this contract, explicitly isolate it from authoritative manufacturing output.

### ARC-04: Factory rule packs and provisional defaults

Do not block software development while factory-specific specifications are being collected.

Implement versioned `RulePack` schemas and configurable CSV export profiles early. Seed provisional fixture data only to support development and automated testing.

The architectural review mentions examples such as:

- Base module: 720 × 560 mm.
- Board thickness: 18 mm.
- Reveal/gap: 3 mm.
- OptiCut-compatible CSV profile.

Treat these strictly as **unvalidated example fixtures**, not approved universal manufacturing rules.

The PRD must distinguish:

1. Development fixture.
2. Designer-reviewed rule pack.
3. Factory-validated rule pack.
4. Production-approved rule pack.

A provisional rule pack must never produce an export represented as factory-ready.

Require authorized sign-off for manufacturing-critical values, including board thicknesses, edge-band deductions, joinery, clearances, reveals, hardware rules, construction methods, saw/export column mapping, and unit conventions.

Define how a new rule-pack version affects existing designs, quotes, approvals, and production packages. Existing approved packages must remain reproducible.

### ARC-05: Entitlements and usage counters

Separate low-frequency entitlement configuration from high-frequency usage metering.

- Static entitlements should change when the plan or an authorized override changes.
- Usage counters must support atomic concurrent updates.
- Enforce limits in the authoritative backend, not only in the frontend.
- Define behavior when usage is exhausted, requests race, a plan is downgraded, or a request is retried.
- Make metering idempotent where duplicate execution could cause incorrect charging or usage.
- Do not rebuild entitlement snapshots on every usage-counter update.

Billing implementation must not delay the internal product's core design-to-manufacture workflow.

### ARC-06: Dependency boundaries and engineering governance

Define:

- Package dependency graph.
- ESLint or equivalent boundary enforcement.
- Migration ownership and review.
- Architecture decision record format.
- CI checks for schema migrations and engine changes.
- Golden-fixture test triggers.
- Database migration and rollback policy.
- API and schema compatibility expectations.

Avoid duplicating responsibilities between catalog, measurement, geometry, commercial calculations, and deliverables.

## 7. Product and interaction requirements

### UX-01: One canonical design model

Define the canonical project, room, geometry, furniture-instance, module-definition, material, finish, and construction-rule model.

Explain how 2D, 3D, elevations, BOM, quotes, and manufacturing packages derive from it.

Every derived artifact must identify the source design version and relevant rule/catalog versions.

### UX-02: Measurement-first design workflow

Support manual site measurements and document the required fields, units, validation, and uncertainty handling.

Include:

- Wall lengths and heights.
- Ceiling height and irregularities.
- Doors and windows.
- Columns, beams, niches, and obstructions.
- Plumbing and electrical points where relevant.
- Appliance and fixture dimensions.
- Photographs and notes.
- Measurement source, timestamp, author, and confidence where applicable.

Support mm, cm, and feet/inches with explicit conversion and rounding behavior.

Distinguish measured, inferred, and assumed dimensions. Show unresolved discrepancies and never silently convert assumptions into verified measurements.

Define room-closure validation, including the existing ±10 mm target if confirmed by the source requirements, with an explicit override path and audit trail.

### UX-03: Parametric modules

Preserve the versioned parametric module library.

Specify module families, permitted dimensional ranges, increments, construction methods, material rules, hardware slots, internal layouts, and validation.

Support layout solving for the approved kitchen arrangements: straight, L, U, parallel, island, and peninsula, subject to implementation scope.

Define deterministic snapping, filler generation, corner alternatives, appliance clearances, collision detection, and unsupported configurations.

A module instance must reference a specific definition version. Updating the library must not silently rewrite existing instances.

### UX-04: Complete interior and custom furniture modeling

Separate these capabilities:

- Visual-only object.
- Dimensioned editable furniture object.
- Parametric module.
- Manufacturing-supported module.
- Production-approved module.

A sofa or decorative item may be represented visually without generating a cut list.

Only explicitly supported construction templates may generate manufacturing packages.

List the initial furniture families included in each release. Do not claim universal carpenter-ready generation.

### UX-05: 2D/3D editing parity

Define the editing contract for both plan and 3D views.

Include:

- Selection, movement, rotation, resizing, and snapping.
- Direct numeric dimension entry.
- Property-panel editing.
- Multi-selection where supported.
- Undo/redo.
- Version history and recovery.
- Constraint-aware updates.
- Cross-view synchronization.
- Material and finish changes.
- Collision and clearance feedback.

Specify which properties can be edited directly, which are derived, and which require a construction-rule recalculation.

A change in one view must update the other views and derived artifacts from the same canonical model. Invalid changes must be rejected or clearly represented as unresolved.

### UX-06: Rendering quality

Define measurable acceptance criteria for visual quality rather than using terms such as “photorealistic” or “production grade” without verification.

Cover:

- Lighting and shadows.
- Material and texture fidelity.
- Camera controls and saved viewpoints.
- Door and drawer interaction.
- Rendering responsiveness.
- Representative reference scenes.
- Screenshot-based visual regression where appropriate.
- Performance on documented target hardware.

Specify benchmark scenes and define acceptable visual defects and frame-rate/latency targets after establishing the target device profile.

Do not claim a specific quality or performance result without a test plan.

### UX-07: Design approval and invalidation

Define explicit lifecycle states for drafts, client presentation, quote approval, design approval, production validation, production release, and installation completion.

Document which changes invalidate:

- Client approval.
- Quotes.
- Manufacturing checks.
- Generated production packages.
- Technical drawings.
- Cost calculations.

Approval must be tied to immutable versions. Any subsequent change must create a new version and clearly indicate which approvals or artifacts are no longer current.

## 8. Manufacturing and costing requirements

### MFG-01: Deterministic manufacturing engine

Generate manufacturing output only from approved, supported module definitions and validated construction rule packs.

Each part must be traceable to:

- Source project and design version.
- Module instance and definition version.
- Construction rule and rule-pack version.
- Material and thickness.
- Finished dimensions.
- Cut dimensions.
- Edge-banding requirements.
- Grain/orientation requirements where applicable.
- Required hardware.
- Generation algorithm version.

Specify handling of fillers, corner units, panels, plinths, back panels, worktops, doors, drawers, and appliance housings according to approved construction templates.

Do not invent factory-specific deductions or joinery conventions.

### MFG-02: Production readiness gate

Define machine-enforced checks for:

- Missing construction methods.
- Unapproved rule packs.
- Invalid dimensions.
- Unsupported module families.
- Missing materials or hardware.
- Inconsistent module references.
- Clearance and collision errors.
- Missing required manufacturing attributes.
- Stale design versions.
- Invalid or missing export profiles.

Separate blocking errors from warnings.

Only a production-approved design with a validated rule pack and passing mandatory checks may generate a package labelled factory-ready.

### MFG-03: Manufacturing exports

Specify and version:

- Cut-list CSV.
- Hardware list.
- Edge-banding schedule.
- Part labels.
- Cabinet/module schedule.
- Dimensioned plan and elevations.
- Supported shop drawings.
- External nesting/optimisation export.

Define units, column mappings, encoding, separators, required fields, filename conventions, schema version, and export-profile validation.

Keep CNC/G-code generation outside the initial scope. The factory's optimiser and CNC software remain authoritative for machine instructions unless a future approved scope change says otherwise.

### COST-01: Reproducible costing

Specify deterministic calculations for materials, hardware, wastage, labour, margins, services, client price, and tax.

Use versioned rate cards and effective dates. Quotes must snapshot their pricing inputs so a later rate change does not change a previously sent quote.

Keep internal cost sheets separate from client-facing quotations. Client exports must not reveal internal cost or margin information.

Require traceability from quote lines back to relevant design elements and pricing rules.

### COST-02: GST and commercial controls

Preserve the existing GST-related requirements as source-derived requirements, but mark all tax rates, HSN/SAC mappings, supply-type classifications, and effective dates for validation by the studio's qualified tax adviser.

Do not independently assert that tax treatment is legally correct.

Support configurable tax codes and effective dates, intra-state versus inter-state calculations where applicable, and a clear indication of the tax assumptions used.

The application must not present itself as a substitute for professional tax advice or a tax-filing system.

## 9. Security, privacy, and auditability

Security and tenant isolation are P0 requirements, not optional later enhancements.

### SEC-01: Tenant isolation

Every tenant-owned record must enforce organization scope at the database boundary.

Specify RLS policies and automated positive and negative tests for each table and relevant operation.

Include tests for cross-tenant reads, writes, updates, deletes, guessed identifiers, unauthorized exports, and share-link access.

The UI must not be treated as a security boundary.

### SEC-02: Role-based authorization

Preserve and clarify the roles defined in the source PRD, including owner, admin, designer, production, viewer, and client guest where applicable.

Create a permission matrix for projects, client PII, catalog, module approval, pricing, quotes, manufacturing packages, audit logs, and data export.

Prevent privilege escalation and removal/demotion of the last owner.

Apply least privilege to database functions, RPCs, storage objects, and background workers.

### SEC-03: Client privacy and consent

Use a dedicated clients entity rather than free-text client PII on projects.

Define consent capture, purpose, notice version, withdrawal, masking, access logging, retention, export, and deletion behavior in accordance with applicable requirements and the studio's legal guidance.

Production users must not receive unnecessary client contact information or internal margin data.

### SEC-04: Audit log

Define an append-only audit trail for sensitive operations, including role changes, PII access/export, price changes, quote send/accept, version approval, production-package generation/download, and share-link creation/revocation.

Specify actor, organization, event, target, timestamp, and relevant before/after metadata without unnecessarily duplicating sensitive data.

Explain the limits of database-level protections and privileged administrative access. Do not claim absolute immutability without an enforceable threat model.

### SEC-05: Database and application hardening

Audit existing security-sensitive RPCs, search paths, grants, RLS policies, storage permissions, and authentication settings.

Preserve existing application workflows during migrations. Define regression tests and a rollback strategy for security-related schema changes.

## 10. AI-agent requirements

AI is an assistant to the deterministic design system, not the authority for production dimensions.

Specify AI-supported operations such as:

- Natural-language design commands.
- Layout suggestions.
- Material and finish recommendations.
- Design alternatives.
- Cost-reduction suggestions.
- Validation explanations.
- Conversational measurement capture where appropriate.

For every command, define:

1. Intent and target identification.
2. Structured parameter extraction.
3. Permission validation.
4. Precondition and constraint checks.
5. Preview or proposed diff.
6. User confirmation when the operation is consequential.
7. Execution through typed application tools.
8. Deterministic recalculation.
9. Validation and error handling.
10. Audit record and user-visible result.

Destructive actions, approval changes, quotation transmission, production release, and other consequential operations must require explicit authorization or confirmation according to the permission matrix.

AI must not directly write authoritative manufacturing dimensions, bypass construction rules, override access controls, or label an unvalidated design factory-ready.

Make AI actions idempotent where needed and protect against prompt injection, unauthorized tool calls, stale context, and untrusted project content.

## 11. Data model and migration plan

Document the target entities, relationships, keys, constraints, and versioning behavior.

At minimum, cover:

- Organizations and memberships.
- Roles and permissions.
- Clients and consents.
- Projects and immutable project versions.
- Rooms, measurements, openings, and obstructions.
- Module definitions and instances.
- Rule packs and approval states.
- Materials, finishes, hardware, and price lists.
- Quotes and quote revisions.
- Production packages and their immutable snapshots.
- Deliverables and export profiles.
- Audit logs.
- Plans, entitlements, overrides, and usage counters where needed.

Use existing schema inspection from the source PRD rather than assuming all tables are new.

Specify how existing scene schema v7 is migrated to the target schema, including validation, rollback, compatibility, and preservation of existing projects and versions.

Separate mandatory migrations from optional future redesigns. Include data backfill, RLS verification, and release sequencing.

## 12. Non-functional requirements

Create a measurable NFR table covering:

- Geometry correctness.
- Calculation determinism.
- Autosave and recovery.
- Undo/redo.
- 2D/3D synchronization.
- Rendering performance.
- Project load/save performance.
- Manufacturing-package generation.
- Export reliability.
- Tenant isolation.
- Accessibility.
- Observability.
- Backup and disaster recovery.
- Data retention and privacy.
- Browser/device compatibility.
- Scalability and concurrent editing where supported.

Retain existing targets only where supported by the source material. Label targets that require validation.

For every performance target, specify workload, dataset size, target hardware or runtime, percentile, and measurement method. Do not use vague claims such as “fast,” “scalable,” or “production grade.”

Preserve the existing 5,000-user load-test target as a roadmap requirement only if its intended usage and workload are defined. Do not let it distract from the initial internal-team vertical slice.

## 13. Roadmap and release gates

Organize the plan into sequential phases, with explicit entry criteria, deliverables, dependencies, and exit gates.

### Phase 0 — Foundation and security

- Workspace and package boundaries.
- Existing-schema assessment.
- Tenant isolation and authorization.
- Client PII migration and consent.
- Audit logging.
- Migration and rollback framework.
- Golden test harness.

### Phase 1 — Canonical design and measurements

- Measurement templates.
- Room geometry and validation.
- Parametric module library.
- Versioned rule packs.
- Canonical scene schema and migration.
- Accurate 2D/3D synchronization.

### Phase 2 — Kitchen manufacturing vertical slice

- Supported kitchen module families.
- Deterministic geometry and solver.
- Manufacturing checks.
- Production-package generation.
- Cut-list, hardware, edge-band and label exports.
- Factory-reviewed sample outputs.

### Phase 3 — Commercials and deliverables

- Versioned material/hardware rates.
- Deterministic costing and tax configuration.
- Quotes and approvals.
- Dimensioned PDFs, elevations, schedules, BOM, and client presentation.
- Version invalidation and reproducibility.

### Phase 4 — Broader interiors and AI assistance

- Additional furniture families.
- Additional room types.
- MEP layers.
- AI-assisted editing with controlled tool execution.
- Additional validated construction templates.

### Phase 5 — Platform expansion

- Advanced optimisation.
- External studio onboarding and subscription billing.
- Offline measurement capture.
- Advanced export/CNC integrations and other explicitly approved enhancements.

These phase labels are a proposed delivery structure. Preserve the original v2.0/v2.1/v2.2+ release intent where appropriate, and document any changes in the change log.

Security, data protection, and tenant isolation remain mandatory throughout all phases.

### Vertical-slice acceptance gate

Do not declare the product ready based only on individual features passing unit tests.

Define an end-to-end pilot journey:

1. Create a client and project.
2. Capture site measurements.
3. Build and validate room geometry.
4. Configure a supported kitchen layout.
5. Place parametric modules.
6. Apply approved materials and hardware.
7. Produce a client presentation and dimensioned drawings.
8. Calculate a reproducible quote.
9. Approve and freeze a design version.
10. Generate a factory-validated production package.
11. Trace every generated part to its source module and rule version.
12. Verify tenant isolation and audit events throughout.

Preserve the existing success measures where applicable:

- 100% of cut-list rows traceable to a module and rule version.
- Zero manual cut-list edits across five pilot kitchens, subject to factory validation.
- Quoted material cost within ±5% of factory actual, marked `[V]` until measurement methodology and baseline are agreed.
- Standard L-shaped kitchen from measurements to approved quote in under two hours, marked `[V]` until the pilot protocol is defined.
- Automated RLS allow/deny tests passing for all applicable tenant-owned tables and operations.

Specify what evidence is required to pass each gate.

## 14. Additional gaps that must be addressed

Create explicit requirements or documented deferrals for:

- Client and studio onboarding.
- Importing or attaching existing floor plans.
- File and image management.
- Backup, restore, and disaster recovery.
- Data export and deletion requests.
- Measurement uncertainty and unresolved discrepancies.
- Design and production version invalidation.
- Export compatibility and versioning.
- Accessibility and keyboard operation.
- Visual regression and representative rendering benchmarks.
- Error reporting, monitoring, and operational runbooks.
- Concurrency and stale-edit handling.
- Catalog and rule-pack governance.
- Factory feedback and pilot sign-off.
- Product analytics and success measurement.
- Data retention and consent withdrawal.
- Browser/device support.
- Recovery from failed or partially completed background jobs.

For each, state whether it is P0, P1, P2, or an open decision. Do not silently imply that an unimplemented feature already exists.

## 15. Requirement writing standard

Every functional requirement must use a stable identifier and contain:

| Field | Required content |
|---|---|
| ID | Unique, stable identifier |
| Requirement | One unambiguous, testable statement |
| Priority | P0, P1, or P2 |
| Provenance | M, D, or V |
| Actor | Who or what performs the operation |
| Preconditions | Required state, permissions, and inputs |
| Behavior | Expected system behavior |
| Acceptance criteria | Verifiable outcomes |
| Failure behavior | Validation, errors, and recovery |
| Dependencies | Related requirements or systems |
| Phase | Target implementation phase |
| Verification | Unit, integration, security, performance, or manual test |

Avoid vague acceptance criteria such as “works correctly,” “looks good,” or “supports manufacturing.”

Use concrete inputs, expected outputs, invariants, and observable outcomes.

## 16. Required appendices

### Appendix A — Requirement traceability matrix

Map every requirement in the original PRD to its v2.1 destination.

Use statuses such as:

- Retained.
- Clarified.
- Expanded.
- Replaced.
- Deferred.
- Rejected with rationale.
- Requires validation.

Ensure that no original requirement silently disappears.

### Appendix B — Architectural decision records

Create concise ADRs for the most consequential decisions, including:

- Monorepo package boundaries.
- Canonical scene model.
- Deterministic calculation contract.
- Production-package storage format.
- Rule-pack lifecycle.
- Manufacturing approval gate.
- Entitlements versus usage counters.
- Database and tenant security model.
- Rendering and geometry ownership.
- AI tool execution and approval boundaries.

Each ADR must contain context, decision, alternatives, consequences, status, and validation needs.

### Appendix C — Open-decision register

For each unresolved item, list:

- Decision ID.
- Question.
- Why it matters.
- Available options.
- Recommended default, if justified.
- Decision owner.
- Deadline or blocking milestone.
- Consequence of not deciding.

Do not block schema and engine development on factory values that can be represented by versioned fixtures. Do block factory-ready claims and production exports on unresolved manufacturing-critical rules.

### Appendix D — Implementation backlog

Create epics, workstreams, and representative implementation tickets with:

- Ticket ID.
- Requirement IDs.
- Scope.
- Dependencies.
- Definition of done.
- Test requirements.
- Risks.

Do not invent precise delivery dates or effort estimates without team capacity and scope information.

## 17. Final quality checks

Before presenting the final PRD, verify all of the following:

- [ ] PRD v2 remains the primary requirements source.
- [ ] Architectural-review corrections are explicitly dispositioned.
- [ ] The package-count inconsistency is resolved.
- [ ] Production packages have an explicit immutability and hashing strategy.
- [ ] Browser previews and authoritative manufacturing calculations have a deterministic contract.
- [ ] Factory defaults remain provisional until approved.
- [ ] Entitlements and usage counters are separated.
- [ ] Security and privacy are P0.
- [ ] The canonical design model drives all derived artifacts.
- [ ] Visual-only furniture is distinguished from manufacturing-supported furniture.
- [ ] Production readiness has an explicit, enforceable gate.
- [ ] Quote and manufacturing outputs remain reproducible after changes.
- [ ] AI cannot bypass deterministic rules or authorization.
- [ ] Existing project data and scene versions have a migration strategy.
- [ ] Original requirements have traceable destinations.
- [ ] Open assumptions are clearly identified.
- [ ] Each P0 requirement has testable acceptance criteria.
- [ ] Every release has measurable exit gates.
- [ ] The PRD does not claim unverified implementation status or factory acceptance.

## 18. Output instructions

Produce the complete PRD v2.1, not just the proposed outline, gap-analysis table, or executive summary.

Start with the executive summary and a concise change log. Then provide the full specification, traceability matrix, ADRs, open-decision register, and implementation backlog.

Use Markdown headings and tables where appropriate. Keep requirement IDs stable and cross-reference them consistently.

Preserve important domain terminology and existing requirement IDs from the source PRD. Clearly label recommendations that are inferred rather than meeting-established.

Do not stop to ask questions before drafting. Make reasonable, clearly labeled provisional decisions where the evidence permits, and list unresolved decisions for the product owner and domain reviewer to confirm.

The final result must be a coherent, engineering-ready **PRD v2.1 that can serve as the source of truth for implementation and acceptance testing**.
