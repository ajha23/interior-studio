# Feature Specification: 051 — Render Jobs and the Cloud Run Worker

**Feature Branch**: `051-render-jobs`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 5 — Scale readiness (estimate 5 days)
**Depends on**: 045, 047, 048
**Blocks**: Phase 5 completion
**Source**: Architecture Review (Decisions: long jobs; Phase 5) and Playbook (051)

## Context

Photoreal renders (4K and 360°) currently have to fit inside a Vercel function's 60-second limit. On Oct 24 a Blender Cycles worker for Cloud Run was built (commit `2e85014`: `workers/blender/` with `server.py`, `render_scene.py`, a Dockerfile and `.github/workflows/blender-worker.yml`). The live database still has `ai_jobs`, `renders` and the `render-jobs` bucket. `apps/workers/src/index.ts` today is a 7-line stub, and the 034.x `outbox_events` table has no consumer.

This spec moves renders to background jobs on the new foundation: credit-metered (045), tenant-scoped files (047), and a worker that scales to zero.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Request a render and keep working (Priority: P1)

As a designer, I want to request a 4K or 360° render and keep editing while it runs, so that renders never block my work.

**Why this priority**: The reason for this spec; Vercel functions cannot complete long renders reliably.

**Independent Test**: Request a 4K render; continue editing; the render completes and appears in the project.

**Acceptance Scenarios**:

1. **Given** an editable project, **When** I request a render (4K or 360°), **Then** credits are debited through the 045 path and a `queued` job is created for the current project version.
2. **Given** a queued job, **When** I keep editing and saving, **Then** the job still renders the version it was created for.
3. **Given** the job runs, **When** I look at the render panel, **Then** status shows queued → rendering → done within 5 s of each change.
4. **Given** the job is done, **When** I open it, **Then** the image loads from a signed URL.

---

### User Story 2 — Reliable processing (Priority: P1)

As the founder, I want each job rendered exactly once, retried on transient failure, and refunded on final failure, so that customers are never charged for nothing.

**Independent Test**: Integration test with two claimers never double-claims; a forced failure refunds credits.

**Acceptance Scenarios**:

1. **Given** the worker is stopped, **When** a job is requested, **Then** it stays `queued`; starting the worker completes it.
2. **Given** two workers polling, **When** one job is queued, **Then** exactly one claims it (`FOR UPDATE SKIP LOCKED`).
3. **Given** a job running for more than 15 minutes, **When** the timeout passes, **Then** it is released for retry; after 2 retries it is `failed`.
4. **Given** a job reaches `failed`, **When** it is marked, **Then** a refund ledger row for its cost exists.

---

### User Story 3 — Renders stay private to the studio (Priority: P1)

As a studio owner, I want render jobs and files visible only to my studio, so that client designs never leak.

**Acceptance Scenarios**:

1. **Given** studio A's job and render file, **When** a studio B user lists jobs or requests the file, **Then** they see nothing and are denied.
2. **Given** the worker uploads, **When** it writes, **Then** the path is `<org_id>/<project_id>/<job_id>.<ext>` in the `renders` bucket.
3. **Given** the worker's database credentials, **When** they are used for anything other than the job functions, **Then** the call is denied.

---

### User Story 4 — Pay only for renders made (Priority: P2)

As the founder, I want the worker to scale to zero, so that idle time costs nothing.

**Acceptance Scenarios**:

1. **Given** no queued jobs, **When** I check Cloud Run after the idle timeout, **Then** instance count is zero.
2. **Given** a job is queued while at zero, **When** the next poll/trigger fires, **Then** an instance starts and processes it.

### Edge Cases

