# Interior Studio — Information Architecture and UX Baseline

- Status: Proposed UX baseline
- Audience: studio owner, project manager, interior designer, surveyor, estimator, production user, client

## 1. UX objective

The product should feel like one coherent project workspace with specialist workspaces for design, survey, MEP, approvals and production.

Do not turn the nine lifecycle stages into nine unrelated applications. Preserve the existing 2D/3D editor as a specialist design workspace.

## 2. Global navigation

### Primary
- Overview
- Projects
- Clients
- Design Studio
- Libraries
- Deliverables
- Production
- Reports

### Administration
- Team and Roles
- Subscription and Billing
- Studio Settings
- Audit and Security

Navigation visibility is a UX concern only. Every action remains protected by backend authorization and subscription policy.

## 3. Project overview

Header:
- project name;
- client;
- site/location;
- project owner and team;
- current operational stage;
- current revision;
- last updated.

Main sections:
- lifecycle stage progress;
- next action and owner;
- blockers and warnings;
- recent activity;
- pending approvals;
- stale artifacts;
- spaces and their status;
- recent deliverables.

The overview must answer:
1. Where is this project?
2. What has been completed?
3. What is blocked?
4. Which outputs are stale?
5. Who needs to act next?

Do not communicate readiness with color alone. Include text, reason and affected artifact.

## 4. Project workspace layout

Recommended desktop composition:
- top project context bar;
- left stage/space navigation;
- central active stage workspace;
- right inspector/context panel;
- collapsible bottom activity, comments and AI assistant panel.

Responsive behavior:
- On tablet, inspector and stage navigation become drawers.
- On mobile, prioritize survey capture, photo/evidence, approvals, task actions and status. The full precision 3D editor may remain desktop-first until interaction and performance are validated.

## 5. Stage workspaces

### 5.1 Site survey
- Measurement canvas/plan.
- Wall and space selector.
- Length, height, thickness, angle and diagonal inputs.
- Door/window/beam/column and service-point observations.
- Wall-tagged photos and sketches.
- Source, confidence, uncertainty and verification status.
- Closure diagnostics and unresolved discrepancies.
- Save draft, submit for verification and verify actions.

Never prefill default dimensions as if they were captured facts. If a value is initialized from an architectural plan or room preset, label its source and require confirmation.

### 5.2 MOM and requirements
- Meeting date and attendees.
- Notes and source documents.
- AI-extracted candidate decisions.
- Confirmed requirements.
- Inclusions/exclusions.
- Company, contractor and client scope ownership.
- Space-specific requirements.
- Materials, appliances, accessories and budget.
- Open questions and action items.
- Version history and PDF export.

Clearly distinguish proposed, confirmed, rejected and superseded requirements.

### 5.3 Initial 2D planning
- Large plan canvas.
- Space and wall dimensions.
- Openings and circulation.
- Spatial zones and layout alternatives.
- Survey/requirement reference panel.
- Constraint and discrepancy overlays.

### 5.4 3D and detailed design
Retain the existing editor:
- 2D/3D split view;
- scene outline;
- direct editing;
- dimension inspector;
- material selection;
- undo/redo;
- camera and walk mode;
- AI proposal preview.

Add project context:
- active space and revision;
- linked survey;
- relevant confirmed requirements;
- active module/catalog versions;
- MEP association indicators;
- stale downstream outputs.

### 5.5 MEP/EPL
- Electrical, plumbing, gas, exhaust and lighting layers as enabled.
- Editable service points and appliance association.
- Position and elevation fields.
- Derived/manual/proposed markers.
- Clash and clearance warnings.
- Approval and drawing preview.

### 5.6 Client approval/NFP
- Client-facing presentation.
- Design revision and artifact manifest.
- Materials/hardware schedule.
- MEP readiness.
- Quote snapshot and terms.
- Outstanding decisions.
- Approval decision, signer, timestamp and comments.

### 5.7 Production
- Production readiness and blockers.
- Rule-pack identity, version and approval state.
- Part and hardware schedules.
- Edge-band summary.
- Shop drawings and factory export profile.
- Package hash and verification.
- Release history and work order.

### 5.8 Handover
- Work order progress.
- Dispatch/installation status.
- Room/element installation checklist.
- Photos and snag list.
- Responsible person and due date.
- Customer sign-off and handover pack.

## 6. Design impact preview

Before committing a change that affects dependent artifacts, show:
- proposed change;
- changed design elements;
- geometry/constraint results;
- affected MEP points;
- stale drawings/BOM/quote/production outputs;
- approval consequences;
- whether a human approval is required.

Example: changing a sink base from 600 mm to 800 mm should show the cabinet/adjacent-run effect, countertop recalculation, MEP association review and stale downstream artifacts.

The preview must be computed from the actual domain change set and dependency graph, not generated solely by AI prose.

## 7. AI interaction

AI assistant should be available in context but never obscure precision controls.

Use:
- conversational request;
- typed structured proposal;
- preview and diff;
- validation/warnings;
- apply/reject;
- audit/activity record.

For survey/MOM extraction, display source evidence next to the proposed fact. Never imply AI-extracted data is verified.

For destructive, multi-object, approval or production actions, require explicit confirmation and authorization.

## 8. Accessibility and interaction standards

- Keyboard-accessible controls and focus management.
- Explicit units in every measurement field.
- No silent rounding or clamping.
- Error messages state accepted range and unit.
- Color is not the only status indicator.
- Confirm destructive actions.
- Preserve undo for reversible design operations.
- Explain when an action is blocked by permission, plan entitlement, missing prerequisite or stale revision.
- Show the exact reason and next action.

## 9. UX acceptance scenarios

1. Designer opens a project and sees lifecycle, blockers and next action.
2. Designer opens a space and enters the existing 2D/3D editor without losing project context.
3. Surveyor records a measurement and sees its source/verification state.
4. Designer reviews AI-extracted MOM requirements and confirms or rejects them.
5. Designer changes a design element and sees affected outputs before applying.
6. MEP user sees stale points and associated appliance.
7. Client sees only the approved client-facing artifact manifest.
8. Production user sees only the released immutable package and authorized technical data.
9. A denied action explains whether the cause is role, scope, subscription, quota or workflow gate.

## 10. Validation required [V]

- Confirm terminology and stage labels used by the studio.
- Confirm exact NFP/EPL meaning and client review flow.
- Validate mobile survey workflow with actual surveyors.
- Validate workshop screen needs with factory users.
- Confirm client portal versus downloadable approval package.
- Conduct usability testing with the initial 2–5 designers before broad redesign.
