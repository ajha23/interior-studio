# Feature Specification: 050 — Studio Shell and Editor Toolbar

**Feature Branch**: `050-studio-shell-ux`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 4 — Product shell and performance (estimate 5–6 days)
**Depends on**: 049
**Blocks**: Phase 4 completion
**Source**: Architecture Review (UI and UX findings) and Playbook (050)

## Context

The editor is the product's strength: dimensioned 3D, a typed catalogue, a properties panel, a command line and live design checks on one screen. What surrounds it is weak. The editor toolbar has 12 top-level items, mixing design with back-office (Cloud Sync, Studio Tables, Roles & Access); the units menu clips at 1440 px. Home leads with two long forms and an empty list. Site capture is buried inside the desktop editor, though it is used on a phone on site.

This spec separates studio administration from design work, makes Projects the home, and gives site capture its own mobile-first route. It changes where tools are reached from, not how they behave.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Projects is home (Priority: P1)

As a designer, I want to open the app and see my studio's projects with search and status, so that I get to work in one click.

**Why this priority**: The screen every user sees every day.

**Independent Test**: Signed in, `/s/:slug/projects` shows the project list with search, status filter and a single New project action.

**Acceptance Scenarios**:

1. **Given** my studio has projects, **When** I open Projects, **Then** I see name, client, status (lead, design, approved, production, installed), last updated and owner, in card or list view (my choice remembered per browser).
2. **Given** I type in search, **When** results update, **Then** they match project name or client.
3. **Given** I filter by status, **When** I choose "approved", **Then** only approved projects show.
4. **Given** I choose New project, **When** the dialog opens, **Then** I choose Kitchen (existing presets) or Whole home (existing form) and land in the editor on the new project.
5. **Given** I am an owner, admin or designer, **When** I change a project's status, **Then** it persists; viewers see status read-only.

---

### User Story 2 — An editor bar that fits and focuses on design (Priority: P1)

As a designer, I want the editor top bar to show only design and output tools and fit on a 1280 px screen, so that I find tools without hunting.

**Independent Test**: Playwright screenshot at 1280 × 800 shows every primary item, nothing clipped.

**Acceptance Scenarios**:

1. **Given** the editor at 1280 × 800, **When** it renders, **Then** the bar shows: back to Projects, project name with save status, view switch (3D, Plan, Split), Deliverables, BOM, Checks, Export, and an overflow menu, with nothing clipped.
2. **Given** the editor bar, **When** I look for Cloud Sync, Studio Tables or Roles & Access, **Then** they are not there; saving is shown by the 043 status indicator.
3. **Given** the overflow menu, **When** I open it, **Then** it holds less-used editor actions (e.g. units) and every item works.

---

### User Story 3 — Studio administration lives in Settings (Priority: P1)

As a studio owner, I want studio tables, roles and studio settings under Settings, so that administration does not crowd the editor.

**Acceptance Scenarios**:

1. **Given** the shell, **When** I open Settings, **Then** I see Members (042), Roles & Access, Studio Tables and Studio details as sections.
2. **Given** I am a designer or viewer, **When** I open Settings, **Then** sections I cannot manage are hidden or read-only per `org_role`; enforcement stays in the database.

---

### User Story 4 — Site capture on a phone (Priority: P2)

As a designer measuring on site, I want a phone-friendly screen to record wall lengths and photos for a project, so that I do not need a laptop on site.

**Independent Test**: On a 390 px wide viewport, `/s/:slug/p/:projectId/site` records a wall length and a photo.

**Acceptance Scenarios**:

1. **Given** a 390 px viewport, **When** I open the site route, **Then** controls are thumb-sized, single-column, and the 3D editor is not loaded.
2. **Given** the site route, **When** I record a wall length and attach a photo, **Then** both save to the project (photo to storage under the studio path from 047) and appear in the editor afterwards.
3. **Given** I am offline on site, **When** I record, **Then** entries queue locally and sync on reconnect (043 queue).

---

### User Story 5 — Every screen explains itself (Priority: P2)

As any user, I want clear empty, loading and error states and accessible controls, so that I always know what happened and what to do.

**Acceptance Scenarios**:

