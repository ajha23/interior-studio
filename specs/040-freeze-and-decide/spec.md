# Feature Specification: 040 — Freeze and Decide (Phase 0)

**Feature Branch**: `040-freeze-and-decide`
**Created**: 2026-11-05
**Status**: Draft
**Phase**: 0 — Freeze and decide (2 days)
**Depends on**: —
**Blocks**: every later foundation spec (041–053)
**Source**: *Interior Studio — Architecture Review & Foundation Plan* (Phase 0) and *Spec Kit Implementation Playbook* (Steps 0.1–0.5)

## Context

Production (`main`) is a local-only editor with no sign-in; its five AI endpoints accept anonymous calls and spend the studio's Gemini key. Two long-lived branches (`main` and `integration`) each carry a different implementation of 034.2.2. The live Supabase project `interior-studio` (ref `pkbctmaiawztzmwqkpgw`, Mumbai) holds the team's real data — 8 projects and 129 saved versions — on a schema that the repo's 12 migrations (`00001`–`00012`) never touched.

Before any rebuilding, the team must stop adding surface area, cap financial exposure, protect the only real data, and change the rules that every later spec is checked against. Phase 0 is mostly operational: four manual steps and one constitution amendment. This spec makes each step verifiable.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Cap AI spend today (Priority: P1)

As the studio founder, I want a hard monthly ceiling on Gemini spend and Vercel usage, so that an anonymous caller hitting the open AI endpoints cannot run up an unbounded bill before spec 045 closes them.

**Why this priority**: It is the only step that protects money, and the exposure exists right now.

**Independent Test**: Open the Google Cloud billing console and the Vercel project settings and confirm the budget, quota and spend management are set.

**Acceptance Scenarios**:

1. **Given** the Google Cloud project that owns `GEMINI_API_KEY`, **When** I open Billing → Budgets, **Then** a monthly budget exists with alert thresholds at 50%, 80% and 100%, emailing the founder.
2. **Given** the Generative Language API, **When** I open its quotas, **Then** requests per day are lowered to a figure no higher than the team's real daily use plus headroom (recorded in the decision record).
3. **Given** the Vercel project, **When** I open Spend Management, **Then** it is enabled with a stated monthly limit and alert.

---

### User Story 2 — One trunk branch (Priority: P1)

As a developer (human or agent), I want `main` to be the only long-lived branch, so that there is one version of the code to fix and review.

**Why this priority**: Every later spec branches from and merges to `main`; two trunks double every review.

**Independent Test**: `git branch -r` lists no `origin/integration`; `main` contains the `integration` specs and passes `npm run check`.

**Acceptance Scenarios**:

1. **Given** `main` at `2068765` and `integration` at `1863f0b`, **When** `chore/merge-integration` merges `origin/integration` with `-X theirs` and its PR merges on green CI, **Then** `main` contains all `specs/` folders from `integration`.
2. **Given** the merge has landed, **When** `git push origin --delete integration` runs, **Then** the remote branch no longer exists and no open PR targets it.
3. **Given** Vercel, **When** I open the project's Git settings, **Then** the production branch is `main` and previews build for every PR.

---

### User Story 3 — Back up the live database (Priority: P1)

As the founder, I want a schema dump and a data dump of the live project stored outside Supabase and outside git, so that nothing done in Phases 1–5 can lose the 8 projects and 129 versions.

**Why this priority**: Spec 041 starts touching migration history on the live project; this is the only rollback.

**Independent Test**: The two dump files exist at a known path outside the repo, are non-empty, and the data dump contains rows for `projects` and `project_versions`.

**Acceptance Scenarios**:

1. **Given** the CLI is linked to `pkbctmaiawztzmwqkpgw`, **When** `supabase db dump` and `supabase db dump --data-only` run, **Then** `~/backups/interior-studio/2026-11-05-schema.sql` and `…-data.sql` exist.
2. **Given** the data dump, **When** I count `INSERT`/`COPY` rows for `project_versions`, **Then** the count is 129.
3. **Given** the repository, **When** I run `git status` and search for the dump filenames, **Then** neither file is tracked or staged, and `.gitignore` excludes `*.sql` dumps under any `backups/` path.

