# Feature Specification: 044 — Local and Earlier-Editor Projects

**Feature Branch**: `044-project-import`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 1 — Identity and one database (estimate 2–3 days)
**Depends on**: 043
**Blocks**: Phase 1 completion
**Source**: Architecture Review (Phase 1: "Move to studio" import; 129 orphaned versions) and Playbook (044)

## Context

Two groups of projects live outside the studio today:

1. **Browser projects** — anything created in production since Oct 30 sits only in each user's IndexedDB.
2. **Earlier-editor projects** — the live database holds 8 projects with 129 versions saved by the pre-rewrite editor. Their scenes use schema versions 1–7 with `plan` and `furniture` keys; today's editor uses kitchen `SCHEMA_VERSION` 2 and home `HOME_SCHEMA_VERSION` 1. Spec 043 backfills them as `doc_type = 'legacy_v1'`.

This spec brings both groups into the studio without losing data and without forcing the current editor to read a format it does not understand.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Move my browser projects into the studio (Priority: P1)

As a designer who used the local-only app, I want a one-time prompt to move my browser projects into my studio, so that they are backed up and my team can open them.

**Why this priority**: These projects exist only on one device and can be lost with a cleared browser.

**Independent Test**: With two local unlinked projects, sign in; the banner appears; Move; both open from another browser.

**Acceptance Scenarios**:

1. **Given** IndexedDB holds N kitchen projects or homes not linked to the cloud, **When** I sign in and open Projects, **Then** a banner says "N projects on this computer: move them to <studio>" with Move and Not now.
2. **Given** I choose Move, **When** it completes, **Then** each project exists in the studio with one `manual` version (message "Moved from this computer"), and each local copy is marked linked to its cloud id; nothing local is deleted.
3. **Given** I choose Not now, **When** I return later, **Then** the banner is available from a quiet entry in Projects, not shown on every load.
4. **Given** all local projects are linked, **When** I open Projects, **Then** no banner appears.

---

### User Story 2 — Moving is safe to repeat (Priority: P1)

As a designer whose connection dropped mid-move, I want retrying to finish the job without duplicates, so that I can just press Move again.

**Independent Test**: Move twice (or interrupt and retry); the studio holds exactly one cloud project per local project.

**Acceptance Scenarios**:

1. **Given** a local project with id L was moved, **When** Move runs again, **Then** no second cloud project is created, because `source_local_id = L` already exists in the studio.
2. **Given** the move was interrupted after 1 of 2 projects, **When** I retry, **Then** only the second is uploaded.
3. **Given** the same local project is moved into a different studio by a user who belongs to both, **When** it runs, **Then** it is allowed (uniqueness is per studio).

---

### User Story 3 — Earlier-editor projects are visible and recoverable (Priority: P2)

As a studio owner, I want the 8 projects from the earlier editor listed with a clear badge and their data downloadable, so that nothing is orphaned and I can re-create active ones.

**Independent Test**: Projects shows the 8 legacy projects with an "Earlier editor" badge; opening one shows a summary; download JSON matches the stored scene byte-for-byte.

**Acceptance Scenarios**:

1. **Given** a project whose versions are all `legacy_v1`, **When** I view Projects, **Then** it shows with an "Earlier editor" badge.
2. **Given** I open a legacy project, **When** it loads, **Then** I see a read-only summary: name, client, created, version count, latest saved date; the 3D editor does not open.
3. **Given** I am an owner, **When** I choose Download latest version, **Then** a JSON file downloads whose content equals the stored scene of the latest version.
4. **Given** I am an owner, **When** I choose Archive, **Then** the project is archived (not deleted).
5. **Given** I am a designer or viewer, **When** I open a legacy project, **Then** I see the summary without download or archive controls.

### Edge Cases