1. **Given** a studio with no projects, **When** I open Projects, **Then** the empty state explains what a project is and offers New project.
2. **Given** a failed load, **When** the error shows, **Then** it says what failed and offers Retry.
3. **Given** Playwright with axe, **When** it scans Projects, editor shell, Settings and Site capture, **Then** there are no serious or critical violations.
4. **Given** keyboard only, **When** I tab through the shell and editor bar, **Then** every control is reachable with a visible focus ring and an accessible name.

### Edge Cases

- Very long project or client names: truncated with full text on hover/focus; the bar still fits 1280 px.
- Many projects (500+): list remains responsive (virtualized or paginated).
- Status values on legacy projects (044): shown; status change allowed per role.
- Browser camera permission denied on site route: clear message and a file-picker fallback.
- A placeholder control without behaviour: forbidden (constitution UI/UX real-controls standard).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Projects MUST be the default signed-in route, with search, status filter, card/list toggle and one primary New project action.
- **FR-002**: Project status MUST be one of lead, design, approved, production, installed; owners, admins and designers can change it; viewers cannot (enforced by RLS).
- **FR-003**: The editor top bar MUST contain exactly: back to Projects, project name + save status, view switch (3D/Plan/Split), Deliverables, BOM, Checks, Export, overflow menu; it MUST fit at 1280 px.
- **FR-004**: Studio Tables, Roles & Access and studio settings MUST move to Settings in the shell; Cloud Sync MUST be removed from the editor.
- **FR-005**: Site capture MUST be its own mobile-first route `/s/:slug/p/:projectId/site` that does not load the 3D chunk.
- **FR-006**: Every new screen MUST have empty, loading and error states that state what happened and what to do next.
- **FR-007**: All controls MUST be keyboard reachable with visible focus and labels; Playwright MUST run axe on the four screens.
- **FR-008**: Visual design MUST use existing tokens in `src/app/index.css` and `src/components/ui`; no new design system.
- **FR-009**: Editor tools and behaviour MUST NOT change; only their entry points move.
- **FR-010**: Before coding, `design.md` MUST contain a screen inventory, the new information architecture, and a critique of screenshots of the current projects page and editor bar, with findings folded into tasks.

### Key Entities

- **Project status**: enum on `projects` (migration if not present; pgTAP tests for who can change it).
- **Site measurement / photo**: existing domain entities from spec 028, now reached from the site route.

## Success Criteria *(mandatory)*

- **SC-001**: Editor bar at 1280 × 800: zero clipped items (screenshot test).
- **SC-002**: Zero serious/critical axe violations on four screens.
- **SC-003**: Site capture works at 390 px wide.
- **SC-004**: A designer on the team uses the shell for a day without asking where anything is.

## Assumptions

- Site measurement domain logic from spec 028 is reused unchanged.
- Card/list preference is a per-browser convenience (localStorage).

## Out of Scope

New editor tools; client portal; billing screens; a new visual language.

## Gate

A designer on the team uses the new shell for a day and can find everything without asking.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-studio-shell`
- **Parent Module**: none
- **Module Capabilities**: projects home, settings navigation, site capture route.
- **Dependencies on Other Modules**: `module-platform-identity`, `module-projects`.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec — the shell is available to every studio.

### 3. Usage and Commercial Limits
Not applicable: foundation spec.

### 4. RBAC Requirements
- **Required Permissions**: Settings sections follow `org_role` (members/roles/tables management — owner, admin); project status change — owner, admin, designer.
- **Applicable Roles**: existing `org_role`.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: projects, site photos and measurements.
- **Storage and Cache Isolation**: site photos under `<org_id>/<project_id>/`; queries keyed by studio (049).

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
- **Frontend**: controls hidden for roles that cannot use them.
- **Backend**: enforcement already in the database (RLS, storage policies).

### 8. Acceptance Criteria and Security Tests
- **RBAC Permission Tests**: viewer cannot change project status (pgTAP); Settings hides management for designers (Playwright).
- **Tenant Isolation Tests**: site photos land only under the current studio path (storage pgTAP from 047 extended).
- **Accessibility Tests**: axe on four screens.
