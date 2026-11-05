# Feature Specification: 052 — Observability, Retention, Backups and Load Test

**Feature Branch**: `052-ops-readiness`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 5 — Scale readiness (estimate 5 days)
**Depends on**: 048
**Blocks**: Phase 6 (reopening the spec queue)
**Source**: Architecture Review (Decisions: observability; Database: full snapshot per save; Phase 5; Cost at 5,000 users) and Playbook (052)

## Context

There is no error tracking, no uptime check and no spend alerting. Every save stores a full snapshot: the live data shows about 16 versions per project in one day of use. Snapshots are small (a 2BHK home is 5 KB gzipped), so Postgres is right at launch, but autosaves must be thinned. No restore has ever been rehearsed, and nobody knows whether the system holds 5,000 users.

This spec makes failures visible before customers report them, keeps the database small, and proves capacity and recoverability with measured results.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Know when it breaks (Priority: P1)

As the founder, I want errors, downtime and spend spikes to reach me automatically, so that I learn about problems before customers do.

**Why this priority**: No other spec makes production observable.

**Independent Test**: A thrown error in staging appears in Sentry with release and readable stack; a test uptime alert arrives by email.

**Acceptance Scenarios**:

1. **Given** Sentry in the browser app and Vercel functions, **When** an error is thrown in staging, **Then** it appears in Sentry tagged with the git SHA release and a readable (source-mapped) stack trace.
2. **Given** an event, **When** I inspect it, **Then** it includes user id and studio id and no design content (scene data stripped).
3. **Given** an uptime check on the production URL and `/api/health`, **When** either fails, **Then** an email alert arrives.
4. **Given** spend alerts, **When** Supabase usage, Vercel spend or the Google Cloud budget crosses a threshold, **Then** an email alert arrives.
5. **Given** a studio uses 80% of its monthly AI credits, **When** it crosses, **Then** the founder is alerted.

---

### User Story 2 — The database stays small (Priority: P1)

As the founder, I want old autosaves thinned automatically while every deliberate version is kept, so that storage stays cheap without losing anything a designer chose to save.

**Independent Test**: pgTAP: after the retention job, manual, restore and revision versions are untouched; autosaves follow the rule.

**Acceptance Scenarios**:

1. **Given** a project with many autosaves, **When** the scheduled job runs, **Then** it keeps every `manual` and `restore` version, the newest 20 autosaves, and one autosave per day for older days, and deletes other autosaves older than 30 days.
2. **Given** the current head version, **When** the job runs, **Then** it is never deleted.
3. **Given** studios A and B, **When** the job runs, **Then** it processes each studio's projects independently and never mixes rows across studios.

---

### User Story 3 — Proven capacity (Priority: P1)

As the founder, I want a load test that simulates our target usage, so that I know saves stay fast at 5,000 users.

**Independent Test**: k6 report from staging: save p95 < 500 ms, error rate < 0.5%, database CPU < 70%.

**Acceptance Scenarios**:

1. **Given** staging, **When** k6 runs 500 virtual designers for 15 minutes, each saving a 125 KB home every 30 s and listing projects every minute, **Then** save p95 < 500 ms and error rate < 0.5%.
2. **Given** the same run, **When** I read Supabase metrics, **Then** database CPU stays under 70%.
3. **Given** the report, **When** it is committed under `docs/runbooks/` (or attached to the PR), **Then** it includes the script, parameters and results.

---

### User Story 4 — Proven recovery (Priority: P1)

As the founder, I want to have restored a real backup once and timed it, so that recovery is a procedure, not a hope.

**Acceptance Scenarios**:

1. **Given** the latest production backup, **When** it is restored into a scratch Supabase project, **Then** a project opens from it in the app pointed at that scratch project.
2. **Given** the drill, **When** it completes, **Then** `docs/runbooks/restore.md` contains the exact steps and the measured duration.
3. **Given** `docs/`, **When** I read the PITR decision, **Then** it states whether point-in-time recovery ($100/month for 7 days) is enabled now or at which trigger.

