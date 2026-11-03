# Interior Studio — Target System Architecture

- Status: Proposed architecture baseline
- Scope: modular monolith, eight domain packages, web application and workers
- Supersedes: none until reviewed and accepted
- Provenance: [M] established product direction; [E] observed repository behavior; [D] architecture recommendation; [V] validation required

## 1. Architecture intent

Interior Studio evolves from a dimension-driven interior design editor into a traceable design-to-manufacture workflow platform.

The architecture must connect:
- Client and project onboarding.
- Spaces and site evidence.
- Meeting outcomes and requirements.
- 2D/3D design revisions.
- MEP coordination.
- Client approval and commercial quote.
- Manufacturing rules, parts and production packages.
- Workshop execution, installation and handover.

The existing design engine remains the canonical geometry and editing engine. The platform/lifecycle layer surrounds it; it must not create a second scene model.

## 2. Current-state summary [E]

The inspected `refactorV2` repository includes:
- React 19 / TypeScript / Vite web application.
- Three.js and React Three Fiber design viewport.
- Zod schemas and typed commands.
- Zustand/Immer editor state and undo/redo.
- Framework-free domain and engine code.
- IndexedDB persistence.
- AI and voice proposal flow.
- Drawings, BOM, cut list, PDF/SVG/CSV and client package.
- Early site measurement, MEP, authorization, subscription and manufacturing packages/specs.
- Supabase migrations and workspace package shells.

The package shells currently re-export from the legacy `src/` tree. The worker app is a stub. This is a transitional modular monolith, not completed package extraction.

## 3. Target topology

```text
apps/
  web/                    React application, editor, project workspace
  workers/                background jobs, exports, render/video work

packages/
  core/                   project, space, scene, revisions, commands
  platform/               identity integration, tenancy, RBAC, audit, billing
  catalog/                module definitions, materials, hardware, rule packs
  measure/                surveys, observations, geometry closure, uncertainty
  engine/                 pure geometry, constraints, layout, manufacturing
  commercial/             rate cards, costing, quotation and tax configuration
  deliverables/           drawing model, PDF/SVG/DXF/CSV, artifact metadata
  ai/                     intent, planners, tool adapters, evaluation, guardrails

supabase/
  migrations/             schema, RLS, functions and database constraints
docs/
  architecture/
  database/
  workflow/
  ux/
  implementation/
```

The eight packages are bounded domains. Applications orchestrate them. Do not create microservices solely to mirror package boundaries.

## 4. Dependency rules

1. `core` owns canonical domain contracts and commands. It does not import UI, database clients or network libraries.
2. `catalog` owns versioned reusable definitions and catalog snapshots. Project-specific selection is stored by core.
3. `measure` depends on core contracts and owns survey/measurement validation.
4. `engine` depends on core/catalog contracts and remains pure TypeScript.
5. `commercial` depends on core and approved calculation/catalog inputs; it does not call billing providers.
6. `deliverables` consumes immutable source snapshots and engine results; it does not mutate the design.
7. `ai` calls typed application tools; it does not persist directly or author authoritative geometry/manufacturing results.
8. `platform` owns authorization, entitlements and audit policy. Domain packages declare required capabilities but do not embed plan names.
9. `apps/web` and `apps/workers` are composition roots.
10. Cycles and imports from pure packages to React, Three.js, Zustand, browser APIs, database/network clients or filesystem APIs are CI failures.

## 5. Application architecture

Use a modular monolith with explicit application/use-case boundaries.

```text
UI / API / Worker
      |
Application use cases
      |-- authorize actor and resource
      |-- validate entitlement and quota
      |-- load canonical revision
      |-- execute domain command / engine
      |-- persist new revision or immutable artifact
      |-- append audit event
      |-- enqueue follow-up jobs through outbox
      |
Domain packages
      |
Infrastructure adapters
      |-- Supabase/PostgreSQL
      |-- object storage
      |-- queue/worker
      |-- AI providers
```

