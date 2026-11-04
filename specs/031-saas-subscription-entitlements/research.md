# Phase 0: Technical Research & Architectural Decisions

**Feature**: `031-saas-subscription-entitlements`  
**Date**: 2026-11-02  
**Status**: Completed  
**Governing Authority**: Constitution Principle X (*Multi-Tenant SaaS Architecture, Subscription Entitlements, and Plan-Based Feature Access*)

---

## 1. Multi-Layer Policy Evaluation Pipeline

### Context
In B2B SaaS, access control cannot be flattened into a single boolean role check. As mandated by Constitution Principle X, there are three orthogonal dimensions:
1. **Tenant Isolation**: Which customer's data can this user access?
2. **Subscription Entitlements**: What capabilities and quotas has the tenant purchased?
3. **Role-Based Access Control**: What is this specific user authorized to do?

### Decision
Implement `PolicyEvaluationEngine` in `src/domain/platform/saas/policyEngine.ts` evaluating the 6-term formula in a single atomic pass:

$$\text{AccessAllowed} = \text{TenantValid} \land \text{SubscriptionEntitled} \land \text{RolePermissionGranted} \land \text{ResourceScopeValid} \land \text{UsageWithinLimit} \land \text{ContextualPolicySatisfied}$$

```text
Incoming Request -> [1. Tenant Active Check]
                 -> [2. Subscription Entitlement Check]
                 -> [3. Usage Quota Reservation Check]
                 -> [4. RBAC Permission Check]
                 -> [5. Resource Scope Check]
                 -> ALLOW (or DENY with structured failure stage)
```

### Alternatives Considered & Rejected
- *Module-level ad-hoc checks*: Rejected. Embedding `if (tenant.plan === 'enterprise')` inside 3D viewport or cut list generators creates fragmented security boundaries, violates DRY, and risks privilege escalation.
- *Pure RBAC expansion*: Rejected. Letting tenant admins assign permissions without checking subscription entitlements enables rogue admins to unlock premium unpurchased features.

---

## 2. Quantitative Quota Concurrency Strategy

### Context
Quotas govern scarce resources (active projects, licensed seats, rendering credits). Under concurrent requests (e.g. batch invites or simultaneous rendering jobs), race conditions could oversell quotas or create negative balances.

### Decision
Adopt **PostgreSQL Transactional Row Locking (`SELECT ... FOR UPDATE` with conditional decrement)** as decided in Clarification Session 2026-11-02.
- In `public.tenant_usage_quotas`:
  ```sql
  SELECT current_count, max_limit 
  FROM public.tenant_usage_quotas 
  WHERE org_id = $1 AND quota_key = $2 
  FOR UPDATE;
  
  -- If current_count + 1 <= max_limit (or max_limit = -1 for unlimited), proceed with UPDATE.
  -- Otherwise, immediately ROLLBACK and throw QUOTA_EXCEEDED.
  ```
- In-memory pure domain evaluator (`src/domain/platform/saas/quotaManager.ts`) provides instantaneous local checks for UI controls and optimistic drafting.

### Alternatives Considered & Rejected
- *Optimistic Concurrency Control (OCC) with version counter*: Rejected because under high concurrency, OCC causes frequent retry loops and user-visible transaction failures.
- *Distributed Redis Locks*: Rejected because introducing a separate Redis cluster adds operational overhead and breaks Supabase's native ACID transactional guarantees.

---

## 3. Layered Effective Entitlement Model

### Context
Enterprise customers negotiate bespoke agreements (e.g. Starter plan + 5 extra seats + 50GB storage). Creating new one-off plan tiers for every negotiation causes catalog explosion.

### Decision
Implement a layered calculation engine in `src/domain/platform/saas/effectiveEntitlements.ts`:

$$\text{Effective Entitlements} = \text{Base Plan} + \text{Purchased Add-ons} + \text{Contractual Overrides} + \text{Promotions}$$

- **Precedence Order**:
  1. Contractual Overrides (bounded by platform architectural safety ceilings per Clarification 3).
  2. Purchased Add-ons (incremental quotas and feature flags).
  3. Base Commercial Plan.
  4. Promotional Grants (temporary trial boosts).
- All quota calculations are strictly additive: $\text{EffectiveMax} = \text{BaseQuota} + \sum \text{AddonQuotas} + \text{OverrideDelta}$.
- Feature flags evaluate via boolean OR: $\text{FeatureEnabled} = \text{BaseFeature} \lor \text{AddonFeature} \lor \text{OverrideFeature}$.

---

## 4. Subscription Lifecycle State Machine & Grace Policies

### Context
Billing events (card expiration, webhook retries, cancellations) must not abruptly crash active designer sessions or delete customer designs.

### Decision
Define an explicit 8-state subscription lifecycle state machine:

```text
[trial] ──────────────────────────► [active] ◄──────────────────────┐
   │                                  │    ▲                        │
   ▼ (expired)                        │    │ (payment recovered)     │
[expired] ◄────────┐                  ▼    │                        │
   ▲               │             [past_due] (grace period: 7 days)   │
   │               │                  │                             │
   │ (30 days)     │                  ▼ (grace lapsed)              │
   │               │               [paused] (read-only mode)        │
   │               │                  │                             │
   └───────────────┴───────────────[cancelled]                      │
```

- **`trial` (14 days)**: Unlocked core capabilities; transitions to `expired` if no card added.
- **`active`**: Full licensed commercial entitlements.
- **`past_due`**: 7-day payment grace period; studio maintains active editing while warning banners are displayed.
- **`paused`**: Grace period elapsed without recovery; studio locked into read-only access.
- **`cancelled_at_period_end`**: Scheduled cancellation; full access maintained until `current_period_end`.
- **`expired` / `unpaid`**: Read-only archive with 30-day DPDP portability export before statutory cold archiving.

---

## 5. Non-Destructive Downgrade & Project Roster Policy

### Context
When moving from Pro (unlimited) to Starter (limit: 15 active projects), customers with 20 projects must not suffer automated project deletion.

### Decision
Adopt **Tenant-Selected Active Project Roster** (Clarification 1):
1. All existing projects remain 100% intact and permanent.
2. The studio owner is presented with an administrative roster modal to designate which 15 projects remain active and editable.
3. The remaining 5 projects transition to `archived_readonly` status: viewable, exportable to PDF/CSV/DXF, but geometry and specs cannot be altered.
4. Creation of new projects is blocked until the active count drops below 15.

---

## 6. Billing Gateway Integration & Webhook Ingestion

### Context
The platform must support Razorpay for India domestic GST billing while maintaining an abstraction suitable for Stripe global expansion.

### Decision
- Store all monetary values as integer paise ($\text{₹}1 = 100\text{ paise}$).
- Webhook processor verifies HMAC-SHA256 signatures via Web Crypto API before transaction dispatch.
- Ingested webhooks emit tamper-evident events to `audit_log` under event family `commercial` and `subscriptions`.
- Webhook processing immediately invalidates the tenant's in-memory entitlement cache, guaranteeing sub-second access synchronization.