### Edge Cases

- Sentry captures PII in breadcrumbs (emails in URLs or request bodies): scrubbing rules strip them; tested with a fixture event.
- Retention job runs during heavy saving: it works in batches with short transactions and never locks `projects`.
- A project's only autosaves are older than 30 days with no manual version: the head and one per day are kept, so the project still opens.
- Load test accidentally targets production: the script refuses unless the target host matches staging.
- Restore drill exposes real user data: the scratch project is deleted after the drill and access is owner-only.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Sentry MUST be installed for the browser app and the Vercel functions, with releases tied to git SHAs and source maps uploaded in CI (not served publicly).
- **FR-002**: Sentry events MUST include user id and studio id and MUST NOT include scene/design content or emails.
- **FR-003**: `/api/health` MUST return 200 with build SHA and a database reachability check; an uptime monitor MUST check it and the production URL, alerting by email.
- **FR-004**: Spend alerts MUST exist for Supabase usage, Vercel spend and the Google Cloud budget; an alert MUST fire when any studio uses 80% of monthly AI credits.
- **FR-005**: A `pg_cron` job MUST enforce version retention: keep all `manual` and `restore` versions and the head; keep the newest 20 autosaves per project and one per day for older ones; delete other autosaves older than 30 days. It MUST run per studio and in batches.
- **FR-006**: A k6 script MUST implement the load profile in User Story 3 and refuse non-staging targets.
- **FR-007**: A restore drill MUST be performed and documented in `docs/runbooks/restore.md` with duration.
- **FR-008**: A one-page PITR decision MUST be written in `docs/`.
- **FR-009**: The trigger to move cold versions to object storage (database > ~20 GB) MUST be recorded with the monitoring that detects it.

### Key Entities

- **Retention rule**: kinds kept, autosave count kept, daily keep, age threshold.
- **Alert**: source, threshold, recipient.
- **Load test report**: script version, parameters, p50/p95/p99, error rate, CPU.
- **Restore record**: backup timestamp, target, steps, duration, result.

## Success Criteria *(mandatory)*

- **SC-001**: Staging error visible in Sentry with release and readable stack.
- **SC-002**: Load test: save p95 < 500 ms, error rate < 0.5%, DB CPU < 70%.
- **SC-003**: Retention pgTAP test passes; manual versions untouched.
- **SC-004**: Restore drill succeeded; duration recorded.
- **SC-005**: A test alert arrives in the founder's inbox.

## Assumptions

- Supabase Pro with daily backups (7 days) is in place for production.
- Sentry's free or team plan suffices at launch.

## Out of Scope

On-call rota; moving cold versions to object storage (only the trigger is recorded); dashboards beyond provider defaults.

## Gate

The founder has the load-test report, the restore time and a test alert in the inbox. Then the spec queue reopens: 035 lifecycle first (spec 053).

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: foundation spec — operations.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec.

### 3. Usage and Commercial Limits
Not applicable: foundation spec — the 80% credit alert observes the 045 quota; it does not change it.

### 4. RBAC Requirements
Not applicable: foundation spec.

### 5. Multi-Tenant Requirements
- **Tenant Isolation Requirements**: the retention job runs per studio and never across studios.
- **Storage and Cache Isolation**: Sentry tags carry studio id for triage only; no tenant data in events.
- **Background Worker Tenant Context**: `pg_cron` job iterates studios explicitly.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
Not applicable: foundation spec — observability and retention, no access changes.

### 8. Acceptance Criteria and Security Tests
- **Retention Tests**: pgTAP — manual, restore and head versions untouched; autosave rule exact at boundaries (20th/21st autosave; 29/30/31 days).
- **Tenant Isolation Tests**: retention on studio A leaves studio B rows unchanged.
- **Privacy Tests**: Sentry scrubbing removes emails and scene payloads from a fixture event.
