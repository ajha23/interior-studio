# Feature Specification: Multi-Tenant SaaS Subscription, Entitlement and Unified Policy Engine

**Feature Branch**: `031-saas-subscription-entitlements`  
**Created**: 2026-11-02  
**Status**: Draft  
**Constitution Authority**: Principle X (*Multi-Tenant SaaS Architecture, Subscription Entitlements, and Plan-Based Feature Access*), Principle VI (*Modular Architecture & Configurable Dynamic Authorization*), Principle VII (*Multi-Tenant Isolation & DPDP*)

---

## Summary

This foundational platform feature establishes a centralized **Multi-Tenant SaaS Subscription, Entitlement and Unified Policy Evaluation Platform** for Interior Studio. It decouples commercial subscription licensing from tenant RBAC and tenant data isolation, enforcing access through a single authoritative formula:

$$\text{AccessAllowed} = \text{TenantValid} \land \text{SubscriptionEntitled} \land \text{RolePermissionGranted} \land \text{ResourceScopeValid} \land \text{UsageWithinLimit} \land \text{ContextualPolicySatisfied}$$

All business modules integrate with the central policy evaluation engine without embedding hardcoded plan tier names (`trial`, `starter`, `pro`, `enterprise`) or billing provider conditionals. Commercial plans define capabilities and quantitative quotas using stable, canonical identifiers (`module.*`, `feature.*`, `quota.*`). Tenant-specific commercial overrides and add-ons are supported via a deterministic layered calculation ($\text{Effective} = \text{Base Plan} + \text{Add-ons} + \text{Overrides} + \text{Promotions}$). Subscriptions transition through an explicit lifecycle state machine, and plan downgrades are guaranteed to be non-destructive (preserving customer data and locking excess resources into a read-only state).

---

## Clarifications

### Session 2026-11-02
- Q: When a tenant downgrades to a lower subscription tier and their existing active project count exceeds the new tier's quota, how should the application restrict access to those existing projects? → A: Option C: Tenant administrator explicitly designates which projects remain active up to the new quota; unselected projects transition into a protected read-only archive mode, preserving all designs without silent loss.
- Q: When concurrent requests attempt to reserve or consume quantitative quotas, which concurrency control mechanism should the backend enforce to prevent over-allocation? → A: Option A: PostgreSQL row-level pessimistic locking (`SELECT ... FOR UPDATE` with conditional decrement) inside database transactions, guaranteeing zero negative balances.
- Q: Can tenant-specific contractual overrides or promotional grants exceed platform architectural safety limits? → A: Option A: Commercial-Only Overrides: Overrides may adjust commercial business quotas (projects, seats, credits) freely, but cannot bypass platform architectural safety ceilings (e.g. file size caps, geometry bounds).
- Q: When a customer upgrades their subscription tier in the middle of a billing period, how should monthly consumable quotas be credited? → A: Option A: Delta Allocation: Immediately credit the incremental difference between the new tier quota and the previous tier quota while preserving the original billing cycle anniversary anchor date.

---

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Versioned Subscription Catalog & Capability Entitlement Registry (Priority: P1)

As a SaaS platform administrator, I want to define and version commercial subscription plans, assign module capabilities and quantitative quotas using canonical feature identifiers, and maintain the catalog independently of application code deployments.

**Why this priority**: Business modules must not hardcode plan names or commercial rules. The commercial catalog must evolve (introducing new tiers, pricing, and packaging) without touching business module code.

**Independent Test**: Register a new plan in the subscription catalog, assign standard 2D drafting and 3D modeling features, and verify that the entitlement engine indexes and serves the plan's effective capabilities.

**Acceptance Scenarios**:
1. **Given** a platform administrator creating a commercial plan version (e.g. `Pro Studio v2`), **When** features and quotas are attached using canonical keys (`feature.design.3d.render`, `quota.projects.active.max`), **Then** the plan is indexed in the `SubscriptionCatalog` with effective pricing and quotas.
2. **Given** an existing tenant on `Pro Studio v1`, **When** `Pro Studio v2` is published with altered feature limits, **Then** existing tenants retain their contractual `v1` entitlements until explicitly migrated or renewed.

---

### User Story 2 - Central Policy Evaluation Engine (Unified Access Check) (Priority: P1) 🎯 MVP

