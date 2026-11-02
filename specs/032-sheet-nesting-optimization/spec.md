# Feature Specification: Algorithmic 2D Sheet Nesting, Cutting Optimization & Visual Workshop Layouts

**Feature Branch**: `032-sheet-nesting-optimization`  
**Created**: 2026-11-02  
**Status**: Draft  
**Constitution Authority**: Principle V (*Manufacturing Traceability, 0-Tolerance Explode & RulePack Governance*), Principle I (*Architectural Layer Isolation*), Principle III (*Deterministic Numerical Contracts*), Principle X (*Multi-Tenant SaaS Architecture & Subscription Entitlements*)  
**Input**: User request: "Implement 2D Sheet Nesting & Cutting Layout Optimization for cabinet manufacturing"

---

## Summary

This feature implements an industrial-grade **2D Rectangular Guillotine Bin-Packing & Sheet Nesting Optimizer** for Interior Studio. It replaces heuristic percentage multipliers (`WASTE = 1.15`) with exact, deterministic panel cutting patterns on standard commercial boards ($2440 \times 1220\text{ mm}$ / 8' × 4').

The optimizer respects:
1. **Material and Thickness Segregation**: Separate nesting runs for 18mm Carcass Plywood, 18mm Shutter HDHMR/MDF, 8mm Backing board, and 0.8mm Laminate sheets.
2. **Saw Blade Kerf & Trim Margins**: Exact saw kerf compensation ($3.2\text{ mm}$ default) and perimeter trim allowance ($10\text{ mm}$ factory edge trimming).
3. **Grain Direction Constraints**: Strict longitudinal grain lock for woodgrain veneers and decorative shutters; arbitrary 90° rotation allowed for carcass parts.
4. **Guillotine Cut Compatibility**: Generates recursive edge-to-edge straight cuts executable on standard workshop panel saws (sliding table saws) as well as continuous nest paths for CNC routers.
5. **Interactive Visualization & Export**: Interactive SVG sheet layout viewer with part labels, dimensional annotations, cut orders, waste percentage telemetry, and multi-page printable workshop PDF/DXF exports.

---

## Clarifications

### Session 2026-11-02
- Q: Which cutting geometry should the nesting algorithm enforce? → A: Dual-Mode: Default to Guillotine cuts (straight edge-to-edge rips and crosscuts for sliding table saws / panel saws), with an optional CNC Router mode (arbitrary rectangular packing without through-cut restrictions).
- Q: How should wood grain orientation constraints be applied by default? → A: Intelligent by Part Role: Carcass panels, dividers, internal shelves, and backs allow 90° rotation to maximize sheet yield; exterior doors, drawer fronts, and decorative infill panels preserve strict vertical/lengthwise grain lock.
- Q: What raw board edge trim margin and saw blade kerf thickness should be configured as default? → A: Standard Indian Workshop: 3.2 mm saw kerf (0.125 in carbide-tipped blade) + 10 mm perimeter edge trim margin (shaved off raw boards to eliminate transport dings).
- Q: What minimum rectangular dimension should qualify an unallocated sheet area as a reusable salvage offcut? → A: 600 × 600 mm (minimum size usable for future small carcass sides, bottom panels, or drawer boxes).

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Deterministic 2D Guillotine Nesting Engine (Priority: P1) 🎯 MVP

As a workshop production engineer, I want the system to compute exact cutting layouts on standard $2440 \times 1220\text{ mm}$ boards from the project's parametric cabinet cut list, minimizing total sheet count and scrap offcuts.

**Why this priority**: Raw board procurement represents up to 45% of cabinet manufacturing costs. Reducing scrap from 15% down to under 8% provides immediate, quantifiable monetary savings for interior design studios and carpentry factories.

**Independent Test**: Provide a cut list of 35 base and wall cabinet panels; verify the optimizer groups panels by material, packs them onto $2440 \times 1220\text{ mm}$ boards without overlap or edge clipping, and calculates exact overall yield percentage.

**Acceptance Scenarios**:
1. **Given** a list of rectangular panels with length, width, quantity, and material, **When** the nesting algorithm runs, **Then** all panels are placed inside raw board boundaries ($2440 \times 1220\text{ mm}$ minus $10\text{ mm}$ trim margin) with zero geometric overlaps.
2. **Given** a panel specified with `grain: 'lengthwise'`, **When** nested, **Then** the panel is strictly oriented along the board's length ($2440\text{ mm}$) and never rotated 90°.
3. **Given** adjacent panels on a sheet, **When** placed, **Then** a spacing equal to the blade kerf ($3.2\text{ mm}$) is preserved between all cut edges.

