# Feature Specification: 049 — Routes, Code Splitting and Server State

**Feature Branch**: `049-routes-and-server-state`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 4 — Product shell and performance (estimate 5 days)
**Depends on**: 048
**Blocks**: 050
**Source**: Architecture Review (Frontend: everything loads up front; server data in Zustand; slow tests) and Playbook (049)

## Context

The first screen downloads about 777 KB of gzipped JavaScript — a 1,429 KB main chunk (419 KB gz) plus three.js (1,187 KB, 358 KB gz) — before it shows a project list. There is one `React.lazy` in `src`. Routing is a hand-written hash router (`src/app/router.ts`). Server data is mixed into 41 Zustand store files. Vitest builds jsdom 151 times and takes 136 s.

This spec makes each screen load only what it needs, gives server data one studio-scoped cache, and speeds up the test suite.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — The project list appears fast (Priority: P1)

As a designer on a phone or a slow connection, I want the projects list to appear quickly, so that the app feels responsive before I open the 3D editor.

**Why this priority**: First impression and every return visit.

**Independent Test**: Lighthouse CI on `/s/:slug/projects` (mobile, simulated 4G): LCP < 2.5 s, TBT < 200 ms; the route's JavaScript ≤ 250 KB gzipped.

**Acceptance Scenarios**:

1. **Given** a cold load of the projects route, **When** I inspect network requests, **Then** no three.js, `@react-three/*`, `postprocessing` or `n8ao` chunk is requested.
2. **Given** Lighthouse CI on the projects route, **When** it runs in CI, **Then** LCP < 2.5 s and TBT < 200 ms and the report is attached to the PR.
3. **Given** the bundle budget job, **When** the projects route exceeds 250 KB gzipped, **Then** CI fails.

---

### User Story 2 — Opening the editor is quick and cached (Priority: P1)

As a designer, I want the editor to load its 3D code once and reuse it, so that moving between projects is instant after the first time.

**Acceptance Scenarios**:

1. **Given** I hover a project card, **When** the pointer rests on it, **Then** the editor chunk is prefetched.
2. **Given** I open a project, go back to Projects and open another, **When** I inspect network, **Then** the 3D chunk was downloaded once.
3. **Given** the deliverables route, **When** it loads, **Then** it shares the 3D chunk with the editor.

---

### User Story 3 — Real, shareable URLs (Priority: P1)

As a designer, I want normal URLs for every screen and old links to keep working, so that I can bookmark and share.

**Acceptance Scenarios**:

1. **Given** the app, **When** I navigate, **Then** URLs are `/sign-in`, `/s/:slug/projects`, `/s/:slug/p/:projectId`, `/s/:slug/p/:projectId/deliverables`, `/s/:slug/settings/*`.
2. **Given** an old link `#/project/<id>` or `#/home/<id>`, **When** I open it, **Then** I am redirected to the matching new path and the right project opens.
3. **Given** a deep link while signed out, **When** I sign in, **Then** I land on it (042 behaviour preserved).
4. **Given** Vercel, **When** I reload any path, **Then** the SPA is served (rewrite to `index.html`) and `/api/*` is untouched.

---

### User Story 4 — No cross-studio data on screen (Priority: P1)

As a designer in two studios, I want switching studio to clear everything from the previous one, so that I never see another studio's data.

**Acceptance Scenarios**:

1. **Given** studio A's projects are cached, **When** I switch to studio B, **Then** queries for studio A are removed and studio B's are fetched; no studio A item renders even briefly (test).
2. **Given** sign-out, **When** it completes, **Then** the query cache is cleared.

---

### User Story 5 — Fast tests (Priority: P3)

As a developer, I want the unit suite to run in under 60 s locally, so that I run it often.

**Acceptance Scenarios**:

1. **Given** Vitest config, **When** tests run, **Then** the default environment is `node` and only `*.test.tsx` files use `jsdom`.
2. **Given** a typical laptop, **When** `npm test` runs, **Then** it finishes in under 60 s.

### Edge Cases

- A lazy chunk fails to load after a deploy (stale chunk hash): show a "New version available — reload" message and reload once automatically.
- Hash URLs with query parameters: preserved through the redirect.
- A component test relied on jsdom while named `*.test.ts`: renamed to `.test.tsx` or annotated with `// @vitest-environment jsdom`.
- Editor-only state (selection, undo) must survive route changes within the editor (e.g. editor → deliverables → editor) as it does today.
- `advancedChunks` in `vite.config.ts` is deprecated: replaced with the supported equivalent without changing chunk boundaries' intent.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Routing MUST use TanStack Router with path routes listed in User Story 3; the hand-written router MUST be deleted. (React Router data mode is an acceptable fallback if justified in the plan.)
- **FR-002**: Old hash URLs (`#/project/…`, `#/home/…`) MUST redirect to the new paths.
- **FR-003**: Each route MUST be a lazy chunk; three.js, `@react-three/*`, `postprocessing` and `n8ao` MUST load only with the editor and deliverables routes.
- **FR-004**: The editor chunk MUST be prefetched on project-card hover.
- **FR-005**: TanStack Query MUST hold all server data (projects, versions, members, credits) with query keys that include the studio id; switching studio or signing out MUST clear the previous studio's queries.
- **FR-006**: Zustand MUST keep only editor document state, selection and undo; server data MUST be removed from Zustand stores.
- **FR-007**: CI MUST enforce a bundle budget: the projects route's JavaScript ≤ 250 KB gzipped.
- **FR-008**: Lighthouse CI MUST run on the projects route (mobile, simulated 4G) with LCP < 2.5 s and TBT < 200 ms as assertions.
- **FR-009**: `vite.config.ts` MUST replace the deprecated `advancedChunks` option.
- **FR-010**: Vitest MUST default to `node`, using `jsdom` only for `*.test.tsx`.
- **FR-011**: Vercel MUST rewrite non-API paths to `index.html`.

### Key Entities

- **Route**: path, lazy component, loader (TanStack Query prefetch).
- **Query key**: `[studioId, resource, …params]`.

## Success Criteria *(mandatory)*

- **SC-001**: Projects route ≤ 250 KB gzipped JS (from ~777 KB).
- **SC-002**: Lighthouse mobile LCP < 2.5 s, TBT < 200 ms.
- **SC-003**: Unit suite < 60 s locally (from 136 s).
- **SC-004**: Zero server-data fields remain in Zustand stores (reviewed list in the PR).

## Assumptions

- Cloud data is already in place (043), so moving to TanStack Query is a relocation, not new fetching logic.
- The editor's internal behaviour is unchanged.

## Out of Scope

Visual redesign of the shell and toolbar (050); server-side rendering.

## Gate

The Lighthouse CI report is attached to the PR and meets the numbers; the size budget job is green.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: foundation spec — routing and loading only.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec.

### 3. Usage and Commercial Limits
Not applicable: foundation spec.

### 4. RBAC Requirements
Not applicable: foundation spec — route guards reuse 042's session and membership checks.

### 5. Multi-Tenant Requirements
- **Storage and Cache Isolation**: every query key includes the studio id; studio switch and sign-out clear the cache.
- **Tenant Isolation Requirements**: unchanged; enforced by RLS.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec.

### 7. Enforcement Requirements
Not applicable: foundation spec — no new enforcement; isolation of cached data is a UI correctness rule tested below.

### 8. Acceptance Criteria and Security Tests
- **Tenant Isolation Tests**: switching studio never renders the previous studio's cached data (component/Playwright test).
- **Regression Tests**: all 041–048 suites green.