As a security architect, I want every protected operation across the API, command bus, and UI to be evaluated by a unified `PolicyEvaluationEngine` that combines tenant validity, subscription entitlement, RBAC permissions, resource scoping, and quota availability in a single authoritative evaluation pass.

**Why this priority**: Decoupling RBAC from subscription licensing prevents privilege bypass. An administrator cannot grant a designer a capability (e.g. CNC cut list download or AI rendering) that the tenant's commercial subscription does not license.

**Independent Test**: An authorized tenant administrator assigns a designer a custom role with `production.download_cutlist`. If the tenant's subscription tier is `Starter` (which does not entitle CNC cut lists), the operation is rejected by the backend with an explicit `SUBSCRIPTION_UNENTITLED` error.

**Acceptance Scenarios**:
1. **Given** an active tenant with an entitled plan and an authorized user with appropriate RBAC permissions and project assignment, **When** invoking a protected operation, **Then** `evaluatePolicy()` returns `allowed: true`.
2. **Given** a user holding an administrator role, **When** attempting an operation requiring a capability excluded from the tenant's subscription plan, **Then** `evaluatePolicy()` returns `allowed: false` with reason `SUBSCRIPTION_UNENTITLED` and the required upgrade tier.
3. **Given** a valid subscription, **When** a user lacks the specific role permission for that operation, **Then** `evaluatePolicy()` returns `allowed: false` with reason `RBAC_PERMISSION_DENIED`.

---

### User Story 3 - Quantitative Usage Tracking & Concurrency-Safe Quota Reservation (Priority: P2)

As a studio manager, I want quantitative quotas (e.g. maximum active projects, designer seats, monthly rendering credits, and AI generations) to be tracked accurately, with atomic reservations that prevent concurrent requests from exceeding purchased limits.

**Why this priority**: Resource and consumption limits protect cloud infrastructure and ensure fair commercial billing. Concurrency breaches can cause uncontrolled infrastructure spend or unbilled resource consumption.

**Independent Test**: A studio on Starter plan (limit: 15 active projects) attempts to create a 16th project. The quota manager rejects the creation with a `QUOTA_EXCEEDED` error and prompts for an upgrade.

**Acceptance Scenarios**:
1. **Given** a tenant with remaining quota for a consumable resource (e.g. rendering credits), **When** a rendering job is initiated, **Then** the quota is atomically reserved and deducted upon completion.
2. **Given** multiple concurrent creation requests attempting to exceed a project or seat quota, **When** evaluated, **Then** only requests within the remaining allocation succeed, and excess requests are cleanly rejected without over-allocation.
3. **Given** monthly consumable quotas (e.g. monthly AI operations), **When** the billing period rolls over, **Then** usage counters reset to zero in alignment with the tenant's billing cycle.

---

### User Story 4 - Layered Tenant-Specific Overrides & Commercial Add-ons (Priority: P2)

As an enterprise sales director, I want to attach commercial add-ons (e.g. 10 extra designer seats or additional monthly rendering bundles) and tenant-specific contractual overrides to a customer's base plan without creating custom one-off plan tiers.

**Why this priority**: Enterprise customers negotiate bespoke contracts (e.g. Pro tier + dedicated ERP integration + 50 extra projects). Creating separate plan tiers for every negotiation causes plan explosion and maintenance overhead.

**Independent Test**: Assign a tenant on Starter tier a commercial add-on for `addon.storage.50gb` and verify that the effective storage limit increases from 5GB to 55GB.

**Acceptance Scenarios**:
1. **Given** a tenant with a base plan, **When** an add-on is purchased, **Then** effective entitlements recalculate deterministically as $\text{Base} + \text{Add-ons}$.
2. **Given** a contractual enterprise override with an expiration date, **When** active, **Then** the override supersedes base limits; when expired, access smoothly returns to standard plan limits.

---

### User Story 5 - Explicit Subscription Lifecycle & Non-Destructive Downgrade Retention (Priority: P2)

As a customer whose subscription lapses or downgrades, I want my existing projects, 3D designs, and drawings to be preserved without silent deletion, entering a protected read-only state until I renew or upgrade.

**Why this priority**: Data loss during payment failures or plan changes destroys customer trust and violates contractual data stewardship. Statutory compliance requires transparent data retention and export.

**Independent Test**: Downgrade a tenant with 20 active projects from Pro (unlimited) to Starter (limit: 15). Verify that all 20 projects remain viewable and exportable, existing projects cannot be duplicated or edited if exceeding limit, and new project creation is blocked until active count is below 15.