---

### User Story 2 - Visual Interactive Cutting Diagram Viewer (Priority: P1)

As an interior designer or factory manager, I want to visually inspect the nested boards in the Deliverables Studio, seeing each panel's position, part name, cabinet reference, and edge-banding sides highlighted on the board.

**Why this priority**: Saw operators must verify cutting patterns and label parts before cutting. A visual diagram prevents miscuts and part identification confusion on the factory floor.

**Independent Test**: Navigate to the Deliverables Studio under "Cutting Layouts"; verify the interactive sheet viewer displays a carousel of nested boards with zoom/pan, part hover tooltips, and waste summary metrics.

**Acceptance Scenarios**:
1. **Given** a generated nesting result, **When** viewing the Cutting Layouts tab, **Then** each sheet is rendered with part labels (e.g. `B1: Side L (720 × 560)`), colored edge banding indicators, and offcut zones.
2. **Given** a specific sheet in the viewer, **When** hovering over a nested panel, **Then** a tooltip highlights the source cabinet unit and detailed dimensions.
3. **Given** total nested sheets, **When** inspected, **Then** the header displays aggregate metrics: total boards required, total board area, cut part area, and net material yield percentage ($\text{Part Area} / \text{Board Area} \times 100\%$).

---

### User Story 3 - Multi-Material Segregation & Offcut Classification (Priority: P2)

As a procurement specialist, I want panels to be segregated strictly by core material and thickness, with large remaining offcuts ($>600 \times 600\text{ mm}$) classified for salvage inventory rather than discarded scrap.

**Why this priority**: Cabinet construction mixes multiple sheet types (e.g. 18mm BWP Plywood for sink units, 18mm Pre-laminated Particle Board for dry carcass, 8mm MDF for backs). Mixing materials on the same board causes manufacturing defects.

**Independent Test**: Run nesting on a complete kitchen project with diverse materials; verify separate sheet sequences are produced for 18mm Plywood, 8mm Backer, and 18mm Shutter HDHMR, with salvageable offcuts listed in the BOM.

**Acceptance Scenarios**:
1. **Given** a project with 18mm carcass panels and 8mm drawer bottom panels, **When** nested, **Then** 18mm parts are never placed on 8mm sheets.
2. **Given** a nested sheet with remaining unused rectangular area $\ge 600 \times 600\text{ mm}$, **When** evaluated, **Then** the region is flagged as `Reusable Offcut` with dimensions recorded for inventory reuse.

---

### User Story 4 - Multi-Page Workshop PDF & DXF Nesting Export (Priority: P2)

As a CNC machine programmer or workshop supervisor, I want to export cutting layouts as a multi-page vector PDF workshop package and 2D DXF contours for direct loading into CNC beam saws and nesting routers.

**Why this priority**: Workshops need physical printed sheets clipped to the panel saw or vector CAD contours loaded directly into CNC controller software.

**Independent Test**: Click "Export Cutting Layouts PDF" and "Export Nesting DXF"; verify downloads contain crisp vector sheet diagrams with cut tables and standard 2D DXF polyline contours.

**Acceptance Scenarios**:
1. **Given** a completed nesting layout, **When** clicking "Download PDF", **Then** a multi-page PDF document is generated with one page per sheet, cut sequence instructions, and part callouts.
2. **Given** CNC router integration, **When** clicking "Download DXF Nest", **Then** a `.dxf` file is produced containing separate CAD layers for board perimeter, cut contours, and part text labels.

---

### User Story 5 - Commercial SaaS Entitlement & Usage Guard (Priority: P3)

As a SaaS platform administrator, I want sheet nesting and cutting optimization to be commercialized as an advanced manufacturing capability (`feature.manufacturing.sheet_nesting`), entitled to Pro, Enterprise, and Factory subscription tiers, with consumption tracked via `quota.nesting_runs.monthly.max`.

**Why this priority**: Algorithmic nesting provides immense direct economic ROI. Gating it behind Pro/Enterprise tiers drives subscription upgrades while preventing serverless compute exhaustion.

**Independent Test**: A user on Starter plan attempts to access Cutting Optimization; the central policy engine denies access with `SUBSCRIPTION_UNENTITLED` and prompts for upgrade to Pro Studio.

**Acceptance Scenarios**:
1. **Given** a tenant on Starter tier, **When** accessing Cutting Layouts, **Then** an upgrade banner appears with a lock icon and CTA opening `PlanUpgradeModal`.
2. **Given** a tenant on Pro or Enterprise tier, **When** generating a nesting layout, **Then** `evaluatePolicy()` returns `allowed: true`, and the usage counter `quota.nesting_runs.monthly.max` increments atomically.