- A local project fails validation (corrupt or unknown schema version): it is skipped, listed in a result summary with the reason, and stays local.
- A local scene exceeds 2 MB: rejected by the save function; reported per project.
- The user is a viewer: the banner is not shown; the database rejects any import attempt.
- Local projects belong to a previous signed-in user on a shared computer: only projects never linked, or linked by this user, are offered.
- A legacy project later gets a current-format version (re-created by hand into the same project): it leaves legacy mode because not all versions are `legacy_v1`; the editor opens the newest non-legacy version.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A migration MUST add nullable `source_local_id` to `projects`, unique per `(org_id, source_local_id)` where not null.
- **FR-002**: Detection MUST find IndexedDB kitchen projects and homes without a cloud link for the current user.
- **FR-003**: Move MUST create one project and one `manual` version per local project via the 043 save path (idempotency key derived from the local id), then record the cloud id on the local copy.
- **FR-004**: Move MUST be idempotent per studio by `source_local_id` and MUST NOT delete local data.
- **FR-005**: Move MUST report per-project success, skip or failure with a reason.
- **FR-006**: Only owner, admin and designer MAY import; enforced in the database.
- **FR-007**: Projects whose versions are all `legacy_v1` MUST show an "Earlier editor" badge and open a read-only summary instead of the editor.
- **FR-008**: Owners MUST be able to download the latest legacy version as JSON identical to the stored scene, and archive the project.
- **FR-009**: The current editor MUST never attempt to load a `legacy_v1` scene.
- **FR-010**: No converter from legacy scenes to the current model is built in this spec.

### Key Entities

- **Project.source_local_id**: the IndexedDB id the project came from; unique per studio.
- **Local link**: on the IndexedDB record, the cloud project id and studio id it was moved to.
- **Legacy project**: a project whose versions are all `doc_type = 'legacy_v1'`.

## Success Criteria *(mandatory)*

- **SC-001**: The founder's own browser projects appear in the studio after one Move.
- **SC-002**: All 8 earlier projects show with the badge; download works for each.
- **SC-003**: Zero duplicate cloud projects after repeated moves (pgTAP and Playwright).

## Assumptions

- Re-creating active legacy projects by hand is cheaper than a converter. Build a converter only if more than five are still live work (decision recorded after the gate).
- Local copies are kept indefinitely; a later spec may offer cleanup.

## Out of Scope

Converting legacy scenes; bulk import from files; importing from other studios.

## Gate

The founder's local projects appear in the studio; the 8 earlier projects show with their badge and download. Phase 1 is complete when the gates of 041–044 all pass on the **production** URL.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-projects` (import capability)
- **Parent Module**: none
- **Module Capabilities**: import local projects; view legacy summary; download legacy JSON; archive.
- **Dependencies on Other Modules**: `module-projects` save path (043).

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec — a one-time migration path for existing users.

### 3. Usage and Commercial Limits
Not applicable: foundation spec — no quotas; 2 MB scene limit from 043 applies.

### 4. RBAC Requirements
- **Required Permissions**: import — owner, admin, designer; legacy download and archive — owner.
- **Applicable Roles**: existing `org_role`.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: imported projects and versions.
- **Tenant Isolation Requirements**: imports land only in the current studio; the studio is taken from the URL-selected membership and checked by RLS.
- **Storage and Cache Isolation**: local link records include studio id.
- **Background Worker Tenant Context**: none.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Frontend**: banner hidden for viewers; legacy controls shown to owners only.
- **Backend**: RLS and the 043 save function; unique index on `source_local_id`.
- **Audit**: each import writes an audit event.

### 8. Acceptance Criteria and Security Tests
- **RBAC Permission Tests**: a viewer cannot import (pgTAP).
- **Tenant Isolation Tests**: an import cannot target a studio the user does not belong to (pgTAP).
- **Idempotency Tests**: repeated import of the same `source_local_id` creates one project (pgTAP).
- **Flow Tests**: Playwright scenarios for User Stories 1–3; JSON download equality check.
