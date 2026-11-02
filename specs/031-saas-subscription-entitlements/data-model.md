# Phase 1: Data Model & Database Schema Specification

**Feature**: `031-saas-subscription-entitlements`  
**Date**: 2026-11-02  
**Status**: Completed  
**Governing Authority**: Constitution Principle X, Principle III (Integer Paise), Principle VII (Multi-Tenant RLS), Principle VIII (Schema Evolution)

---

## 1. Domain Entities & Zod Schemas

Located in: `src/domain/platform/saas/types.ts` (100% framework-free TypeScript).

```typescript
import { z } from 'zod';

/**
 * Subscription Lifecycle States (FR-007)
 */
export const SubscriptionStatusSchema = z.enum([
  'trial',
  'active',
  'past_due',
  'grace_period',
  'paused',
  'cancelled_at_period_end',
  'expired',
  'unpaid',
]);
export type SubscriptionStatus = z.infer<typeof SubscriptionStatusSchema>;

/**
 * Billing Cadence
 */
export const BillingCycleSchema = z.enum(['monthly', 'annual']);
export type BillingCycle = z.infer<typeof BillingCycleSchema>;

/**
 * Canonical Feature & Quota Identifier Keys (FR-002)
 */
export const CanonicalKeySchema = z.string().regex(/^(module|feature|quota|addon)\.[a-z0-9_.-]+$/);
export type CanonicalKey = z.infer<typeof CanonicalKeySchema>;

/**
 * Commercial Plan Definition Schema (FR-001)
 */
export const SubscriptionPlanSchema = z.object({
  id: z.string().min(1), // e.g. 'starter_v1', 'pro_v2'
  name: z.string().min(1),
  version: z.number().int().min(1).default(1),
  tagline: z.string().default(''),
  priceMonthlyPaise: z.number().int().min(0), // e.g. 1,299,900 paise = ₹12,999
  priceAnnualPaise: z.number().int().min(0),
  isPublic: z.boolean().default(true),
  features: z.record(CanonicalKeySchema, z.boolean()),
  quotas: z.record(CanonicalKeySchema, z.number().int()), // -1 indicates unlimited
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

/**
 * Tenant Active Subscription Record (FR-007)
 */
export const TenantSubscriptionSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid(),
  planId: z.string().min(1),
  planVersion: z.number().int().min(1),
  cycle: BillingCycleSchema.default('monthly'),
  status: SubscriptionStatusSchema.default('trial'),
  currentPeriodStart: z.string().datetime(),
  currentPeriodEnd: z.string().datetime(),
  gracePeriodEndsAt: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean().default(false),
  gatewayCustomerId: z.string().optional(),
  gatewaySubscriptionId: z.string().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type TenantSubscription = z.infer<typeof TenantSubscriptionSchema>;

/**
 * Tenant Contractual Entitlement Override & Add-on (FR-003, US4)
 */
export const TenantEntitlementOverrideSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid(),
  key: CanonicalKeySchema,
  overrideType: z.enum(['feature_toggle', 'quota_delta', 'quota_absolute']),
  booleanValue: z.boolean().optional(),
  numericDelta: z.number().int().optional(),
  numericAbsolute: z.number().int().optional(),
  reason: z.string().min(1),
  appliedBy: z.string().min(1),
  expiresAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
});
export type TenantEntitlementOverride = z.infer<typeof TenantEntitlementOverrideSchema>;

/**
 * Tenant Consumption Quota Counter (FR-006, US3)
 */
export const TenantUsageQuotaSchema = z.object({
  id: z.string().min(1),
  orgId: z.string().uuid(),
  quotaKey: CanonicalKeySchema,
  periodAnchor: z.string(), // ISO date '2026-11-01' aligning with billing cycle
  consumedCount: z.number().int().min(0).default(0),
  reservedCount: z.number().int().min(0).default(0),
  effectiveLimit: z.number().int(), // -1 = unlimited
  updatedAt: z.string().datetime(),
});
export type TenantUsageQuota = z.infer<typeof TenantUsageQuotaSchema>;

/**
 * Policy Evaluation Request Context (FR-004)
 */
export const PolicyEvaluationContextSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().min(1),
  featureKey: CanonicalKeySchema.optional(),
  permissionId: z.string().optional(),
  resource: z.object({
    projectId: z.string().optional(),
    assignedUserIds: z.array(z.string()).optional(),
    teamId: z.string().optional(),
    clientId: z.string().optional(),
  }).optional(),
  quotaMetric: z.object({
    key: CanonicalKeySchema,
    amount: z.number().int().min(1).default(1),
  }).optional(),
});
export type PolicyEvaluationContext = z.infer<typeof PolicyEvaluationContextSchema>;

/**
 * Policy Evaluation Result Diagnostics (FR-004)
 */
export interface PolicyEvaluationResult {
  allowed: boolean;
  failedStage?: 'tenant' | 'subscription' | 'rbac' | 'scope' | 'quota';
  reason?: string;
  requiredUpgradeTier?: string;
  effectiveScope?: string;
  quotaRemaining?: number;
}
```

---

## 2. PostgreSQL Relational Schemas & RLS

Located in: `supabase/migrations/00007_saas_subscriptions_and_entitlements.sql`