---

### User Story 4 — Feature freeze (Priority: P2)

As the founder, I want a visible freeze on new feature specs until the CI database gate (spec 048) merges, so that billing, manufacturing and MEP stop growing on a foundation that cannot run.

**Why this priority**: Prevents new scope; it costs nothing but must be visible to agents.

**Independent Test**: `docs/ROADMAP.md` starts with the freeze line; open feature branches are closed or labelled.

**Acceptance Scenarios**:

1. **Given** `docs/ROADMAP.md`, **When** I read its first lines, **Then** it states: "Feature freeze until spec 048 (CI database gate) merges. Specs 035 and later wait."
2. **Given** open GitHub branches and PRs for feature work, **When** I list them, **Then** each is closed or labelled `frozen`.

---

### User Story 5 — Constitution 2.3.0 (Priority: P1)

As any agent or reviewer, I want the constitution to make the 034.x failure mode impossible to repeat, so that "done" means it ran against a real database and a signed-in user.

**Why this priority**: Every later spec's Constitution Check is evaluated against these rules.

**Independent Test**: `.specify/memory/constitution.md` reports version 2.3.0 with principles XI and XII, the evidence-based Definition of Done and the branching rule; `AGENTS.md` and `CLAUDE.md` match.

**Acceptance Scenarios**:

1. **Given** constitution 2.2.0, **When** `/speckit-constitution` runs the amendment prompt from the playbook (Step 0.5), **Then** the file reports 2.3.0 (MINOR) with a Sync Impact Report.
2. **Given** the amended file, **When** I read it, **Then** it contains Principle XI "The Database Is the Security Boundary" and Principle XII "Official Clients, No Hand-Written Security Code" with every bullet listed in FR-010 and FR-011.
3. **Given** the Definition of Done, **When** I read it, **Then** it requires a merged PR with green CI, migrations applied to a fresh local Supabase with pgTAP policy tests, and a person who signed into the Vercel preview; reported command output is explicitly not evidence.
4. **Given** the SaaS section, **When** a foundation spec answers items 1–4, 6 or 7, **Then** "Not applicable: foundation spec" plus one sentence is accepted, and item 8 is never optional.

### Edge Cases