**Acceptance Scenarios**:
1. **Given** a tenant entering `past_due` status due to a failed card payment, **When** accessing the application, **Then** access is maintained during the 7-day grace period with prominent payment warning banners.
2. **Given** a plan downgrade where existing resource counts exceed new plan limits, **When** accessed, **Then** all existing records remain intact and viewable; the studio owner is prompted to designate active projects up to the quota, non-selected projects enter read-only archive status, and creation of new resources is blocked until active usage falls within limits.
3. **Given** a cancelled subscription reaching the end of its billing cycle, **When** transitioning to `expired`, **Then** the tenant is placed in read-only access mode with DPDP export availability for 30 days before statutory archiving.

---

### User Story 6 - Auditable Governance & Commercial Billing Integration (Priority: P3)

As a compliance officer, I want all subscription lifecycle state changes, plan upgrades/downgrades, manual contractual overrides, and quota adjustments to emit tamper-evident audit records.

**Why this priority**: Statutory compliance (DPDP Act 2023, SOC 2, ISO 27001) mandates verifiable tracking of commercial access grants, billing transitions, and administrative overrides.

**Independent Test**: Apply an administrative quota override to a tenant; verify that `audit_log` records event `subscriptions.override_applied` with actor ID, timestamp, previous allocation, and new allocation.

**Acceptance Scenarios**:
1. **Given** a billing webhook from Razorpay/Stripe, **When** verified and processed, **Then** an audit event `subscriptions.status_changed` is emitted and effective entitlements update atomically.
2. **Given** an administrator applying an emergency quota increase, **When** committed, **Then** the audit log captures the justification, actor ID, and exact delta.

---

## Edge Cases

- **Cross-Tenant Impersonation**: A tenant ID provided via client headers or query parameters MUST be rejected unless cryptographically verified against the authenticated user's session claims.
- **Clock Drift & Periodic Quota Resets**: Monthly quota resets MUST compute using the tenant's statutory billing anchor timestamp (`current_period_start`), not server local wall clock time.
- **Race Condition in Quota Depletion**: Two concurrent requests for the final remaining seat or project MUST execute through atomic database transactions (`SELECT ... FOR UPDATE` or conditional SQL decrement) ensuring exactly one succeeds.
- **Offline / Disconnected Grace Mode**: In offline mode, the client enforces cached entitlements in read-only mode and strictly forbids quota reservation or privileged plan elevation.
- **Mid-Cycle Plan Upgrades**: When upgrading mid-cycle, new capabilities unlock immediately and consumable monthly quotas receive the incremental difference ($\text{New Quota} - \text{Old Quota}$) added to remaining balances, while retaining the tenant's existing monthly billing cycle anniversary anchor date.
- **Contractual Override Ceiling**: When calculating effective entitlements, the engine validates requested quota values against immutable system safety ceilings (e.g. max file size, max vertex count) to prevent accidental denial-of-service or memory exhaustion.

