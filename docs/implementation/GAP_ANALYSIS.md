# Interior Studio — Repository Gap Analysis

- Status: Proposed baseline for review
- Branch: `docs/lifecycle-architecture-baseline`
- Compared code: `main` and `refactorV2`
- Scope: architecture, database, security, workflow, UX
- Evidence rule: this document distinguishes existing code from target requirements. It is not runtime or production certification.

## 1. Executive assessment

Interior Studio already has a substantial browser-based design engine: dimension-driven room and cabinet modelling, parametric cabinet interiors, 2D plans and elevations, 3D rendering, direct manipulation, design checks, AI/voice-assisted commands, deliverables and early manufacturing functionality.

The `refactorV2` branch adds important foundations for site measurement, MEP, modular packages, SaaS entitlements, role management, Supabase migrations, manufacturing rule packs and immutable production packages.

The primary gap is not a missing 3D editor. It is the absence of a fully integrated, server-authoritative project lifecycle that connects client onboarding, spaces, survey evidence, MOM, design revisions, MEP, approvals, commercial snapshots, production and handover.

**Recommendation:** preserve the existing design engine and build the lifecycle and governance layers around it. Do not start a greenfield rewrite.

## 2. Evidence and provenance conventions

- **[M] Meeting/source-established:** explicitly supported by the supplied product or meeting material.
- **[E] Existing implementation:** observed in repository source or specifications. Existence does not imply production readiness.
- **[D] Derived recommendation:** engineering or product recommendation from the audit.
- **[V] Validation required:** needs confirmation from product owner, designers, factory, security reviewer or legal/tax reviewer.

The source PRD v2.1 prompt requires preserving [M], [D] and [V]. Do not silently promote a validation item to an established decision.

## 3. Repository baseline

### 3.1 Existing foundations [E]

- React 19, TypeScript, Vite, Three.js / React Three Fiber.
- Domain schemas and typed design commands using Zod.
- Framework-free geometry and calculation modules.
- Zustand editor state and undo/redo.
- Integer millimetre dimensions in the current editor model.
- IndexedDB project persistence and versioned JSON files.
- AI proposal/preview/approval flow and voice interaction.
- Plan, elevation, schedule, BOM and cut-list generation.
- PDF, SVG and CSV exports.
- Client package editing and revision-aware page freshness.
- Site-capture, MEP, platform authorization, subscription and manufacturing work in `refactorV2`.
- Eight intended shared packages and web/worker application shells.

### 3.2 Important branch observation [E]

At the inspected audit point, `refactorV2` was 12 commits ahead of `main` and not behind. It contains a larger workspace/specification surface. Its package entry points still re-export implementation from the legacy `src/` tree, so package extraction is not complete. The worker application entry point is a stub.

Use `refactorV2` as the integration candidate, not as a declaration that all target functionality is complete.

## 4. Prioritized gap register

| ID | Area | Finding | Priority | Decision |
|---|---|---|---|---|
| GAP-001 | Architecture | Shared package facades still point into `src/` | P1 | Complete incremental extraction; avoid mass rewrite |
| GAP-002 | Architecture | Workspace and CI responsibilities need consistent enforcement | P1 | Standardize package manager, build graph and CI |
| GAP-003 | Architecture | Worker application is a stub | P1 | Define job contracts and worker lifecycle before heavy jobs |
| GAP-004 | Database | Editor projects are still browser-local in the inspected persistence path | P0 | Make server persistence authoritative; retain local cache/drafts |
| GAP-005 | Database | No complete canonical client → project → space aggregate | P0 | Introduce project and space entities |
| GAP-006 | Database | Site survey state is not durably scoped to project/space in the inspected store | P0 | Persist survey sessions, observations and evidence |
| GAP-007 | Database | Artifact dependency and lineage model is incomplete | P0 | Persist source revision, dependencies, generator and rule versions |
| GAP-008 | Security | Default actor resolver accepts identity/role headers | P0 | Use verified authentication context only |
| GAP-009 | Security | Declared resource scopes are not consistently enforced | P0 | One canonical scope evaluator; deny missing resource context |
| GAP-010 | Security | Client/consent migration does not itself establish base-table RLS policies | P0 | Add tenant-scoped RLS and direct-table tests |
| GAP-011 | Security | Audit append-only controls need TRUNCATE/privilege/retention hardening | P0 | Protect ordinary mutation paths and document privileged boundary |
| GAP-012 | Security | In-memory quota manager is not distributed/transactional | P1 | Reserve quotas atomically in PostgreSQL |
| GAP-013 | Workflow | Lifecycle milestone enum does not model all operational stages | P0 | Separate stage state, approval and artifact freshness |
| GAP-014 | Workflow | Dedicated MOM/requirements workflow is missing | P0 | Add structured meeting records and confirmed requirements |
| GAP-015 | Workflow | Rectangular opposite-wall comparison is not full polygon closure | P0 | Implement geometry/diagonal/angle-aware survey validation |
| GAP-016 | Workflow | MEP data is not integrated into the same design-command pipeline | P0 | Add validated MEP commands and editing |
| GAP-017 | Manufacturing | Provisional rule-pack export path can bypass the intended gate | P0 | Centralize production-package generation and approval checks |
| GAP-018 | Manufacturing | Part lineage needs module/catalog/source version completeness | P0 | Complete immutable package contract |
| GAP-019 | Manufacturing | Canonical hashing and numeric determinism need cross-runtime proof | P0 | UTF-8 SHA-256, fixed-point rules and golden vectors |
| GAP-020 | Commercial | Quote generation is not consistently driven by a versioned rate-card snapshot | P0 | Use frozen rate/tax configuration for quotes |
| GAP-021 | UX | No unified project lifecycle workspace | P0 | Add project overview and stage navigation |
| GAP-022 | UX | No structured MOM workspace | P0 | Add requirements and scope matrix |
| GAP-023 | UX | Site capture is modal/in-memory in the inspected flow | P0 | Make survey a durable responsive workspace |
| GAP-024 | UX | MEP, approval and production experiences need a shared project context | P1 | Build stage workspaces |
| GAP-025 | Testing | Pilot E2E does not prove full durable client-to-handover journey | P0 | Add end-to-end vertical slice |
| GAP-026 | Testing | Environment-specific test setup needs review | P1 | Make tests reproducible in CI |
| GAP-027 | Documentation | PRD prompt and shorter PRD are not a single approved requirements baseline | P0 | Consolidate and maintain traceability |
| GAP-028 | Handover | Work orders, installation and snag/QC workflow is not complete | P1 | Add operational handover model |

