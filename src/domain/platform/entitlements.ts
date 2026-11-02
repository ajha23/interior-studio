/**
 * Pure domain logic for Multi-Tenant Entitlements & Subscription Tiers (ENT-01 to ENT-09).
 * Defines commercial plan boundaries, numeric quotas, and boolean feature flags.
 *
 * Rules:
 * - Framework-free TypeScript. Zero React, Three.js, or DOM.
 * - Integer paise for all monetary values (e.g. ₹4,999/mo = 499,900 paise).
 */

export type PlanTier = 'trial' | 'starter' | 'pro' | 'enterprise' | 'inhouse';

export type FeatureKey =
  | 'projects.max_active'
  | 'seats.designers'
  | 'cutlist.export'
  | 'drawings.dxf'
  | 'accounting.export'
  | 'ai.layout'
  | 'custom_rulepack';

export interface PlanFeatures {
  maxActiveProjects: number; // -1 indicates unlimited
  maxDesigners: number;
  cutlistExport: boolean;
  dxfExport: boolean;
  accountingExport: boolean;
  aiLayout: boolean;
  customRulepack: boolean;
}

export interface PlanDefinition {
  id: PlanTier;
  name: string;
  tagline: string;
  priceMonthlyPaise: number;
  priceAnnualPaise: number;
  features: PlanFeatures;
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  trial: {
    id: 'trial',
    name: '14-Day Studio Trial',
    tagline: 'Evaluate Interior Studio with core design tools',
    priceMonthlyPaise: 0,
    priceAnnualPaise: 0,
    features: {
      maxActiveProjects: 5,
      maxDesigners: 1,
      cutlistExport: true,
      dxfExport: false,
      accountingExport: false,
      aiLayout: false,
      customRulepack: false,
    },
  },
  starter: {
    id: 'starter',
    name: 'Starter Studio',
    tagline: 'Ideal for independent modular kitchen designers',
    priceMonthlyPaise: 499900, // ₹4,999 / month
    priceAnnualPaise: 4999000, // ₹49,990 / year
    features: {
      maxActiveProjects: 15,
      maxDesigners: 2,
      cutlistExport: true,
      dxfExport: false,
      accountingExport: false,
      aiLayout: true,
      customRulepack: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro Studio',
    tagline: 'For growing studios with factory CNC production',
    priceMonthlyPaise: 1299900, // ₹12,999 / month
    priceAnnualPaise: 12999000, // ₹129,990 / year
    features: {
      maxActiveProjects: -1, // Unlimited
      maxDesigners: 5,
      cutlistExport: true,
      dxfExport: true,
      accountingExport: true,
      aiLayout: true,
      customRulepack: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise Factory',
    tagline: 'Custom ERP pipelines and multi-factory rule packs',
    priceMonthlyPaise: 2999900, // ₹29,999 / month
    priceAnnualPaise: 29999000, // ₹299,990 / year
    features: {
      maxActiveProjects: -1,
      maxDesigners: 25,
      cutlistExport: true,
      dxfExport: true,
      accountingExport: true,
      aiLayout: true,
      customRulepack: true,
    },
  },
  inhouse: {
    id: 'inhouse',
    name: 'Interior Studio (In-House)',
    tagline: 'Internal production development plan with full unlocked features',
    priceMonthlyPaise: 0,
    priceAnnualPaise: 0,
    features: {
      maxActiveProjects: -1,
      maxDesigners: 100,
      cutlistExport: true,
      dxfExport: true,
      accountingExport: true,
      aiLayout: true,
      customRulepack: true,
    },
  },
};

export interface EntitlementCheckResult {
  allowed: boolean;
  reason?: string;
  currentTier: PlanTier;
  minRequiredTier?: PlanTier;
  limit?: number;
  current?: number;
}

/**
 * Evaluates whether an organization on a given plan is entitled to execute a feature.
 */
export function checkEntitlement(
  tier: PlanTier,
  key: FeatureKey,
  currentCount?: number
): EntitlementCheckResult {
  const plan = PLANS[tier] || PLANS.trial;

  switch (key) {
    case 'projects.max_active': {
      const limit = plan.features.maxActiveProjects;
      const count = currentCount ?? 0;
      if (limit !== -1 && count >= limit) {
        return {
          allowed: false,
          reason: `Project limit reached (${count}/${limit}). Upgrade plan for more active projects.`,
          currentTier: tier,
          minRequiredTier: tier === 'trial' ? 'starter' : 'pro',
          limit,
          current: count,
        };
      }
      return { allowed: true, currentTier: tier, limit, current: count };
    }

    case 'seats.designers': {
      const limit = plan.features.maxDesigners;
      const count = currentCount ?? 0;
      if (count >= limit) {
        return {
          allowed: false,
          reason: `Designer seat limit reached (${count}/${limit}). Upgrade plan to invite more team members.`,
          currentTier: tier,
          minRequiredTier: tier === 'trial' ? 'starter' : 'pro',
          limit,
          current: count,
        };
      }
      return { allowed: true, currentTier: tier, limit, current: count };
    }

    case 'drawings.dxf': {
      if (!plan.features.dxfExport) {
        return {
          allowed: false,
          reason: 'AutoCAD DXF export requires a Pro or Enterprise plan.',
          currentTier: tier,
          minRequiredTier: 'pro',
        };
      }
      return { allowed: true, currentTier: tier };
    }

    case 'accounting.export': {
      if (!plan.features.accountingExport) {
        return {
          allowed: false,
          reason: 'Tally / Zoho Books accounting CSV export requires a Pro or Enterprise plan.',
          currentTier: tier,
          minRequiredTier: 'pro',
        };
      }
      return { allowed: true, currentTier: tier };
    }

    case 'cutlist.export': {
      if (!plan.features.cutlistExport) {
        return {
          allowed: false,
          reason: 'Factory cut-list export requires an active paid plan.',
          currentTier: tier,
          minRequiredTier: 'starter',
        };
      }
      return { allowed: true, currentTier: tier };
    }

    case 'ai.layout': {
      if (!plan.features.aiLayout) {
        return {
          allowed: false,
          reason: 'AI Layout generation requires a Starter or Pro plan.',
          currentTier: tier,
          minRequiredTier: 'starter',
        };
      }
      return { allowed: true, currentTier: tier };
    }

    case 'custom_rulepack': {
      if (!plan.features.customRulepack) {
        return {
          allowed: false,
          reason: 'Custom tenant manufacturing rule packs require an Enterprise plan.',
          currentTier: tier,
          minRequiredTier: 'enterprise',
        };
      }
      return { allowed: true, currentTier: tier };
    }

    default: {
      return { allowed: true, currentTier: tier };
    }
  }
}

