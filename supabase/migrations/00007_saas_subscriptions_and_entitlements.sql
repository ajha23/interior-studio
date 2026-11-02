-- Migration: 00007_saas_subscriptions_and_entitlements.sql
-- Description: Centralized Multi-Tenant SaaS Subscription, Entitlement Registry, and Concurrency-Safe Quotas
-- Governing Authority: Constitution Principle X, Principle III (Integer Paise), Principle VII (RLS)

-- 1. Subscription Plans Table (Commercial Versioned Catalog)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    tagline TEXT NOT NULL DEFAULT '',
    price_monthly_paise BIGINT NOT NULL DEFAULT 0 CHECK (price_monthly_paise >= 0),
    price_annual_paise BIGINT NOT NULL DEFAULT 0 CHECK (price_annual_paise >= 0),
    is_public BOOLEAN NOT NULL DEFAULT true,
    features JSONB NOT NULL DEFAULT '{}'::jsonb,
    quotas JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    PRIMARY KEY (id, version)
);

-- 2. Tenant Subscriptions Table (Active Lifecycle State)
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

-- 3. Tenant Entitlement Overrides Table (Contractual bespoke terms & add-ons)
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

-- 4. Tenant Usage Quotas Table (Concurrency-Safe Counter via Row-Level Locking)
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

-- RLS: Subscription Plans (Readable by all authenticated users)
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
ON public.tenant_usage_quotas FOR SELECT TO authenticated
USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- 5. Unified Policy Evaluation Database Function (FR-004)
-- Evaluates Tenant Valid + Subscription Entitled + RBAC Granted + Quota Remaining
CREATE OR REPLACE FUNCTION public.authorize_policy(
    p_org_id UUID,
    p_user_id UUID,
    p_feature_key TEXT DEFAULT NULL,
    p_permission TEXT DEFAULT NULL,
    p_project_id UUID DEFAULT NULL,
    p_quota_key TEXT DEFAULT NULL,
    p_quota_amount INTEGER DEFAULT 1
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_sub RECORD;
    v_plan RECORD;
    v_is_entitled BOOLEAN := false;
    v_override RECORD;
    v_rbac_allowed BOOLEAN := true;
    v_quota_allowed BOOLEAN := true;
    v_quota_remaining INTEGER := -1;
    v_usage RECORD;
BEGIN
    -- 1. Tenant & Subscription Validity Stage
    SELECT * INTO v_sub FROM public.tenant_subscriptions WHERE org_id = p_org_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'failedStage', 'tenant', 'reason', 'TENANT_SUBSCRIPTION_NOT_FOUND');
    END IF;

    IF v_sub.status IN ('paused', 'expired', 'unpaid') THEN
        RETURN jsonb_build_object('allowed', false, 'failedStage', 'subscription', 'reason', 'SUBSCRIPTION_INACTIVE', 'status', v_sub.status);
    END IF;

    -- Fetch Plan
    SELECT * INTO v_plan FROM public.subscription_plans WHERE id = v_sub.plan_id AND version = v_sub.plan_version;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('allowed', false, 'failedStage', 'subscription', 'reason', 'PLAN_VERSION_NOT_FOUND');
    END IF;

    -- 2. Feature Entitlement Stage (if requested)
    IF p_feature_key IS NOT NULL THEN
        -- Check base plan
        IF (v_plan.features->p_feature_key) IS NOT NULL THEN
            v_is_entitled := (v_plan.features->>p_feature_key)::boolean;
        END IF;

        -- Check active override
        SELECT * INTO v_override FROM public.tenant_entitlement_overrides
        WHERE org_id = p_org_id AND key = p_feature_key
          AND (expires_at IS NULL OR expires_at > timezone('utc'::text, now()))
        ORDER BY created_at DESC LIMIT 1;

        IF FOUND THEN
            IF v_override.override_type = 'feature_toggle' AND v_override.boolean_value IS NOT NULL THEN
                v_is_entitled := v_override.boolean_value;
            END IF;
        END IF;

        IF NOT v_is_entitled THEN
            RETURN jsonb_build_object('allowed', false, 'failedStage', 'subscription', 'reason', 'SUBSCRIPTION_UNENTITLED', 'featureKey', p_feature_key);
        END IF;
    END IF;

    -- 3. RBAC & Resource Scope Stage (if requested)
    IF p_permission IS NOT NULL THEN
        v_rbac_allowed := public.authorize(p_org_id, p_permission, p_project_id);
        IF NOT v_rbac_allowed THEN
            RETURN jsonb_build_object('allowed', false, 'failedStage', 'rbac', 'reason', 'RBAC_PERMISSION_DENIED', 'permission', p_permission);
        END IF;
    END IF;

    -- 4. Quantitative Quota Stage (if requested)
    IF p_quota_key IS NOT NULL THEN
        SELECT * INTO v_usage FROM public.tenant_usage_quotas
        WHERE org_id = p_org_id AND quota_key = p_quota_key
          AND period_anchor = date_trunc('month', v_sub.current_period_start)::date;

        IF FOUND AND v_usage.effective_limit != -1 THEN
            v_quota_remaining := v_usage.effective_limit - (v_usage.consumed_count + v_usage.reserved_count);
            IF v_quota_remaining < p_quota_amount THEN
                RETURN jsonb_build_object('allowed', false, 'failedStage', 'quota', 'reason', 'QUOTA_EXCEEDED', 'quotaRemaining', v_quota_remaining);
            END IF;
        END IF;
    END IF;

    -- All checks satisfied!
    RETURN jsonb_build_object('allowed', true, 'quotaRemaining', v_quota_remaining);
END;
$$;