- Project version deleted or project archived while queued: job fails with a clear reason and refunds.
- Worker crashes mid-render: lease expires at 15 minutes; job is retried.
- Upload succeeds but marking done fails: completion is idempotent by job id; the retry detects the existing file and marks done.
- Studio runs out of credits while a job is queued: already-debited jobs still run.
- Scale-to-zero means no always-on poller: the plan decides the trigger (Cloud Scheduler ping, Pub/Sub push or HTTP wake from the request path) and documents the latency it implies.
- GPU not available: CPU Cycles at launch; render time per job is measured and recorded.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Render requests MUST go through the 045 credit-metered path and create a `queued` job referencing the project and its current version number.
- **FR-002**: The Blender worker from commit `2e85014` MUST be restored into `workers/blender/` and deployed to Cloud Run in `asia-south1` with minimum instances 0.
- **FR-003**: The worker MUST claim jobs via a `private` function using `FOR UPDATE SKIP LOCKED`, with a lease (`claimed_at`, `attempts`).
- **FR-004**: The worker MUST render, upload to `renders` under `<org_id>/<project_id>/`, and mark the job done with the storage path through an idempotent completion function.
- **FR-005**: The worker MUST use a dedicated database role (or secret key) granted only `EXECUTE` on the job functions and the storage write it needs; it MUST set tenant context from the job row.
- **FR-006**: Jobs MUST time out after 15 minutes, retry up to 2 times, then fail and refund credits.
- **FR-007**: The editor MUST show job status by polling every 5 s (Realtime only if the team later asks) and show finished renders from signed URLs.
- **FR-008**: The unused `outbox_events` concept and the `apps/workers` stub MUST be removed or replaced by this job path.
- **FR-009**: The worker image MUST build and deploy through a GitHub Actions workflow with SHA-pinned actions.
- **FR-010**: New SQL MUST be migrations with pgTAP tests, including a two-claimer test.

### Key Entities

- **Render job** (`ai_jobs` or a dedicated `jobs` table): id, org_id, project_id, version_no, kind (4k, 360), status (queued, rendering, done, failed), attempts, claimed_at, storage_path, cost, error.
- **Render** (`renders`): link from job to file and project.
- **Worker role**: Postgres role with narrow grants.

## Success Criteria *(mandatory)*

- **SC-001**: A 4K render requested on production completes while the designer keeps editing.
- **SC-002**: Zero double-processed jobs in the two-claimer test.
- **SC-003**: Cloud Run shows zero instances after idle.
- **SC-004**: Every failed job has a matching refund.

## Assumptions

- CPU Cycles is acceptable for launch; GPU decided after measuring render times.
- Polling at 5 s is fast enough for designers.

## Out of Scope

Walkthrough video rendering (spec 027 domain) beyond reusing this queue later; GPU rendering; Realtime.

## Gate

A 4K render requested on production completes while editing continues, and Cloud Run shows zero instances afterwards.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-render`
- **Parent Module**: `module-ai`
- **Module Capabilities**: request render, view status, view result, share result.
- **Dependencies on Other Modules**: `module-ai` (045 credits), `module-projects` (043).

### 2. Subscription Entitlement Requirements
- **Required Entitlement Identifiers**: none beyond credits in this spec; plan gating with billing.

### 3. Usage and Commercial Limits
- **Applicable Quotas**: studio AI credits; cost per render kind in the server cost table.
- **Usage Measurement**: debit at request; refund on final failure.
- **Behavior When Limits Are Reached**: 402 at request time.

### 4. RBAC Requirements
- **Required Permissions**: request — owner, admin, designer; view — any member.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: jobs and render files.
- **Tenant Isolation Requirements**: `org_id` on every job; RLS for browser reads; storage path prefix per studio.
- **Background Worker Tenant Context**: the worker reads `org_id` from the claimed job and writes only under that prefix; its role cannot read other tables.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Backend**: credit RPC before enqueue; narrow worker role; storage policies (047).
- **Background Worker Enforcement**: lease, timeout, retry, refund.
- **Audit**: job rows and ledger rows.

### 8. Acceptance Criteria and Security Tests
- **Tenant Isolation Tests**: studio B cannot see studio A jobs or files (pgTAP, storage tests).
- **Concurrent Usage Tests**: two claimers, one job → one claim.
- **Quota Tests**: zero credits → 402, no job.
- **Refund Tests**: final failure → refund.
- **Privilege Tests**: worker role cannot select from `projects` or other studios' data.