## 5. Findings requiring immediate attention

### 5.1 Identity and authorization

The default actor resolver in `src/server/authorizationMiddleware.ts` reads `x-user-id`, `x-org-id` and `x-user-roles`. These headers must not be trusted as an identity source unless a trusted gateway authenticates the request, strips caller-supplied copies and injects verified claims. Prefer deriving the actor from a verified Supabase session/JWT in a trusted server boundary.

The authorization evaluator and SaaS policy engine contain separate scope logic. The inspected authorization evaluator does not implement `specific_projects`; the policy engine has a narrower assigned-project path and can stop at the first matching role. Consolidate these into one canonical evaluator. A project-scoped permission without project context must fail closed.

### 5.2 RLS and audit

Migration `00003_dpdp_clients_and_consents.sql` creates client and consent tables but does not, within that migration, enable RLS and establish explicit tenant policies on both base tables. A masking view does not replace tenant isolation.

Migration `00004_append_only_audit_log.sql` revokes TRUNCATE from PUBLIC and authenticated and adds row-level UPDATE/DELETE protection. Add a TRUNCATE trigger and review ownership, service-role grants, retention, backup and organization-deletion behavior. No database mechanism can claim protection against a sufficiently privileged database owner/superuser.

### 5.3 Production export gate

The inspected deliverables store calls readiness without passing the active rule pack, while the OptiCut path calls the provisional seed rule pack directly. The production export path must be replaced by one server-authoritative use case. Provisional and designer-reviewed rule packs must not authorize factory release.

A synthetic fixture marked production-approved must remain test-only and must not be accepted as real factory authorization.

### 5.4 Survey and MEP

The inspected survey store holds state in Zustand and ignores its project ID during initialization. The closure solver compares opposite wall lengths; it does not establish polygon closure for skewed rooms. MEP points exist in the project schema, but the inspected design command contract does not include MEP add/update/remove operations.

### 5.5 Commercial and deterministic calculations

The inspected quotation path uses hardcoded rates instead of a frozen versioned rate card. Unknown tax classifications must not silently receive a default tax rate. The production hash implementation needs UTF-8 byte encoding and standard SHA-256 test vectors. Floating-point calculations must be isolated from authoritative manufacturing values unless their determinism is proven.

## 6. Recommended sequence

1. Reconcile PRD, architecture sources and existing specifications.
2. Establish verified identity, tenant isolation and cloud persistence.
3. Add canonical client, project and space model.
4. Persist survey observations/evidence and structured MOM requirements.
5. Introduce lifecycle stages, approvals, revision snapshots and artifact dependency graph.
6. Integrate existing editor with cloud-backed space revisions.
7. Integrate MEP through validated commands.
8. Centralize client approval, quote snapshots and production package generation.
9. Harden deterministic manufacturing, export profiles and factory release.
10. Add work orders, installation, snagging and handover.

## 7. Release gates

- G1: canonical domain and package ownership approved.
- G2: cloud persistence and revision concurrency proven.
- G3: tenant, RBAC, RLS, PII and object-storage tests pass.
- G4: survey observations and evidence persist with provenance.
- G5: MOM requirements and scope decisions are versioned and confirmed.
- G6: existing editor operates against project-space revisions.
- G7: MEP points and checks are validated and revision-aware.
- G8: client approval freezes exact revision and artifact set.
- G9: only eligible rule packs produce immutable production packages.
- G10: quotes use frozen rate/tax configuration.
- G11: selected factory accepts export profile and golden package.
- G12: installation and QC link to released package.

## 8. Audit limitations

This is a source-level review of GitHub files and supplied architecture documents. Runtime tests, live Supabase policy evaluation, migration application, deployed configuration, factory validation and legal/tax review were not performed. Findings about security should be verified against the actual deployed Supabase project before external use.