Every mutation should enter through a use case. UI components must not directly update database records or bypass domain commands.

## 6. Canonical domain boundaries

- Organization: tenant and commercial/security boundary.
- Client: customer identity and PII boundary.
- Project: engagement, client, ownership, team, status and lifecycle.
- Space: room or area designed within a project.
- Survey: versioned physical observations and evidence.
- Requirements: MOM-derived and designer-confirmed scope/constraints.
- Design revision: immutable snapshot of canonical space design.
- Artifact: generated output tied to exact sources and generator versions.
- Approval: actor's decision on exact revision/artifact set.
- Rule pack: versioned construction rules and approval state.
- Production package: immutable, reproducible factory snapshot.
- Work order: execution against an exact production package.
- Installation record: site completion, QC and snag evidence.

The current `Home` aggregate remains useful for whole-home layout. It must not replace the project/space lifecycle aggregate.

## 7. Command and revision architecture

Retain the existing typed command pipeline:
- Parse command with Zod.
- Resolve referenced entities.
- Validate domain constraints.
- Execute transaction on an isolated immutable snapshot.
- Return change set and warnings.
- Present impact preview.
- Commit only against expected current revision.
- Record audit and lineage.

Add MEP and other editable domain objects through the same command contract. No feature may mutate a project outside the command/application boundary.

Cloud commit contract should include:
- project/space ID;
- expected revision ID;
- command batch or canonical snapshot;
- actor and tenant context from verified auth;
- idempotency key;
- resulting revision ID and content hash.

A stale expected revision must not overwrite a newer committed revision. Return a conflict for explicit reconciliation.

## 8. Persistence architecture

- PostgreSQL is authoritative for tenants, clients, projects, spaces, revisions, approvals, artifacts, quotes, rule-pack metadata and production-package metadata.
- JSONB stores versioned scene snapshots, flexible structured survey/requirements payloads and immutable production payloads.
- Object storage holds photos, videos, renders, PDFs, DXFs and export assets.
- IndexedDB may cache recent projects and hold explicit offline drafts.
- Zustand stores transient UI/editor state, not authoritative approval or tenant data.
- Background jobs are durable, idempotent and re-authorize the actor/tenant before sensitive work.

## 9. Event and workflow approach

Do not implement full event sourcing for every entity. Use:
- Normal transactional current state.
- Immutable versioned design and production snapshots.
- Append-only audit events.
- Explicit workflow transition records.
- Transactional outbox for asynchronous jobs.
- Artifact dependency graph for freshness.

Events are useful for notification and asynchronous processing, but the canonical aggregate state remains queryable in PostgreSQL.

## 10. AI boundaries

AI may:
- Extract candidate observations and requirements.
- Propose layouts and design commands.
- Summarize blockers.
- Draft MOM, client notes and handover summaries.
- Explain engineering results.

AI must not:
- Invent verified measurements.
- Bypass authorization or tenant scope.
- Write authoritative geometry outside domain commands.
- Authoritatively calculate factory parts or tax totals.
- Approve revisions or release production without authorized human action.
- Read documents or artifacts the actor cannot access.

Every tool call inherits the authenticated actor, tenant and resource scope.

## 11. Observability and reliability

Required:
- Correlation ID across request, command, job and artifact.
- Structured logs with tenant-safe metadata.
- Audit events for sensitive business actions.
- Metrics for job duration, retries, failures and quota reservation.
- Dead-letter/recovery workflow for failed jobs.
- Idempotent job execution.
- Object storage checksum verification.
- Explicit schema and generator version metadata.

Do not log client PII, secrets, access tokens or full sensitive documents by default.

## 12. Decisions still requiring validation [V]

- Exact production runtime and worker hosting.
- Queue technology and operational service-level targets.
- Whether all package boundaries remain eight after the first extraction.
- Offline editing/conflict behavior.
- Retention and deletion policy for evidence and audit records.
- Whether non-kitchen space models share one scene schema or use typed extensions.
- Factory-approved rule-pack governance and signing process.