---

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a centralized `SubscriptionCatalog` defining versioned commercial plans, pricing references in integer paise, included module/feature capabilities, and quantitative quotas.
- **FR-002**: System MUST provide a centralized `EntitlementRegistry` indexing canonical identifiers for modules (`module.*`), features (`feature.*`), and quotas (`quota.*`).
- **FR-003**: System MUST provide an `EffectiveEntitlementManager` calculating cumulative tenant entitlements using strict layered precedence: $\text{Base Plan} + \text{Add-ons} + \text{Contractual Overrides} + \text{Promotional Grants}$. Contractual overrides MAY expand commercial quotas (projects, seats, credits) freely, but MUST NOT bypass platform architectural safety limits (file size limits, geometry vertex bounds).
- **FR-004**: System MUST implement a unified `PolicyEvaluationEngine` evaluating the 6-term formula ($\text{TenantValid} \land \text{SubscriptionEntitled} \land \text{RolePermissionGranted} \land \text{ResourceScopeValid} \land \text{UsageWithinLimit} \land \text{ContextualPolicySatisfied}$) on every protected boundary.
- **FR-005**: System MUST forbid tenant administrators from granting RBAC permissions for capabilities not licensed in the tenant's effective subscription entitlements.
- **FR-006**: System MUST enforce quantitative quotas using concurrency-safe atomic reservations (`UsageQuotaManager`) via PostgreSQL row-level pessimistic locking (`SELECT ... FOR UPDATE` with conditional decrement), strictly preventing negative balances or over-allocation of licensed seats, active projects, and monthly compute credits.
- **FR-007**: System MUST support an explicit subscription lifecycle state machine: `trial`, `active`, `past_due`, `grace_period`, `paused`, `cancelled_at_period_end`, `expired`, and `unpaid`.
- **FR-008**: System MUST guarantee non-destructive plan downgrades: existing user designs and project data MUST NOT be deleted upon downgrade. When active projects exceed the new tier's quota, the tenant administrator MUST explicitly designate which projects remain active up to the quota, while unselected projects transition to protected read-only archive mode; new project creation is blocked until active counts drop below the quota.
- **FR-009**: System MUST enforce all subscription entitlement and quota boundaries on trusted backend API, RPC, and database boundaries; frontend UI state MUST NOT act as a security control.
- **FR-010**: System MUST record all plan changes, add-on activations, quota overrides, and subscription lifecycle transitions in the append-only `audit_log`.
- **FR-011**: System MUST keep internal release feature flags strictly decoupled from commercial subscription entitlements.
- **FR-012**: System MUST provide automated positive and negative test suites covering included-plan access, excluded-plan denial, quota boundaries, downgrade retention, and cross-tenant isolation.

---

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Central policy evaluation latency overhead is under 5 milliseconds per check in-memory and under 15 milliseconds across database boundaries.
- **SC-002**: 100% of protected operations authoritatively reject unentitled operations at the backend, regardless of client-side presentation state.
- **SC-003**: Zero customer data loss or silent project deletion during simulated plan downgrades from Enterprise to Starter tiers across automated test suites.
- **SC-004**: 100% of concurrent quota exhaustion attempts prevent over-allocation with zero negative balance anomalies.
- **SC-005**: All subscription status updates from billing webhooks synchronize effective tenant entitlements in under 500 milliseconds.

---

## Assumptions

- PostgreSQL 16 with Supabase Row-Level Security remains the authoritative persistence and data isolation layer.
- Razorpay remains the primary payment provider for India domestic INR transactions, with Stripe-compatible abstraction patterns for global expansion.
- All monetary values are represented as integer paise ($\text{₹}1 = 100\text{ paise}$) with zero floating-point representation.
- Studio designers and staff authenticate via Supabase Auth JWTs carrying verified tenant (`org_id`) claims.

---

## SaaS Subscription, Entitlement and Authorization Requirements *(mandatory per Constitution Principle X)*

### 1. Module Registration
- **Module Identifier**: `module-saas-platform`
- **Parent Module**: None (Root platform governance infrastructure)
- **Module Capabilities**: `saas.subscription.manage`, `saas.catalog.read`, `saas.entitlements.evaluate`, `saas.quotas.reserve`, `saas.overrides.apply`
- **Dependencies on Other Modules**: `module-governance`

### 2. Subscription Entitlement Requirements
- **Required Entitlement Identifiers**:
  - `feature.governance.custom_roles` (Pro, Enterprise, In-House)
  - `feature.design.3d.export_cad` (Pro, Enterprise, In-House)
  - `feature.manufacturing.cnc_cutlist` (Starter, Pro, Enterprise, In-House)
  - `feature.commercial.margin_editor` (Pro, Enterprise, In-House)
  - `feature.ai.layout_generator` (Starter [limited], Pro, Enterprise, In-House)
- **Plans That Include This Capability**:
  - `trial`: 14-day access to core modeling, 1 designer, 5 projects
  - `starter`: 2 designers, 15 active projects, cut list export, AI layout
  - `pro`: 5 designers, unlimited active projects, DXF export, accounting CSV, custom roles
  - `enterprise`: 25 designers, unlimited projects, custom rule packs, ERP export, dedicated audit
  - `inhouse`: Internal unlocked development tier
- **Available Add-ons**: `addon.seats.designer.bundle_5`, `addon.projects.active.bundle_25`, `addon.renderings.monthly.bundle_100`
- **Feature Availability Conditions**: Active subscription status (`trial`, `active`, or `grace_period`).