- `-X theirs` silently drops a fix that exists only on `main` (PR #8). The merge PR description must list the 7 files that differ and state, per file, which side was kept.
- `npm run check` fails after the merge. The merge PR does not land until it is green; fixes go into the same PR.
- `supabase db dump` needs Docker or a DB password. Record the exact command that worked in the decision record.
- The Gemini key is owned by a personal Google account without billing admin. The founder transfers the key or creates a new key in an owned project and rotates it in Vercel.
- An agent proposes a new spec numbered 035+ during the freeze. It is refused and added to the tracker instead.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: A Google Cloud billing budget MUST exist for the project that owns the production Gemini key, with alerts at 50%, 80% and 100%.
- **FR-002**: The Generative Language API requests-per-day quota MUST be lowered to a recorded value.
- **FR-003**: Vercel spend management MUST be enabled for the project with a recorded monthly limit.
- **FR-004**: `integration` MUST be merged into `main` through a reviewed PR whose description lists each differing file and the side kept; the PR MUST merge only on green CI.
- **FR-005**: The remote `integration` branch MUST be deleted after the merge; Vercel production MUST track `main`.
- **FR-006**: Schema-only and data-only dumps of the live project MUST be stored outside the repository and outside Supabase, dated, and MUST NOT be committed.
- **FR-007**: `.gitignore` MUST exclude database dump files.
- **FR-008**: `docs/ROADMAP.md` MUST begin with the freeze statement in User Story 4.
- **FR-009**: A decision record MUST be added to `docs/DECISIONS.md` (or `docs/architecture/adr-040-baseline.md`) stating: the live Supabase schema is the baseline; 034.x migrations will be archived, not applied; the CAS, idempotency and append-only audit patterns will be ported forward; `main` is the only trunk.
- **FR-010**: The constitution MUST add Principle XI with these rules: RLS enabled with select/insert/update/delete policies on every `public` table; tenant isolation decided only by Postgres policies and RPCs using `auth.uid()`; browser permission checks only affect visibility; every `SECURITY DEFINER` function sets `search_path = ''`, uses schema-qualified names, and has `EXECUTE` revoked from `public`, `anon` and `authenticated` before a single grant; user-facing RPCs never accept an actor id or trust a service role.
- **FR-011**: The constitution MUST add Principle XII: Supabase access only through `@supabase/supabase-js`; tokens verified with Supabase's JWKS (`auth.getClaims` or `jose`); no hand-written JWT, HMAC or crypto code; no default user, studio or organisation ids outside test fixtures.
- **FR-012**: The constitution MUST replace the Definition of Done with the evidence-based version (User Story 5, scenario 3) and add the branching rule: `main` is the only long-lived branch; feature branches live at most 3 days.
- **FR-013**: The constitution MUST amend the mandatory SaaS section to accept "Not applicable: foundation spec" with a one-sentence reason for items 1–4, 6 and 7; item 8 is never optional.
- **FR-014**: `AGENTS.md` and `CLAUDE.md` MUST be updated to match constitution 2.3.0, including the rules: use `supabase-js`; no hand-written crypto or JWT code; every new table gets RLS and pgTAP tests; no `SECURITY DEFINER` without a revoke and a test; no default ids outside tests.

### Key Entities

- **Decision record**: dated document naming the baseline schema, the trunk, the archived migrations and the patterns to port.
- **Backup set**: schema dump + data dump, dated, with the exact commands used.
- **Constitution 2.3.0**: governing document; version, principles, Definition of Done, Sync Impact Report.

## Success Criteria *(mandatory)*

- **SC-001**: `git ls-remote --heads origin` shows `main` and short-lived branches only; no `integration`.
- **SC-002**: Both backup files exist, are non-empty, and the data dump contains 8 project rows and 129 version rows.
- **SC-003**: A test alert or the budget page shows thresholds at 50/80/100% for the Gemini project.
- **SC-004**: Constitution 2.3.0 is merged to `main`; `AGENTS.md` and `CLAUDE.md` reference principles XI and XII.
- **SC-005**: Phase 0 completes in at most 2 working days.

## Assumptions

- The founder has billing-admin access to the Google Cloud project and owner access to Vercel and Supabase.
- `integration` is the better base (it carries the specs); `main`-only fixes are few and are reviewed file by file.
- Backups are kept on the founder's machine plus one off-machine copy (encrypted cloud drive); they contain user data and must not be shared.

## Out of Scope

- Any code change other than the merge, `.gitignore`, `docs/ROADMAP.md`, the decision record, the constitution, `AGENTS.md` and `CLAUDE.md`.
- Closing the AI endpoints (spec 045) or changing the database (spec 041 onward).

## Gate

`main` is the only branch; the backup files exist; the spend cap is set; constitution 2.3.0 is merged.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
Not applicable: foundation spec — Phase 0 changes process and governance, not product modules.

### 2. Subscription Entitlement Requirements
Not applicable: foundation spec — no capability is added or gated.

### 3. Usage and Commercial Limits
Not applicable: foundation spec — the provider spend cap is an operational control, not a tenant quota (tenant credits arrive in 045).

### 4. RBAC Requirements
Not applicable: foundation spec — no roles or permissions change.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: the backup contains every tenant's data; it is stored with owner-only access and never committed.
- **Tenant Isolation Requirements**: unchanged in this phase; principle XI defines the rule all later specs enforce.

### 6. Subscription Lifecycle Behavior
Not applicable: foundation spec — no subscription state is touched.

### 7. Enforcement Requirements
Not applicable: foundation spec — enforcement is introduced by 045–048; this spec writes the rules they enforce.

### 8. Acceptance Criteria and Security Tests
- **Tenant Isolation Tests**: none executable yet; this spec's evidence is the backup row counts, the budget configuration, the absent `integration` branch and the merged constitution diff. The first executable isolation tests arrive in spec 041.