---

## Edge Cases

- **Oversized Panels Exceeding Raw Board**: If a single panel dimension exceeds the usable raw board dimensions (e.g. $2500\text{ mm}$ length on a $2440\text{ mm}$ board minus trim), the system MUST flag the panel with an explicit error: `PANEL_EXCEEDS_BOARD_SIZE` and provide split/joint recommendations rather than silently hanging.
- **Grain Lock Contradiction**: If a panel has a strict grain lock along length and its width exceeds $1200\text{ mm}$ (usable width), it cannot fit without rotation; the system MUST reject it with `GRAIN_ORIENTATION_CONFLICT`.
- **Zero or Empty Panels**: When nesting is executed on an empty room or project without cabinets, the engine returns an empty sheet set with zero error.
- **Micro-Offcuts & Kerf Erosion**: Cut gaps smaller than the blade kerf ($3.2\text{ mm}$) cannot be cut by panel saws; the guillotine solver enforces minimum strip widths ($>50\text{ mm}$).
- **High Panel Count Performance**: For large multi-unit projects (200+ panels), algorithm execution MUST complete in under $1000\text{ ms}$ on the client thread using MaxRects / Best-Fit Decreasing heuristic bin-packing without freezing the browser UI.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a pure TypeScript 2D rectangular Guillotine Bin-Packing algorithm (`NestingEngine`) supporting standard $2440 \times 1220\text{ mm}$ board stock with configurable kerf thickness ($3.2\text{ mm}$ default) and edge trim margin ($10\text{ mm}$ default).
- **FR-002**: System MUST enforce grain direction constraints: panels marked with `grain: 'lengthwise'` MUST NOT be rotated, while neutral panels (`grain: 'none'`) MAY rotate 90° if it improves packing density.
- **FR-003**: System MUST group panels by material name and thickness prior to nesting, producing independent sheet sequences for each material.
- **FR-004**: System MUST calculate aggregate and per-sheet utilization metrics: total sheets required, net yield percentage ($\sum \text{Part Area} / \sum \text{Board Area} \times 100\%$), and scrap area.
- **FR-005**: System MUST classify unallocated rectangular zones $\ge 600 \times 600\text{ mm}$ as reusable salvage offcuts with recorded dimensions.
- **FR-006**: System MUST provide an interactive SVG cutting diagram viewer in Deliverables Studio (`CuttingLayoutsPanel`) with zoom, pan, part identification labels, and edge-banding indicators.
- **FR-007**: System MUST generate client-side multi-page printable workshop PDF documents featuring sheet layout diagrams, cut tables, and barcode/QR unit references.
- **FR-008**: System MUST generate 2D DXF vector CAD nest files with distinct layers (`BOARD_OUTLINE`, `PANEL_CUTS`, `PART_LABELS`).
- **FR-009**: System MUST enforce SaaS authorization: access to sheet nesting requires `feature.manufacturing.sheet_nesting` and consumption is tracked via `quota.nesting_runs.monthly.max`.
- **FR-010**: System MUST run 100% deterministically: identical cut lists and settings MUST generate identical sheet packing layouts.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Average net sheet yield across standard 3-meter kitchen layouts achieves $\ge 85\%$ material utilization.
- **SC-002**: Nesting calculation for up to 100 rectangular panels executes in under $500\text{ milliseconds}$ in-memory.
- **SC-003**: 100% of nested panels strictly respect board boundaries and blade kerf spacing with zero geometric overlap anomalies.
- **SC-004**: Generated DXF nest contours open and validate cleanly in AutoCAD / LibreCAD without unclosed loops or intersecting paths.
- **SC-005**: Unentitled subscription tiers authoritatively block nesting calculation with explanatory upgrade prompts.

---

## Assumptions