### 3. Usage and Commercial Limits
- **Applicable Quotas**:
  - `quota.seats.designers.max` (Enforced on member invitation and role assignment)
  - `quota.projects.active.max` (Enforced on project creation and unarchiving)
  - `quota.renderings.monthly.max` (Enforced on 3D perspective image rendering)
  - `quota.ai_operations.monthly.max` (Enforced on AI layout generation and voice assistant)
- **Seat Requirements**: Users assigned to designer or editor roles require an active licensed seat.
- **Usage Measurement**: Atomically incremented via transactional reservation; reset on `current_period_start` anniversary.
- **Monthly / Billing-Period Reset Rules**: Consumable monthly quotas reset at 00:00:00 UTC on the tenant's billing cycle anchor date.
- **Behavior When Limits Are Reached**: Action blocked with explanatory dialog detailing current usage vs. plan limit and upgrade CTA.
- **Overage or Upgrade Behavior**: Prompt to upgrade plan tier or purchase self-serve add-on bundle.

### 4. RBAC Requirements
- **Required Permissions**:
  - `billing:manage` (Owner only)
  - `subscriptions:view` (Owner, Admin)
  - `subscriptions:change_plan` (Owner only)
  - `entitlements:override` (Platform Superadmin only)
- **Applicable System and Tenant Roles**: `owner`, `admin`
- **Resource-Level Permissions**: Organization-wide scope (`all_projects`)
- **Administrative Management Requirements**: Tenant administrators can view billing and active entitlements; only platform administrators can apply contractual overrides.

### 5. Multi-Tenant Requirements
- **Tenant-Owned Resources**: `tenant_subscriptions`, `tenant_entitlement_overrides`, `tenant_usage_quotas`, `tenant_quota_reservations`
- **Tenant Isolation Requirements**: PostgreSQL RLS policies enforce `org_id = auth.jwt() ->> 'org_id'` across all billing and quota tables.
- **Storage and Cache Isolation**: In-memory entitlement cache partitioned by `org_id`; cache invalidation triggered on subscription webhook.
- **Background Worker Tenant Context**: Video walkthrough and batch export workers execute under verified tenant context with entitlement validation prior to queue pickup.

### 6. Subscription Lifecycle Behavior
- **Trial Behavior**: 14 days full access to core capabilities; automatic transition to `expired` if no payment method added.
- **Upgrade Behavior**: Immediate entitlement elevation and quota expansion upon successful payment authorization.
- **Downgrade Behavior**: Excess active projects and designer seats preserved in read-only state; creation of new items blocked.
- **Payment Failure / Past Due**: 7-day grace period with warning banners; transitions to `paused` (read-only) on day 8.
- **Cancellation / Expiration**: Access maintained until `current_period_end`; 30-day read-only export retention before archive.
- **Existing Customer Data Preservation**: Zero silent deletion; customer designs remain permanently downloadable in standard formats.

### 7. Enforcement Requirements
- **Frontend Visibility & Interaction Rules**: Unentitled buttons annotated with lock icons and upgrade tooltips; clicking opens `PlanUpgradeModal`.
- **Backend / API Authorization Guards**: `withPolicyGuard()` server middleware enforcing `evaluatePolicy()` prior to request execution.
- **Background Worker Enforcement**: Workers reject unentitled jobs before compute execution.
- **Quota Reservation & Enforcement**: Atomic database reservation prevents concurrency overselling.
- **Audit Requirements**: All subscription transitions and manual overrides emit `AuditRecord`s to `audit_log`.
- **Entitlement Cache Invalidation**: Webhooks immediately burst tenant entitlement cache.

### 8. Acceptance Criteria and Security Tests
- **Included-Plan Access Tests**: Test verifies that Pro tenant successfully exports AutoCAD DXF drawings.
- **Excluded-Plan Denial Tests**: Test verifies that Starter tenant is rejected with 403 Forbidden when requesting DXF export.
- **RBAC Permission Tests**: Test verifies that designer role in an Enterprise tenant cannot access billing settings.
- **Tenant Isolation Tests**: Test verifies that Tenant A cannot query or alter Tenant B's subscription or quotas.
- **Quota Boundary Tests**: Test verifies project creation succeeds at count 14, succeeds at count 15, and is rejected at count 16 on Starter plan.
- **Concurrent Usage Tests**: 10 parallel requests for 1 remaining seat result in exactly 1 success and 9 rejections.
- **Subscription Transition Tests**: Test simulates payment failure -> grace period -> paused -> reactivation, verifying appropriate access states at each phase.