```sql
-- 1. Subscription Plans Table
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    tagline TEXT NOT NULL DEFAULT '',
    price_monthly_paise BIGINT NOT NULL DEFAULT 0,
    price_annual_paise BIGINT NOT NULL DEFAULT 0,
    is_public BOOLEAN NOT NULL DEFAULT true,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    quotas JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(id, version)
);

-- 2. Tenant Subscriptions Table
CREATE TABLE IF NOT EXISTS public.tenant_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    plan_id TEXT NOT NULL,
    plan_version INTEGER NOT NULL DEFAULT 1,
    cycle TEXT NOT NULL DEFAULT 'monthly' CHECK (cycle IN ('monthly', 'annual')),
    status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN (
        'trial', 'active', 'past_due', 'grace_period', 'paused', 
        'cancelled_at_period_end', 'expired', 'unpaid'
    )),
    current_period_start TIMESTAMPTZ NOT NULL,
    current_period_end TIMESTAMPTZ NOT NULL,
    grace_period_ends_at TIMESTAMPTZ,
    cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
    gateway_customer_id TEXT,
    gateway_subscription_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    FOREIGN KEY (plan_id, plan_version) REFERENCES public.subscription_plans(id, version),
    UNIQUE(org_id)
);

-- 3. Tenant Entitlement Overrides Table
CREATE TABLE IF NOT EXISTS public.tenant_entitlement_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    override_type TEXT NOT NULL CHECK (override_type IN ('feature_toggle', 'quota_delta', 'quota_absolute')),
    boolean_value BOOLEAN,
    numeric_delta INTEGER,
    numeric_absolute INTEGER,
    reason TEXT NOT NULL,
    applied_by TEXT NOT NULL,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. Tenant Usage Quotas Table (Concurrency-Safe Counter)
CREATE TABLE IF NOT EXISTS public.tenant_usage_quotas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    quota_key TEXT NOT NULL,
    period_anchor DATE NOT NULL,
    consumed_count INTEGER NOT NULL DEFAULT 0 CHECK (consumed_count >= 0),
    reserved_count INTEGER NOT NULL DEFAULT 0 CHECK (reserved_count >= 0),
    effective_limit INTEGER NOT NULL DEFAULT -1, -- -1 = unlimited
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    UNIQUE(org_id, quota_key, period_anchor)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenant_sub_org ON public.tenant_subscriptions(org_id);
CREATE INDEX IF NOT EXISTS idx_tenant_overrides_org_key ON public.tenant_entitlement_overrides(org_id, key);
CREATE INDEX IF NOT EXISTS idx_tenant_usage_quotas_lookup ON public.tenant_usage_quotas(org_id, quota_key, period_anchor);

-- Enable Row-Level Security
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_entitlement_overrides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_usage_quotas ENABLE ROW LEVEL SECURITY;

-- RLS: Subscription Plans (Readable by authenticated users)
CREATE POLICY "Subscription plans viewable by authenticated users"
ON public.subscription_plans FOR SELECT TO authenticated USING (true);

-- RLS: Tenant Subscriptions (Tenant isolated)
CREATE POLICY "Tenant subscriptions isolated by org"
ON public.tenant_subscriptions FOR SELECT TO authenticated
USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- RLS: Tenant Overrides (Tenant isolated)
CREATE POLICY "Tenant overrides isolated by org"
ON public.tenant_entitlement_overrides FOR SELECT TO authenticated
USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- RLS: Usage Quotas (Tenant isolated)
CREATE POLICY "Usage quotas isolated by org"
ON public.tenant_usage_quotas FOR ALL TO authenticated
USING (org_id = (auth.jwt() ->> 'org_id')::uuid)
WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- 5. STABLE Security Definer: authorize_policy()
CREATE OR REPLACE FUNCTION public.authorize_policy(
    p_org_id UUID,
    p_feature_key TEXT,
    p_permission TEXT,
    p_project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_sub_status TEXT;
    v_plan_features JSONB;
    v_has_feature BOOLEAN;
    v_rbac_allowed BOOLEAN;
BEGIN
    -- 1. Check Tenant Subscription Status
    SELECT ts.status, sp.features INTO v_sub_status, v_plan_features
    FROM public.tenant_subscriptions ts
    JOIN public.subscription_plans sp ON ts.plan_id = sp.id AND ts.plan_version = sp.version
    WHERE ts.org_id = p_org_id;

    IF v_sub_status IS NULL OR v_sub_status NOT IN ('trial', 'active', 'grace_period') THEN
        RETURN FALSE;
    END IF;

    -- 2. Check Subscription Feature Entitlement (if feature key provided)
    IF p_feature_key IS NOT NULL THEN
        -- Check overrides first
        SELECT boolean_value INTO v_has_feature
        FROM public.tenant_entitlement_overrides
        WHERE org_id = p_org_id AND key = p_feature_key 
          AND (expires_at IS NULL OR expires_at > now())
        ORDER BY created_at DESC LIMIT 1;

        -- Fallback to plan features
        IF v_has_feature IS NULL THEN
            v_has_feature := COALESCE((v_plan_features ->> p_feature_key)::boolean, false);
        END IF;

        IF v_has_feature IS FALSE THEN
            RETURN FALSE;
        END IF;
    END IF;

    -- 3. Check RBAC & Project Scope via authorize() STABLE function
    IF p_permission IS NOT NULL THEN
        v_rbac_allowed := public.authorize(p_org_id, p_permission, p_project_id);
        IF v_rbac_allowed IS FALSE THEN
            RETURN FALSE;
        END IF;
    END IF;

    RETURN TRUE;
END;
$$;
```