- Standard raw board size in the Indian modular furniture market is $2440 \times 1220\text{ mm}$ (8' × 4'). Custom board dimensions ($2750 \times 1830\text{ mm}$ / 9' × 6') can be configured in settings.
- Standard sliding table saw blade kerf is $3.2\text{ mm}$ (0.125 in).
- Guillotine cutting assumes straight cuts that run completely from one edge of the stock or strip to the opposite edge (standard table saw operations).
- Standard edge trim of $10\text{ mm}$ on each perimeter edge is shaved to eliminate factory handling dings.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-manufacturing`
- **Parent Module**: None
- **Module Capabilities**: `manufacturing.nesting.optimize`, `manufacturing.nesting.export_pdf`, `manufacturing.nesting.export_dxf`
- **Dependencies on Other Modules**: `module-projects`, `module-saas-platform`

### 2. Subscription Entitlement Requirements
- **Required Entitlement Identifiers**:
  - `feature.manufacturing.sheet_nesting` (Pro, Enterprise, In-House)
  - `feature.manufacturing.cnc_cutlist` (Starter, Pro, Enterprise, In-House)
- **Plans That Include This Capability**:
  - `pro`: Unlimited nesting preview & visual diagrams, 50 monthly exports
  - `enterprise`: Unlimited nesting runs & CNC DXF exports
  - `inhouse`: Unrestricted internal development tier
- **Available Add-ons**: `addon.nesting.monthly.bundle_100`
- **Feature Availability Conditions**: Active subscription status (`trial`, `active`, or `grace_period`).

### 3. Usage and Commercial Limits
- **Applicable Quotas**: `quota.nesting_runs.monthly.max` (Enforced on layout calculation and export)
- **Seat Requirements**: Requires licensed designer or production user seat.
- **Usage Measurement**: Atomically incremented via transactional reservation on export completion.
- **Monthly / Billing-Period Reset Rules**: Resets at 00:00:00 UTC on tenant billing cycle anchor date.
- **Behavior When Limits Are Reached**: Action blocked with explanatory dialog detailing usage vs. limit and upgrade CTA.
- **Overage or Upgrade Behavior**: Prompt to upgrade to Enterprise plan.

### 4. RBAC Requirements
- **Required Permissions**:
  - `production:read` (View cutting diagrams)
  - `production:download_cutlist` (Export PDF/DXF nesting layouts)
  - `production:configure_saw` (Admin/Owner only: adjust kerf and trim margins)
- **Applicable System and Tenant Roles**: `owner`, `admin`, `production`, `designer`
- **Resource-Level Permissions**: Organization-wide and assigned project scope.
- **Administrative Management Requirements**: Tenant administrators can assign production permissions within entitled capabilities.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: Project cut lists, custom saw kerf profiles, saved nesting configurations.
- **Tenant Isolation Requirements**: Scoped by `org_id` with PostgreSQL RLS.
- **Storage and Cache Isolation**: Cached nesting SVGs keyed by `org_id:project_id:version_hash`.
- **Background Worker Tenant Context**: Batch nesting jobs propagate verified tenant identity claims.

### 6. Subscription Lifecycle Behavior
- **Trial Behavior**: 14-day trial includes 5 nesting optimization runs.
- **Upgrade Behavior**: Immediate elevation and quota expansion upon successful payment.
- **Downgrade Behavior**: Existing saved nesting layouts remain viewable in read-only mode; new runs blocked if over quota.
- **Payment Failure / Past Due**: 7-day grace period with warning banners.
- **Cancellation / Expiration**: Read-only export retention for 30 days before archive.
- **Existing Customer Data Preservation**: Zero silent deletion of project designs or cutting lists.

### 7. Enforcement Requirements
- **Frontend Visibility & Interaction Rules**: Unentitled users see locked "Optimize Cutting Layouts" button with upgrade tooltip; clicking opens `PlanUpgradeModal`.
- **Backend / API Authorization Guards**: `withPolicyGuard({ featureKey: 'feature.manufacturing.sheet_nesting' })` protecting nesting endpoints.
- **Background Worker Enforcement**: Reject batch jobs without valid active subscription entitlement.
- **Quota Reservation & Enforcement**: Atomic reservation prevents concurrent compute over-allocation.
- **Audit Requirements**: Emits `production.nesting_computed` and `production.nesting_exported` events to `audit_log`.
- **Entitlement Cache Invalidation**: Immediate invalidation on subscription status changes.

### 8. Acceptance Criteria and Security Tests
- **Included-Plan Access Tests**: Test verifies that Pro tenant executes nesting optimization and downloads PDF diagrams.
- **Excluded-Plan Denial Tests**: Test verifies that Starter tenant is rejected with 403 Forbidden when invoking nesting calculation.
- **RBAC Permission Tests**: Test verifies that `viewer` role cannot export nesting DXF files.
- **Tenant Isolation Tests**: Test verifies Tenant A cannot inspect or download Tenant B's nested cutting sheets.
- **Quota Boundary Tests**: Test verifies nesting export succeeds at quota limit and rejects at limit + 1.
- **Concurrent Usage Tests**: Concurrent nesting compute requests decrement available quota safely without race condition.
- **Subscription Transition Tests**: Test verifies access behavior across past_due -> grace_period -> paused.
